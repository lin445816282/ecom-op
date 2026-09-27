#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""按供应商商品名称批量采集 1688 联想词 → 回填关键词库。

用法：
  python3 collect_supplier_keywords.py extract   # 阶段1：AI 提炼核心词 → data/supplier_core_words.json
  python3 collect_supplier_keywords.py collect   # 阶段2：读核心词 → 1688 采集 → 回填（断点续传）
"""
import sys
import os
import json
import time
import sqlite3

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import data

BASE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(BASE)
CORE_FILE = os.path.join(PROJECT, "data", "supplier_core_words.json")
PROGRESS_FILE = os.path.join(PROJECT, "data", "supplier_kw_progress.json")
DB = os.path.join(PROJECT, "data", "catalog.db")

HOT_WEIGHT = {"热": 6, "中": 4, "长尾": 3}


def load_supplier_names():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    names = [r["product_name"] for r in db.execute(
        "SELECT product_name FROM supplier_products "
        "WHERE product_name IS NOT NULL AND product_name != ''")]
    db.close()
    return names


def extract():
    names = load_supplier_names()
    print(f"供应商商品名: {len(names)} 个")
    print("AI 提炼品类核心词中（约 5-8 分钟）…")
    cores = data.ai_extract_core_words(names, batch=40)

    # 过滤空 + 去重，保留 (核心词 -> 原始商品名示例)
    core_map = {}
    for n, c in zip(names, cores):
        c = (c or "").strip()
        if c and len(c) >= 2:
            core_map.setdefault(c, n)
    core_words = sorted(core_map.keys())
    json.dump(core_words, open(CORE_FILE, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"提炼出核心词: {len(core_words)} 个（去重后），已存 {CORE_FILE}")
    print("\n样本（前 60 个）:")
    for w in core_words[:60]:
        print(f"  {w}")


def collect():
    if not os.path.exists(CORE_FILE):
        print("先跑 extract 生成核心词文件")
        return
    core_words = json.load(open(CORE_FILE, encoding="utf-8"))
    done = set(json.load(open(PROGRESS_FILE, encoding="utf-8"))) if os.path.exists(PROGRESS_FILE) else set()
    todo = [w for w in core_words if w not in done]
    print(f"核心词 {len(core_words)} 个，已完成 {len(done)}，待采集 {len(todo)}")

    if not todo:
        print("全部完成")
        return

    # 确保 1688 CDP + 登录态
    if not data._edge_cdp_alive():
        data._start_edge_cdp()
        if not data._edge_cdp_alive():
            print("❌ Edge CDP 9222 启动失败")
            return
    data._navigate_1688(todo[0])
    ok, err = data._check_1688_login()
    if not ok:
        print(f"❌ {err}")
        return

    added = 0
    for i, word in enumerate(todo, 1):
        try:
            sugs = data._collect_1688_suggest(word)
        except Exception as e:
            print(f"[{i}/{len(todo)}] {word} 采集异常 {e}")
            sugs = []
        for w, rank in sugs:
            hot = data._hot_of(rank)
            # 已存在则跳过（不覆盖现有词）
            existing = [k for k in data.load_keywords() if k.get("word") == w]
            if existing:
                continue
            data.add_keyword({
                "word": w, "category": "长尾词", "source": "1688联想词",
                "status": "待用", "notes": f"核心词:{word}", "hot": hot,
                "product": "供应商商品", "shop": "拼多多",
                "pool_type": "spare", "weight": HOT_WEIGHT.get(hot, 3),
            })
            added += 1
        done.add(word)
        json.dump(sorted(done), open(PROGRESS_FILE, "w", encoding="utf-8"),
                  ensure_ascii=False)
        if i % 10 == 0 or i == len(todo):
            print(f"[{i}/{len(todo)}] {word} 采 {len(sugs)} 联想词，累计新增 {added}")
        time.sleep(1.0)

    print(f"\n✅ 完成：新增 {added} 个关键词，共采集 {len(todo)} 个核心词")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "extract"
    if mode == "extract":
        extract()
    elif mode == "collect":
        collect()
    else:
        print("用法: extract | collect")
