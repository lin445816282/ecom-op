#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""拼多多搜索关键词采集：搜索核心词 → 采集筛选词+商品标题 → jieba 拆词 → 灌进 ecom-op 关键词库。

用法: python3 pdd_collect_keywords.py [--dry-run]
依赖: node.exe + C:\\tmp\\pdd_collect_filters2.js（9236 买家端 CDP）+ jieba
"""
import subprocess
import json
import time
import urllib.request
import sys
import io
import os
import re

import jieba

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

NODE = "/mnt/d/Program Files/nodejs/node.exe"
COLLECT_JS = r"C:\tmp\pdd_collect_filters2.js"
KEYWORDS_URL = "http://127.0.0.1:8765/api/keywords"
ACCESS_TOKEN = os.environ.get("ECOM_OP_TOKEN", "Alcz8283103")

CORE_WORDS = [
    # 门后挂钩/收纳（如若月下品类）
    "门后挂钩", "挂衣钩", "挂衣架", "衣钩", "门后收纳",
    "收纳架", "免打孔挂钩", "挂架", "置物架", "粘钩",
    # 园艺装饰（嘉裕主营品类）
    "花盆", "花架", "花器", "花桶", "花几", "花篮",
    "庭院装饰", "庭院花架", "铁艺花架", "铁艺花盆",
    "多肉花盆", "绿植花盆", "壁挂花盆", "爬藤架", "花台",
    "花凳", "园艺摆件", "铁艺摆件", "喂鸟器", "烛台",
    # 家居收纳（补充）
    "收纳盒", "收纳筐", "收纳篮", "鞋架", "鞋柜",
    "壁挂收纳", "浴室收纳", "厨房收纳", "桌面收纳",
]

# 营销噪音词（标题尾部无搜索价值，拆词时过滤）
NOISE = {
    "本店", "已拼", "券后", "立减", "退货", "包运费", "限件", "清仓",
    "批发", "即将", "恢复", "原价", "秒退", "未发货", "全店", "总售",
    "万元", "元起", "包邮", "包邮款", "特价", "新品", "热卖", "秒杀",
    "新款", "免打孔",  # 免打孔其实有价值，先保留为词，这里不滤
}

# 筛选维度 → category 映射
DIM_CATEGORY = {
    "材质": "属性词", "风格": "风格词", "摆放类别": "场景词",
    "热门品牌": "品牌词", "适用场景": "场景词", "安装方式": "属性词",
    "承重": "规格词", "颜色": "属性词", "表面工艺": "属性词",
    "适用场合": "场景词", "功能": "卖点词",
}


def collect(word):
    """调 node 采集搜索结果页筛选词 + 标题，返回 dict。"""
    try:
        r = subprocess.run([NODE, COLLECT_JS, word], capture_output=True, text=True, timeout=60)
        return json.loads(r.stdout)
    except Exception as e:
        print(f"  采集失败 {word}: {e}", file=sys.stderr)
        return {"filters": [], "titles": []}


def clean_title(t):
    """去掉标题尾部的营销文案。"""
    t = re.split(r"(券后|立减|退货|限件|即将|本店|立减|未发货)", t)[0]
    return t.strip()


def is_valid_word(w):
    """判断是否为有效词：2-6 字、非纯数字符号、非噪音。"""
    w = w.strip()
    if not (2 <= len(w) <= 6):
        return False
    if re.fullmatch(r"[\d\W_]+", w):
        return False
    if w in NOISE:
        return False
    return True


def extract_words(data):
    """从采集结果拆词，返回 [(word, category), ...]。"""
    words = {}
    # 1. 商品标题拆词（jieba）
    for title in data.get("titles", []):
        t = clean_title(title)
        for w in jieba.cut(t):
            if is_valid_word(w):
                # 核心词本身标「核心词」，其余标长尾词
                words[w] = "核心词" if w in CORE_WORDS else "长尾词"
    # 2. 筛选维度值（材质/风格/摆放等）
    for f in data.get("filters", []):
        m = re.match(r"(材质|风格|摆放类别|热门品牌|适用场景|安装方式|承重|颜色|表面工艺|适用场合|功能)(.+)", f)
        if not m:
            continue
        dim, vals = m.group(1), m.group(2).replace("更多", "").replace("确认", "")
        cat = DIM_CATEGORY.get(dim, "属性词")
        for v in jieba.cut(vals):
            if is_valid_word(v):
                # 维度值用更精确的 category（材质词/风格词等）
                words[v] = cat
    return words


def post_keyword(word, category, hot, notes):
    item = {"word": word, "category": category, "source": "拼多多标题拆词",
            "status": "待用", "notes": notes, "hot": hot}
    data = json.dumps(item).encode("utf-8")
    req = urllib.request.Request(
        KEYWORDS_URL, data=data, method="POST",
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {ACCESS_TOKEN}",
                 "User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.read()


def main():
    dry = "--dry-run" in sys.argv
    all_words = {}  # word -> {category, freq}
    for word in CORE_WORDS:
        data = collect(word)
        words = extract_words(data)
        for w, cat in words.items():
            if w in all_words:
                all_words[w]["freq"] += 1
            else:
                all_words[w] = {"category": cat, "freq": 1}
        print(f"[{word}] 标题{len(data.get('titles', []))} 筛选{len(data.get('filters', []))} → 累计词{len(all_words)}")
        time.sleep(1.5)

    print(f"\n共 {len(all_words)} 个去重词")

    if dry:
        print("=== DRY-RUN 预览（前 60 词）===")
        for i, (w, v) in enumerate(sorted(all_words.items(), key=lambda x: -x[1]["freq"])[:60]):
            print(f"  {w} [{v['category']}] x{v['freq']}")
        return

    added, failed = 0, 0
    for w, v in all_words.items():
        hot = "热" if v["freq"] >= 3 else ("中" if v["freq"] >= 2 else "长尾")
        try:
            post_keyword(w, v["category"], hot, f"拼多多搜索出现{v['freq']}次")
            added += 1
        except Exception as e:
            failed += 1
    print(f"\n入库 {added} 个词，失败 {failed} 个")


if __name__ == "__main__":
    main()
