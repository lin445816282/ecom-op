#!/usr/bin/env python3
"""词库清洗：三类噪声移 black(标记不删)，让词库数据本身干净。

1) 黑名单词（品牌/跨品类/灯具/颜色）
2) 纯英文词（不含中文，中文标题不用）
3) 「其他」品类的【核心词】(杂项名词，如水龙头/手机/鸡蛋)——园艺延伸词(花/鸟/喂/绿植)保留归园艺

⚠️ 「其他」品类的属性词/卖点词(不锈钢/塑料/防水/可折叠等通用词)不碰，避免误伤。

用法:
  python3 ai_clean_keywords.py            # 执行清洗
  python3 ai_clean_keywords.py --stats    # 只看统计, 不写库
"""
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import data

# 园艺延伸词特征（「其他」品类核心词里含这些字 → 保留，重新归园艺）
GARDEN_HINT = ("花", "鸟", "喂", "绿", "植", "仿真", "盆景", "花卉", "饲料", "食槽", "水培", "园艺")


def is_cjk(w: str) -> bool:
    return any("\u4e00" <= c <= "\u9fff" for c in w)


def main():
    stats_only = "--stats" in sys.argv
    items = data.load_keywords()
    noise = data.GOLDEN_NOISE

    before = dict(Counter(k.get("pool_type") for k in items))

    moved = 0
    regraded = 0
    for k in items:
        if k.get("pool_type") == "black":
            continue
        w = (k.get("word") or "").strip()
        # 1. 黑名单词 → black
        if w in noise:
            k["pool_type"] = "black"; k["status"] = "禁用"
            k["notes"] = "清洗:品牌/跨品类/灯具/颜色"; moved += 1; continue
        # 2. 纯英文（不含中文）→ black
        if w and not is_cjk(w):
            k["pool_type"] = "black"; k["status"] = "禁用"
            k["notes"] = "清洗:纯英文"; moved += 1; continue
        # 3. 「其他」品类【核心词】杂项 → black（园艺延伸词保留归园艺）
        if k.get("product") == "其他" and k.get("category") == "核心词":
            if any(h in w for h in GARDEN_HINT):
                k["product"] = "园艺"
                k["notes"] = "清洗:其他→园艺"
                regraded += 1
            else:
                k["pool_type"] = "black"; k["status"] = "禁用"
                k["notes"] = "清洗:其他品类杂项核心词"; moved += 1

    if stats_only:
        print("=== 统计模式(不写库) ===")
        print(f"待移 black: {moved} 词, 重新归园艺: {regraded} 词")
    else:
        data.save_keywords(items)
        print(f"已移 black: {moved} 词, 重新归园艺: {regraded} 词")

    after = dict(Counter(k.get("pool_type") for k in items))
    prod = dict(Counter(k.get("product") for k in items if k.get("pool_type") != "black"))
    print(f"清洗前 pool: {before}")
    print(f"清洗后 pool: {after}")
    print(f"清洗后非black词 product 分布: {prod}")
    print(f"总词量: {len(items)}")


if __name__ == "__main__":
    main()
