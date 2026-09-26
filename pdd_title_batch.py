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
        headers={"Content-Type": "application/json"},
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
        preview = [{"name": p["name"], "old": p["name"], "new": t} for p, t in zip(picked, titles)]
        print(json.dumps({"ok": True, "dry_run": True, "shop_id": shop_id, "items": preview}, ensure_ascii=False))
        return

    ids = []
    for p, t in zip(picked, titles):
        rid = catalog.add_title_opt(shop_id, p["platform_product_id"])
        if rid and rid > 0:
            catalog.save_title_opt_baseline(rid)  # 自动基线：改标题前快照近7天流量
            catalog.update_title_opt(rid, new_title=t, status="optimized")
            ids.append(rid)

    if ids:
        res = apply_ids(ids)
        print(json.dumps({"ok": True, "shop_id": shop_id, "picked": len(ids), "apply": res}, ensure_ascii=False))
    else:
        print(json.dumps({"ok": False, "error": "无可写入的商品"}, ensure_ascii=False))


if __name__ == "__main__":
    import sys
    sys.path.insert(0, "/home/xiaolin/.hermes/scripts")
    import notify_task_run as _ntr
    _ntr.run_and_log(_ntr.shop_task_key("title_opt_shop"), main)
