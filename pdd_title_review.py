#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""标题优化复盘：对已生效(status=done)商品抓近7天流量，按固定规则判断是否再次修改标题。

规则（固定，2026-09-25 定）：
  1. 近7天成交 > 0            → 保留（标题有效，不再改）
  2. 近7天成交 = 0 且 UV 翻倍(≥2×基线) → 保留（引流成功、转化不行，问题在价格/详情页）
  3. 近7天成交 = 0 且 UV 未翻倍     → 再改（每商品上限 2 轮）

用法：
  python3 pdd_title_review.py [--shop 5] [--dry-run] [--apply]
  --dry-run  只输出判断清单，不改动
  --apply    对「需再改」商品触发 AI 二次优化 + 执行更新到拼多多

依赖：catalog（同目录）、pdd_title_batch（gen_titles/load_api_key/apply_ids）。
"""
import json
import os
import sqlite3
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalog
from pdd_title_batch import gen_titles, load_api_key, apply_ids

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "catalog.db")
MAX_ROUND = 2  # 每商品最多改 2 轮


def near7(conn, platform_product_id, days=7):
    """汇总近 N 天访问明细（UV/PV/成交）。"""
    since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    row = conn.execute(
        "SELECT COALESCE(SUM(goods_uv),0) AS uv, COALESCE(SUM(goods_pv),0) AS pv, "
        "COALESCE(SUM(pay_ordr_cnt),0) AS pay_cnt, COALESCE(SUM(pay_ordr_amt),0) AS amt "
        "FROM goods_effect WHERE platform_product_id=? AND stat_date>=?",
        (platform_product_id, since),
    ).fetchone()
    return dict(row)


def round_cnt(conn, platform_product_id):
    """已改标题轮数 = title_opt_log 里 optimize 动作次数。"""
    return conn.execute(
        "SELECT COUNT(*) FROM title_opt_log WHERE platform_product_id=? AND action='optimize'",
        (platform_product_id,),
    ).fetchone()[0]


def judge(baseline, n7):
    """返回 (decision, reason)。decision ∈ keep_conv / keep_uv / rework / keep_watch"""
    if n7["pay_cnt"] > 0:
        return "keep_conv", f"成交 {n7['pay_cnt']} 单"
    bl_uv = (baseline or {}).get("uv") or 0
    if bl_uv > 0:
        if n7["uv"] >= 2 * bl_uv:
            return "keep_uv", f"UV 翻倍（基线 {bl_uv} → 近7天 {n7['uv']}）"
        return "rework", f"UV 未翻倍（基线 {bl_uv} → 近7天 {n7['uv']}）"
    # 无基线：绝对判断
    if n7["uv"] == 0:
        return "rework", "近7天 0 流量"
    return "keep_watch", f"无基线，近7天 UV {n7['uv']}（观察）"


def main():
    args = sys.argv[1:]
    shop_id = 5
    dry_run = "--dry-run" in args
    do_apply = "--apply" in args
    i = 0
    while i < len(args):
        if args[i] == "--shop" and i + 1 < len(args):
            shop_id = int(args[i + 1])
            i += 2
            continue
        i += 1

    catalog.init_db()
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row

    # 数据闸门：该店 goods_effect 覆盖天数不足 7 天时，复盘不可信（近7天=0流量是数据缺失，非标题无效）
    data_days = conn.execute(
        "SELECT COUNT(DISTINCT stat_date) FROM goods_effect WHERE shop_id=?", (shop_id,)
    ).fetchone()[0]
    if data_days < 7 and do_apply:
        print(json.dumps({
            "ok": False, "skip": "data_not_enough",
            "msg": f"该店访问明细仅积累 {data_days} 天（需 7 天），暂不执行再次修改，避免误判",
        }, ensure_ascii=False))
        return

    done = conn.execute(
        "SELECT * FROM title_opt WHERE shop_id=? AND status='done' ORDER BY id", (shop_id,)
    ).fetchall()

    report = []
    rework_rows = []
    for r in done:
        baseline = json.loads(r["baseline"]) if r["baseline"] else {}
        n7 = near7(conn, r["platform_product_id"])
        rc = round_cnt(conn, r["platform_product_id"])
        decision, reason = judge(baseline, n7)
        item = {
            "id": r["id"], "pid": r["platform_product_id"], "name": (r["product_name"] or "")[:20],
            "round": rc, "decision": decision, "reason": reason,
            "n7_uv": n7["uv"], "n7_pay": n7["pay_cnt"],
        }
        report.append(item)
        if decision == "rework" and rc < MAX_ROUND:
            rework_rows.append(r)

    # 汇总输出
    keep_conv = sum(1 for x in report if x["decision"] == "keep_conv")
    keep_uv = sum(1 for x in report if x["decision"] == "keep_uv")
    keep_watch = sum(1 for x in report if x["decision"] == "keep_watch")
    rework = sum(1 for x in report if x["decision"] == "rework")
    print(json.dumps({
        "ok": True, "shop_id": shop_id, "done_total": len(done),
        "keep_conv": keep_conv, "keep_uv": keep_uv, "keep_watch": keep_watch,
        "rework_candidate": rework, "rework_actual": len(rework_rows),
        "rework_list": [
            {"pid": r["platform_product_id"], "name": (r["product_name"] or "")[:24],
             "round": round_cnt(conn, r["platform_product_id"])}
            for r in rework_rows
        ],
    }, ensure_ascii=False))

    if not do_apply or not rework_rows:
        return

    # --apply：对需再改的商品，AI 二次优化 + 执行
    api_key = load_api_key()
    if not api_key:
        print(json.dumps({"ok": False, "error": "无 DEEPSEEK_API_KEY"}, ensure_ascii=False))
        return
    products = [{"name": (r["new_title"] or r["old_title"] or "")} for r in rework_rows]
    try:
        titles = gen_titles(products, api_key)
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"AI 生成失败:{e}"}, ensure_ascii=False))
        return
    if len(titles) != len(rework_rows):
        print(json.dumps({"ok": False, "error": "AI 返回标题数不一致"}, ensure_ascii=False))
        return

    ids = []
    for r, t in zip(rework_rows, titles):
        catalog.update_title_opt(r["id"], new_title=t, status="optimized")
        ids.append(r["id"])
    res = apply_ids(ids)
    print(json.dumps({"ok": True, "reworked": len(ids), "apply": res}, ensure_ascii=False))


if __name__ == "__main__":
    import sys
    sys.path.insert(0, "/home/xiaolin/.hermes/scripts")
    import notify_task_run as _ntr
    _ntr.run_and_log("title_review", main)
