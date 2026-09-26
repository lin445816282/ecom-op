#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""每月自动导出上月订单并导入 orders 表（如若月下 shop_id=3）。

流程：node CDP 脚本走批量导出 → 等报表生成 → 拿下载 URL → 下载 CSV → 过滤上月 → 导入。
导出用「近3个月」范围（默认，不改日期），导入时按 pay_time 过滤上月。
"""
import csv
import json
import os
import sqlite3
import subprocess
import sys
import urllib.request
from datetime import datetime

NODE = "/mnt/d/Program Files/nodejs/node.exe"
JS = r"C:\tmp\pdd_export_orders.js"
RESULT_JSON = r"C:\tmp\pdd_export_result.json"
RESULT_JSON_WSL = "/mnt/c/tmp/pdd_export_result.json"
CSV_PATH = "/mnt/c/tmp/monthly_orders.csv"
DB = "/mnt/d/电商运营/运营工作台/data/catalog.db"
SHOP_ID = 3  # 默认如若月下
CDP_PORT = 9230

# 店铺映射：shop_id -> CDP 端口
SHOP_CDP_PORT = {3: 9230, 5: 9232, 1: 9234, 6: 9228}

def last_month_range():
    """返回 (上月1日 00:00, 本月1日 00:00) 字符串，用于 pay_time 过滤。"""
    now = datetime.now()
    # 本月1日
    this_month_first = datetime(now.year, now.month, 1)
    # 上月1日
    if now.month == 1:
        last_month_first = datetime(now.year - 1, 12, 1)
    else:
        last_month_first = datetime(now.year, now.month - 1, 1)
    return last_month_first.strftime("%Y-%m-%d 00:00:00"), this_month_first.strftime("%Y-%m-%d 00:00:00")

def clean(v):
    if v is None:
        return ""
    return str(v).strip().strip("\t").strip()

def to_int(v):
    v = clean(v)
    if not v:
        return 0
    try:
        return int(float(v))
    except Exception:
        return 0

def to_float(v):
    v = clean(v)
    if not v:
        return None
    try:
        return round(float(v), 2)
    except Exception:
        return None

def main():
    shop_id = int(sys.argv[1]) if len(sys.argv) > 1 else SHOP_ID
    cdp_port = SHOP_CDP_PORT.get(shop_id, CDP_PORT)
    start, end = last_month_range()
    log = {"month_start": start, "month_end": end, "steps": []}

    # 1. 调 node 脚本导出（后台，等报表生成，最多 ~15 分钟）
    log["steps"].append("node 导出中")
    try:
        r = subprocess.run(
            [NODE, JS, str(cdp_port), RESULT_JSON],
            capture_output=True, text=True, timeout=900,
        )
        stdout = (r.stdout or "").strip()
        log["steps"].append("node 输出: " + stdout[:300])
    except subprocess.TimeoutExpired:
        print(json.dumps({"ok": False, "err": "node 超时(15分钟)"}, ensure_ascii=False))
        return

    # 2. 读下载 URL
    result = {}
    if os.path.exists(RESULT_JSON_WSL):
        try:
            result = json.load(open(RESULT_JSON_WSL, encoding="utf-8"))
        except Exception:
            pass
    download_url = result.get("downloadUrl")
    job_id = result.get("jobId")
    if not download_url:
        print(json.dumps({"ok": False, "err": "无下载URL", "result": result}, ensure_ascii=False))
        return
    log["jobId"] = job_id

    # 3. 下载 CSV
    try:
        req = urllib.request.Request(download_url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = resp.read()
        with open(CSV_PATH, "wb") as f:
            f.write(data)
        log["csv_bytes"] = len(data)
    except Exception as e:
        print(json.dumps({"ok": False, "err": "下载CSV失败: " + str(e)}, ensure_ascii=False))
        return

    # 4. 解析 CSV + 过滤上月 + 导入
    rows = []
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        for line in reader:
            if len(line) < 16:
                continue
            pay_time = clean(line[3])
            # 过滤上月（pay_time 在上月范围内）
            if not (start <= pay_time < end):
                continue
            rows.append({
                "order_no": clean(line[0]),
                "status": clean(line[1]),
                "quantity": to_int(line[2]),
                "pay_time": pay_time,
                "confirm_time": clean(line[4]),
                "platform_product_id": clean(line[5]),
                "spec": clean(line[6]),
                "aftersale_status": clean(line[7]),
                "buyer_amount": to_float(line[8]),
                "seller_amount": to_float(line[9]),
                "tracking_no": clean(line[10]),
                "courier": clean(line[11]),
                "province": clean(line[12]),
                "city": clean(line[13]),
                "district": clean(line[14]),
                "source": clean(line[15]),
            })
    rows = [r for r in rows if r["order_no"]]
    log["month_rows"] = len(rows)

    if not rows:
        print(json.dumps({"ok": True, "err": None, "imported": 0, "log": log}, ensure_ascii=False))
        return

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    pid_map = dict(conn.execute(
        "SELECT platform_product_id, id FROM products WHERE shop_id=?", (shop_id,)
    ).fetchall())
    inserted = 0
    updated = 0
    for r in rows:
        pid = pid_map.get(r["platform_product_id"])
        existed = conn.execute("SELECT 1 FROM orders WHERE order_no=?", (r["order_no"],)).fetchone()
        conn.execute(
            "INSERT INTO orders(shop_id, order_no, status, quantity, pay_time, confirm_time, "
            "product_id, platform_product_id, spec, aftersale_status, buyer_amount, "
            "seller_amount, tracking_no, courier, province, city, district, source) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
            "ON CONFLICT(order_no) DO UPDATE SET status=excluded.status, "
            "product_id=CASE WHEN excluded.product_id IS NOT NULL THEN excluded.product_id ELSE orders.product_id END, "
            "buyer_amount=excluded.buyer_amount, seller_amount=excluded.seller_amount, "
            "province=excluded.province, city=excluded.city, district=excluded.district, "
            "source=excluded.source, aftersale_status=excluded.aftersale_status, spec=excluded.spec, "
            "tracking_no=CASE WHEN excluded.tracking_no != '' THEN excluded.tracking_no ELSE orders.tracking_no END, "
            "courier=CASE WHEN excluded.courier != '' THEN excluded.courier ELSE orders.courier END, "
            "confirm_time=CASE WHEN excluded.confirm_time != '' THEN excluded.confirm_time ELSE orders.confirm_time END",
            (shop_id, r["order_no"], r["status"], r["quantity"], r["pay_time"], r["confirm_time"],
             pid, r["platform_product_id"], r["spec"], r["aftersale_status"], r["buyer_amount"],
             r["seller_amount"], r["tracking_no"], r["courier"], r["province"], r["city"],
             r["district"], r["source"]),
        )
        if existed:
            updated += 1
        else:
            inserted += 1
    conn.commit()
    total = conn.execute("SELECT COUNT(*) n FROM orders WHERE shop_id=?", (shop_id,)).fetchone()["n"]
    conn.close()

    log["inserted"] = inserted
    log["updated"] = updated
    log["shop_total"] = total
    print(json.dumps({
        "ok": True, "month_start": start, "month_end": end,
        "month_rows": len(rows), "inserted": inserted, "updated": updated,
        "shop_total": total, "jobId": job_id,
    }, ensure_ascii=False))

if __name__ == "__main__":
    import sys
    sys.path.insert(0, "/home/xiaolin/.hermes/scripts")
    import notify_task_run as _ntr
    _shop = sys.argv[1] if len(sys.argv) > 1 else "5"
    _ntr.run_and_log(f"order_export_shop{_shop}", main)
