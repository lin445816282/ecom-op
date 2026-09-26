# -*- coding: utf-8 -*-
"""批量标题优化：挑 N 个无订单商品 → AI 生成优化标题 → 写入 → 执行更新到拼多多。

用法:
  python3 pdd_title_batch.py [count] [--dry-run] [--shop 5]
  --dry-run: 只生成标题预览，不写入不执行（打印 JSON 预览）
默认挑 SKU 最多的前 N 个候选商品（无订单、未优化）。
"""
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalog

API_BASE = "http://127.0.0.1:8765"
ACCESS_TOKEN = os.environ.get("ECOM_OP_TOKEN", "Alcz8283103")
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"


def load_api_key():
    env = os.path.expanduser("~/.keys.env")
    key = ""
    if os.path.exists(env):
        for line in open(env, encoding="utf-8"):
            line = line.strip()
            if line.startswith("DEEPSEEK_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
    return key or os.environ.get("DEEPSEEK_API_KEY", "")


def gbk_len(s):
    """按 GBK 字符数计算标题长度（1 汉字=2 字符，1 英文/数字/符号=1 字符）。"""
    try:
        return len(s.encode("gbk"))
    except Exception:
        return len(s)


def cut_title(s, limit=60):
    """按 GBK 字符数截断到 limit 字符（60 字符 = 30 汉字），避免截断半个汉字。"""
    try:
        b = s.encode("gbk")
    except Exception:
        return s[:limit]
    if len(b) <= limit:
        return s
    cut = b[:limit]
    try:
        return cut.decode("gbk")
    except UnicodeDecodeError:
        return cut[:-1].decode("gbk", "ignore")


# ===== 质量门：拦截 AI 偷懒/负优化标题 =====
import re as _re

# 营销噪音词（无搜索价值，删掉算优化）
JUNK_SET = {
    "新款", "特价", "包邮", "正品", "清仓", "促销", "爆款", "热卖", "秒杀",
    "抢购", "限时", "优惠", "折扣", "批发", "厂家直销", "工厂直供",
    "厂家", "直销", "直供", "大促", "包邮款", "特价款", "福利",
}
JUNK_PAT = _re.compile(r"买\d+送\d+|买一送一|买二送一|买一赠一")


# 广告违禁词/极限词（广告法 + 平台规则，命中直接拦截）
FORBIDDEN_WORDS = (
    # 极限词（绝对化用语）
    "第一", "首个", "首选", "唯一", "独家", "独一无二", "绝无仅有", "空前绝后",
    "顶级", "极致", "极品", "至尊", "巅峰", "王牌", "领袖", "冠军", "无敌",
    "国家级", "世界级", "全球级", "国际级", "驰名商标", "免检", "国家免检",
    "百分百", "100%", "绝对", "永久", "纯天然", "零风险", "无副作用", "无添加",
    "最低价", "最便宜", "全网最低", "全国最低", "史上最低", "抄底", "秒杀价",
    "最佳", "最优", "最高", "最大", "最先进", "最新科技",
    # 医疗功效词（普通商品禁用）
    "治疗", "治愈", "杀菌", "消毒", "消炎", "抗菌", "抑菌", "防癌", "抗癌",
    "防辐射", "保健", "疗效", "根治", "药效", "医用", "医学", "医生推荐", "专家推荐",
    "降压", "降糖", "减肥", "瘦身", "丰胸", "壮阳", "祛痘", "美白",
    # 平台违禁词
    "假一赔十", "支持专柜验货", "原价", "特供", "专供", "领导品牌", "政府指定",
)


def check_forbidden(title):
    """检查标题是否含违禁词，返回命中列表。"""
    t = title or ""
    return [w for w in FORBIDDEN_WORDS if w in t]


def _tokenize(title):
    """切词，返回 (有效词set, 垃圾词set)。"""
    t = JUNK_PAT.sub(" ", title or "")
    parts = _re.split(r"[\s·,，、/|\\【】\[\]（）()]+", t)
    valid, junk = set(), set()
    for w in parts:
        w = w.strip()
        if len(w) < 2:
            continue
        if _re.fullmatch(r"[\d\W_]+", w):
            continue
        if w in JUNK_SET:
            junk.add(w)
        else:
            valid.add(w)
    return valid, junk


def quality_gate(old, new):
    """判断新标题是否真优化。返回 (passed: bool, reason: str)。

    放行：补了有效长尾词，或删了营销噪音词。
    拦截：只加空格/调序，或净减了核心词。
    """
    old, new = (old or "").strip(), (new or "").strip()
    if not new or new == old:
        return False, "标题未变"
    # 违禁词红线（最优先，命中直接拦截）
    fb = check_forbidden(new)
    if fb:
        return False, "含违禁词:" + "/".join(fb[:3])
    # 去空格/标点后字符完全一致 = 仅加空格/标点（偷懒，拦截）
    if _re.sub(r"[\s·,，、/|\\【】\[\]（）()]+", "", old) == _re.sub(r"[\s·,，、/|\\【】\[\]（）()]+", "", new):
        return False, "仅加空格/标点"
    ov, oj = _tokenize(old)
    nv, nj = _tokenize(new)
    added = nv - ov            # 新增有效词
    removed_junk = oj - nj     # 删掉的垃圾词
    lost_valid = ov - nv       # 删掉的有效词
    if added:
        return True, f"补长尾词{len(added)}个"
    if removed_junk and not lost_valid:
        return True, f"删营销词{len(removed_junk)}个"
    if lost_valid:
        return False, f"净减核心词{len(lost_valid)}个"
    return False, "仅格式调整"


def gen_titles(products, api_key):
    """调 DeepSeek 批量生成优化标题，返回 [新标题] 列表（按输入顺序）。分批 15 个/次，避免输出超限。"""
    titles = []
    for i in range(0, len(products), 15):
        chunk = products[i:i + 15]
        titles.extend(_gen_titles_chunk(chunk, api_key))
    return titles


def _gen_titles_chunk(products, api_key):
    names = [p["name"] for p in products]
    prompt = (
        "你是拼多多电商标题优化专家。以下是 N 个商品的当前标题，请为每个生成优化后的标题。\n"
        "规则：\n"
        "1. 核心品词前置，删无意义前缀（品牌名/新款/买X送X/【】等营销词）\n"
        "2. 补长尾搜索词（场景词、人群词、规格词、材质词），用空格分隔 3-4 段核心词\n"
        "3. 总长度不超过 60 个字符（即 30 个汉字；英文/数字/空格算 1 字符，汉字算 2 字符）\n"
        "4. 不夸大、不违规、保留商品真实属性\n"
        "5. 只输出 JSON 数组，每项是优化后的标题字符串，严格按输入顺序\n\n"
        f"商品列表：\n{json.dumps(names, ensure_ascii=False)}\n\n"
        '输出格式（仅 JSON 数组，不要任何其他文字）：["标题1","标题2",...]'
    )
    body = {
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "max_tokens": 4000,
    }
    req = urllib.request.Request(
        DEEPSEEK_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        resp = json.loads(r.read().decode("utf-8"))
    content = resp["choices"][0]["message"]["content"].strip()
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[-1].rsplit("```", 1)[0]
    start, end = content.find("["), content.rfind("]")
    if start < 0 or end < 0:
        raise RuntimeError(f"AI 返回非 JSON: {content[:200]}")
    arr = json.loads(content[start:end + 1])
    return [cut_title(str(x).strip()) for x in arr]  # 按 GBK 60 字符（30 汉字）截断


def apply_ids(ids):
    """调后端 apply API 触发执行更新（后台异步，立即返回）。"""
    req = urllib.request.Request(
        f"{API_BASE}/api/catalog/title-opt/apply",
        data=json.dumps({"ids": ids}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {ACCESS_TOKEN}"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    count = 10
    shop_id = 5
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--shop" and i + 1 < len(args):
            shop_id = int(args[i + 1])
            i += 2
            continue
        if a.isdigit():
            count = int(a)
        i += 1

    catalog.init_db()
    cands = catalog.title_opt_candidates(shop_id)
    cands.sort(key=lambda c: c["sku_count"], reverse=True)
    picked = cands[:count]
    # 重新核对订单：有出单的跳过（订单数据动态更新，执行前再拦一道）
    picked = [p for p in picked if not catalog.has_order(shop_id, p["platform_product_id"])]
    if not picked:
        print(json.dumps({"ok": False, "error": "无候选商品（均已出单或已挑完）"}, ensure_ascii=False))
        return

    api_key = load_api_key()
    if not api_key:
        print(json.dumps({"ok": False, "error": "无 DEEPSEEK_API_KEY"}, ensure_ascii=False))
        return

    try:
        titles = gen_titles(picked, api_key)
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"AI 生成失败:{e}"}, ensure_ascii=False))
        return

    if len(titles) != len(picked):
        print(json.dumps({"ok": False, "error": f"AI 返回标题数 {len(titles)} != 商品数 {len(picked)}"}, ensure_ascii=False))
        return

    if dry_run:
        preview = []
        for p, t in zip(picked, titles):
            passed, reason = quality_gate(p["name"], t)
            preview.append({"name": p["name"], "old": p["name"], "new": t,
                            "gate": ("PASS:" if passed else "BLOCK:") + reason})
        print(json.dumps({"ok": True, "dry_run": True, "shop_id": shop_id, "items": preview}, ensure_ascii=False))
        return

    ids = []
    blocked = []
    for p, t in zip(picked, titles):
        passed, reason = quality_gate(p["name"], t)
        if not passed:
            # 拦截：写入 title_opt 标记 blocked（避免反复挑中），不执行更新
            rid = catalog.add_title_opt(shop_id, p["platform_product_id"])
            if rid and rid > 0:
                catalog.update_title_opt(rid, status="blocked", note=f"质量门拦截:{reason}")
            blocked.append({"id": p["platform_product_id"], "reason": reason})
            continue
        rid = catalog.add_title_opt(shop_id, p["platform_product_id"])
        if rid and rid > 0:
            catalog.save_title_opt_baseline(rid)  # 自动基线：改标题前快照近7天流量
            catalog.update_title_opt(rid, new_title=t, status="optimized")
            ids.append(rid)

    if ids:
        res = apply_ids(ids)
        print(json.dumps({"ok": True, "shop_id": shop_id, "picked": len(ids),
                          "blocked": len(blocked), "blocked_detail": blocked, "apply": res}, ensure_ascii=False))
    else:
        print(json.dumps({"ok": False, "error": "全部被质量门拦截，无可写入商品", "blocked": blocked}, ensure_ascii=False))


if __name__ == "__main__":
    import sys
    sys.path.insert(0, "/home/xiaolin/.hermes/scripts")
    import notify_task_run as _ntr
    _ntr.run_and_log(_ntr.shop_task_key("title_opt_shop"), main)
