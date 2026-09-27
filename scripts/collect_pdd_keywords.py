#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""拼多多买家端筛选词采集 → 回填关键词库。

从搜索结果页抓「材质/风格/摆放类别」筛选词，分类回填：
  材质 → 属性词，风格 → 风格词，摆放类别 → 场景词

用法:
  python3 collect_pdd_keywords.py [--limit N]   # 只跑前 N 个核心词（默认全量）
断点续传：已采集的词记录在 data/supplier_pdd_kw_progress.json
"""
import sys
import os
import json
import time
import subprocess

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import data

BASE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(BASE)
CORE_FILE = os.path.join(PROJECT, "data", "supplier_core_words.json")
PROGRESS_FILE = os.path.join(PROJECT, "data", "supplier_pdd_kw_progress.json")

NODE = "/mnt/d/Program Files/nodejs/node.exe"
FETCH_JS = r"C:\tmp\fetch_pdd_keywords.js"
PORT = "9236"


def fetch_words(keyword):
    """调 node 抓拼多多筛选词，返回词列表（按 DOM 顺序）。"""
    try:
        r = subprocess.run(
            [NODE, FETCH_JS, PORT, keyword],
            capture_output=True, timeout=60,
        )
        out = r.stdout.decode("utf-8", errors="replace").strip()
        for line in out.splitlines():
            line = line.strip()
            if line.startswith("["):
                return json.loads(line)
        return []
    except Exception:
        return []


# 分组标题特征词（含这些词的短文本是「标题」而非选项词）
TITLE_HINTS = (
    "材质", "结构", "是否", "支持", "特点", "场景", "类型", "方式", "分类",
    "颜色", "规格", "尺寸", "产地", "地区", "定制", "整装", "风格", "类别",
    "摆放", "放置", "配送", "功能", "安装", "产品", "发货", "服务", "品牌",
)


def classify(words):
    """按「材质/风格/场景」标题分段，只抓三类标题下的短选项词（过滤分组标题）。"""
    result = {"属性词": [], "风格词": [], "场景词": []}
    current = None
    for w in words:
        w = (w or "").strip()
        if not w:
            continue
        # 识别三类目标标题
        if "材质" in w and len(w) <= 5:
            current = "属性词"
        elif "风格" in w and len(w) <= 5:
            current = "风格词"
        elif ("场景" in w or "类别" in w or "摆放" in w or "放置" in w) and len(w) <= 6:
            current = "场景词"
        # 其他分组标题 → 忽略其后续选项
        elif any(h in w for h in TITLE_HINTS) and len(w) <= 6:
            current = None
        # 长词（标题/描述）→ 忽略
        elif len(w) > 6:
            current = None
        # 当前在三类标题下 → 归入对应 category
        elif current:
            result[current].append(w)
    return result


def main():
    limit = None
    args = sys.argv[1:]
    if "--limit" in args:
        i = args.index("--limit")
        if i + 1 < len(args):
            limit = int(args[i + 1])

    if not os.path.exists(CORE_FILE):
        print("先跑 collect_supplier_keywords.py extract 生成核心词")
        return
    core_words = json.load(open(CORE_FILE, encoding="utf-8"))
    if limit:
        core_words = core_words[:limit]

    done = set(json.load(open(PROGRESS_FILE, encoding="utf-8"))) if os.path.exists(PROGRESS_FILE) else set()
    todo = [w for w in core_words if w not in done]
    print(f"核心词 {len(core_words)} 个，已完成 {len(done)}，待采集 {len(todo)}")
    if not todo:
        print("全部完成")
        return

    added = 0
    # 一次性加载关键词库到内存，避免每个词都读写整个 JSON
    all_items = data.load_keywords()
    existing_words = {k.get("word") for k in all_items}
    for i, word in enumerate(todo, 1):
        words = fetch_words(word)
        classified = data.ai_classify_keywords(words, word) or classify(words)
        for cat, wlist in classified.items():
            for w in wlist:
                if w in existing_words:
                    continue
                existing_words.add(w)
                all_items.append({
                    "word": w, "category": cat, "source": "拼多多筛选词",
                    "status": "待用", "notes": f"核心词:{word}", "hot": "中",
                    "product": "供应商商品", "shop": "拼多多",
                    "pool_type": "spare", "weight": 4,
                    "relevance": data.classify_keyword(w, cat, "供应商商品"),
                })
                added += 1
        done.add(word)
        json.dump(sorted(done), open(PROGRESS_FILE, "w", encoding="utf-8"), ensure_ascii=False)
        # 每 5 个词落盘一次（断点续传）
        if i % 5 == 0:
            data.save_keywords(all_items)
        n_total = sum(len(v) for v in classified.values())
        if i % 10 == 0 or i == len(todo):
            print(f"[{i}/{len(todo)}] {word} 采 {n_total} 词，累计新增 {added}")
        time.sleep(2.5)
    data.save_keywords(all_items)

    print(f"\n✅ 完成：新增 {added} 个关键词，共采集 {len(todo)} 个核心词")


if __name__ == "__main__":
    main()
