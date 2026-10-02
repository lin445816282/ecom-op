# -*- coding: utf-8 -*-
"""AI 老板选品上架：1688 搜索节庆用品 → 选 N 个 → autopublish 上架到闲时来（shop 1）。

AI 老板只管闲时来店（shop_id=1），成功类目是「节庆用品」（气球/婚庆/派对）。
用法：python3 aiboss_select.py [数量] [--dry-run]
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalog

NODE_EXE = "/mnt/d/Program Files/nodejs/node.exe"
# node.exe 是 Windows 程序，脚本路径要用 Windows 盘符
_SEARCH_JS_WIN = r"D:\电商运营\运营工作台\search_1688_home.js"
API_BASE = "http://127.0.0.1:8765"
ACCESS_TOKEN = os.environ.get("ECOM_OP_TOKEN", "Alcz8283103")
CDP_1688_PORT = "9238"
SHOP_ID = 1  # 闲时来（AI 老板只管这家店）

# 选品关键词：来自 AI 选品研究报告（ai_boss_research）的 1688 搜索词，按应季优先级排序。
# 万圣节(10月) → 双11/感恩节 → 圣诞/元旦 → 春节 → 常青款
SELECT_KEYWORDS = [
    # 第一优先级：万圣节（10月窗口期）
    "万圣节装饰品", "万圣节南瓜灯", "万圣节面具", "万圣节披风儿童",
    "万圣节糖果袋", "万圣节灯串", "万圣节蝙蝠挂饰",
    # 第二优先级：双11 + 感恩节
    "秋冬加厚手套", "触屏手套", "圣诞帽", "圣诞袜", "感恩节装饰",
    "婚庆套装", "毛绒抱枕",
    # 第三优先级：圣诞 + 元旦
    "圣诞树套餐", "圣诞装饰球", "圣诞老人服装", "圣诞礼物包装纸",
    "元旦装饰", "圣诞灯串", "新年拉花",
    # 第四优先级：春节
    "春节对联", "福字窗花", "春节红包", "春节灯笼", "春节装饰套装",
    "生肖公仔", "春节拉花",
    # 常青款
    "婚庆气球套装", "婚房布置套装", "仿真花绿植", "秋冬手套",
]

# 相关性过滤：标题含这些词才算本店相关品类（节庆/手套/家居）。过滤 1688 推荐的无关商品
FESTIVAL_WORDS = (
    # 节庆通用
    "气球", "婚庆", "婚房", "婚礼", "喜字", "拉花", "红包", "派对",
    "生日", "布置", "装饰", "铝膜", "铝箔", "礼花", "礼炮", "挂饰",
    "吊饰", "拉旗", "彩旗", "灯笼", "婚宴", "订婚", "周岁", "满月",
    "拱门", "拉花", "彩带",
    # 万圣节
    "万圣", "南瓜", "面具", "披风", "斗篷", "糖果", "蝙蝠", "骷髅",
    "鬼", "女巫", "蜘蛛", "灯串",
    # 圣诞/元旦
    "圣诞", "圣诞树", "圣诞帽", "圣诞袜", "驯鹿", "雪花", "礼物",
    "彩球", "彩灯", "新年", "元旦",
    # 感恩节
    "感恩", "火鸡",
    # 春节
    "春节", "对联", "福字", "窗花", "生肖", "灯笼",
    # 手套/服饰配件
    "手套", "触屏", "保暖", "加绒", "骑行", "毛绒", "围巾", "帽子",
    # 家居饰品
    "抱枕", "桌布", "仿真花", "绿植", "花架", "花盆", "摆件",
)


def search_1688(kw, limit=12):
    """搜索 1688，返回 [{oid, url, txt}]。失败返回空列表。"""
    try:
        r = subprocess.run(
            [NODE_EXE, _SEARCH_JS_WIN, CDP_1688_PORT, kw, str(limit)],
            capture_output=True, text=True, timeout=90,
        )
        lines = [l for l in r.stdout.strip().splitlines() if l.strip()]
        if not lines:
            return []
        items = json.loads(lines[-1])
        if isinstance(items, dict):
            items = items.get("items", [])
        return items if isinstance(items, list) else []
    except Exception:
        return []


def parse_product(txt):
    """从卡片文本解析 (标题, 价格)。"""
    title = (txt or "").strip()
    price = None
    m = re.search(r"¥(\d+\.?\d*)", title)
    if m:
        price = float(m.group(1))
    # 标题：截到「标题链接」前的部分（后面是营销词/销量）
    if "标题链接" in title:
        title = title.split("标题链接")[0]
    title = title.strip()[:60]
    return title, price


def _offer_id(url):
    """从 1688 链接提取 offerId（offer/xxx 或 offerId=xxx），非 1688 返回空字符串。"""
    if not url:
        return ""
    m = re.search(r"/offer/(\d+)", url)
    if m:
        return m.group(1)
    m = re.search(r"offerId=(\d+)", url)
    if m:
        return m.group(1)
    return ""


def select_products(n=5):
    """搜索节庆用品，选 n 个候选商品（去重已上架 + 相关性过滤 + 价格过滤）。"""
    catalog.init_db()
    # 已上架的 offerId 去重（忽略 query 参数，避免 ?spm= 等导致字符串不等）
    existing = set()
    for g in catalog.list_published_goods(limit=500):
        oid = _offer_id((g.get("source_url") or "").strip())
        if oid:
            existing.add(oid)

    candidates = []
    seen = set()
    for kw in SELECT_KEYWORDS:
        if len(candidates) >= n * 4:  # 收集足够候选就停
            break
        for it in search_1688(kw, 12):
            oid = str(it.get("oid") or "")
            url = str(it.get("url") or "")
            if not oid or oid in seen:
                continue
            seen.add(oid)
            if oid in existing:
                continue
            title, price = parse_product(it.get("txt", ""))
            if not title:
                continue
            # 相关性过滤：标题含节庆词
            if not any(w in title for w in FESTIVAL_WORDS):
                continue
            # 价格过滤：0.5~200 元
            if price is not None and (price < 0.5 or price > 200):
                continue
            candidates.append({"oid": oid, "url": url, "title": title,
                               "price": price, "kw": kw})
        # 搜索间隔，降低 1688 x5sec 风控概率（首页搜索路径已较安全，6s 更稳）
        time.sleep(6)

    # 按价格升序（低价利于走量），取前 n 个
    candidates.sort(key=lambda c: c["price"] if c["price"] else 999)
    return candidates[:n]


def publish_products(products):
    """逐个 autopublish 上架到闲时来（shop 1）。返回成功触发数。"""
    ok = 0
    for p in products:
        try:
            req = urllib.request.Request(
                f"{API_BASE}/api/autopublish",
                data=json.dumps({"url": p["url"], "shop_id": SHOP_ID}).encode("utf-8"),
                headers={"Content-Type": "application/json",
                         "Authorization": f"Bearer {ACCESS_TOKEN}"},
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                resp = json.loads(r.read().decode("utf-8"))
            if resp.get("ok"):
                ok += 1
        except Exception as e:
            print(f"  上架失败 {p['oid']}: {e}")
    return ok


def main():
    args = sys.argv[1:]
    n = 5
    dry_run = "--dry-run" in args
    for a in args:
        if a.isdigit():
            n = int(a)

    selected = select_products(n)
    print(json.dumps({"ok": True, "count": len(selected),
                      "products": [{"oid": p["oid"], "title": p["title"],
                                    "price": p["price"], "kw": p["kw"]} for p in selected]},
                     ensure_ascii=False))

    if not dry_run and selected:
        ok = publish_products(selected)
        print(json.dumps({"published": ok}, ensure_ascii=False))


if __name__ == "__main__":
    main()
