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


def gen_titles(products, api_key):
    """调 DeepSeek 批量生成优化标题，返回 [新标题] 列表（按输入顺序）。"""
    names = [p["name"] for p in products]
    prompt = (
        "你是拼多多电商标题优化专家。以下是 N 个商品的当前标题，请为每个生成优化后的标题。\n"
        "规则：\n"
        "1. 核心品词前置，删无意义前缀（品牌名/新款/买X送X/【】等营销词）\n"
        "2. 补长尾搜索词（场景词、人群词、规格词、材质词），用空格分隔 3-4 段核心词\n"
        "3. 总长度不超过 30 个汉字（60 字符）\n"
        "4. 不夸大、不违规、保留商品真实属性\n"
        "5. 只输出 JSON 数组，每项是优化后的标题字符串，严格按输入顺序\n\n"
        f"商品列表：\n{json.dumps(names, ensure_ascii=False)}\n\n"
        '输出格式（仅 JSON 数组，不要任何其他文字）：["标题1","标题2",...]'
    )
    body = {
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "max_tokens": 2000,
    }
    req = urllib.request.Request(
        DEEPSEEK_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        resp = json.loads(r.read().decode("utf-8"))
    content = resp["choices"][0]["message"]["content"].strip()
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[-1].rsplit("```", 1)[0]
    start, end = content.find("["), content.rfind("]")
    if start < 0 or end < 0:
        raise RuntimeError(f"AI 返回非 JSON: {content[:200]}")
    arr = json.loads(content[start:end + 1])
    return [str(x).strip()[:60] for x in arr]  # 截断到 60 字符（30 汉字）


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
    for i, a in enumerate(args):
        if a.isdigit():
            count = int(a)
        if a == "--shop" and i + 1 < len(args):
            shop_id = int(args[i + 1])

    catalog.init_db()
    cands = catalog.title_opt_candidates(shop_id)
    cands.sort(key=lambda c: c["sku_count"], reverse=True)
    picked = cands[:count]
    if not picked:
        print(json.dumps({"ok": False, "error": "无候选商品"}, ensure_ascii=False))
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
            catalog.update_title_opt(rid, new_title=t, status="optimized")
            ids.append(rid)

    if ids:
        res = apply_ids(ids)
        print(json.dumps({"ok": True, "shop_id": shop_id, "picked": len(ids), "apply": res}, ensure_ascii=False))
    else:
        print(json.dumps({"ok": False, "error": "无可写入的商品"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
