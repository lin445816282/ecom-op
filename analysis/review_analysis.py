#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""评论分析报表生成器 — 复用 catalog.review_analysis() 口径，输出 Markdown 报表。

可重跑：python3 analysis/review_analysis.py
"""
import os
import sys
import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(BASE, "analysis")
OUT = os.path.join(OUT_DIR, "review_report.md")

sys.path.insert(0, BASE)
import catalog


def main():
    catalog.init_db()
    a = catalog.review_analysis()
    total = a["total"]
    neg = a["neg"]

    L = []
    A = L.append
    A("# 商品评论分析报表")
    A("")
    A(f"> 数据范围：拼多多 4 店 · 近 180 天 · 共 {total} 条评价（采集自 ecom-op reviews 表）")
    A("")
    A("## 一、总体概况")
    A("")
    A("| 店铺 | 评价数 | 好评率 | 差评数 | 带图 | 视频 | 差评回复 |")
    A("|---|---|---|---|---|---|---|")
    for s in a["shops"]:
        rate = s["good"] / s["n"] * 100 if s["n"] else 0
        A(f"| {s['name']} | {s['n']} | {rate:.1f}% | {s['neg']} | {s['pic']} | {s['vid']} | {s['replied']} |")
    A("")
    A(f"**整体好评率 {a['good_rate']}%**，差评 {neg['total']} 条（{neg['total']/total*100:.1f}%）。")
    A("")
    A("## 二、星级分布")
    A("")
    A("| 星级 | 数量 | 占比 |")
    A("|---|---|---|")
    for star in [5, 4, 3, 2, 1]:
        n = a["star_dist"].get(star, 0)
        A(f"| {star}星 | {n} | {n/total*100:.1f}% |")
    A("")
    A("## 三、差评专题")
    A("")
    A(f"- 差评总数 **{neg['total']} 条**，其中**有文字可分析 {neg['with_text']} 条**，其余 {neg['no_text']} 条为「未填写文字评价」的低分。")
    if neg["contradict"]:
        A(f"- 其中有文字差评里，**{neg['contradict']} 条是「矛盾评分」**（文字好评但打低分，买家误点星或平台评分规则，非商品问题）。")
    A(f"- **商家回复率 = 0**：{neg['total']} 条差评全部未回复（最大的可操作改进点）。")
    A("")
    if neg["cats"]:
        A("有文字差评的问题归类：")
        A("")
        A("| 问题类型 | 条数 |")
        A("|---|---|")
        for c in neg["cats"]:
            A(f"| {c['type']} | {c['count']} |")
        A("")
    A("### 有文字差评原文")
    A("")
    for r in neg["items"]:
        dt = datetime.datetime.fromtimestamp(r["create_time"]).strftime("%Y-%m-%d") if r["create_time"] else "?"
        A(f"- **[{r['star']}星] {dt}** {r['shop_name']}：{r['comment'].strip()}")
        if r.get("goods_name"):
            A(f"  - 商品：{r['goods_name']} (ID {r['goods_id']})")
    A("")
    A("## 四、好评关键词（真实文字好评，出现次数）")
    A("")
    A("| 维度 | 提及次数 |")
    A("|---|---|")
    for p in a["pos_keywords"]:
        A(f"| {p['dim']} | {p['count']} |")
    A("")
    if a["pos_keywords"]:
        A(f"> 结论：买家最认可「{a['pos_keywords'][0]['dim']}」，核心卖点应前置强化。")
    A("")
    A("## 五、差评集中的商品")
    A("")
    A("| 商品 | 差评数 |")
    A("|---|---|")
    for g in a["neg_goods"]:
        A(f"| {g['goods_name']} (ID {g['goods_id']}) | {g['count']} |")
    A("")
    A("## 六、可操作建议")
    A("")
    for i, s in enumerate(a["suggestions"], 1):
        A(f"{i}. {s}")
    A("")
    A("---")
    A("*报表由 analysis/review_analysis.py 生成（复用 catalog.review_analysis 口径）*")

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print(f"报表已生成: {OUT}")
    print(f"共 {total} 条评价 | 好评率 {a['good_rate']}% | 差评 {neg['total']} 条（有文字 {neg['with_text']}）")


if __name__ == "__main__":
    main()
