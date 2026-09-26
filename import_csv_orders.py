#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""导入导出的自定义报表 CSV 到 orders 表（如若月下 shop_id=3，幂等）。"""
import csv
import sqlite3
import os
import json

DB = "/mnt/d/电商运营/运营工作台/data/catalog.db"
CSV_PATH = "/mnt/c/tmp/custom_export.csv"
SHOP_ID = 3  # 如若月下

def clean(v):
    """清理字段值：去制表符、空格、引号。"""
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
    rows = []
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        for line in reader:
            if len(line) < 16:
                continue
            rows.append({
                "order_no": clean(line[0]),
                "status": clean(line[1]),
                "quantity": to_int(line[2]),
                "pay_time": clean(line[3]),
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
    # 过滤空订单号
    rows = [r for r in rows if r["order_no"]]
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    # product_id 关联
    pid_map = dict(conn.execute(
        "SELECT platform_product_id, id FROM products WHERE shop_id=?", (SHOP_ID,)
    ).fetchall())
    inserted = 0
    updated = 0
    for r in rows:
        pid = pid_map.get(r["platform_product_id"])
        existed = conn.execute(
            "SELECT 1 FROM orders WHERE order_no=?", (r["order_no"],)
        ).fetchone()
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
            (SHOP_ID, r["order_no"], r["status"], r["quantity"], r["pay_time"], r["confirm_time"],
             pid, r["platform_product_id"], r["spec"], r["aftersale_status"], r["buyer_amount"],
             r["seller_amount"], r["tracking_no"], r["courier"], r["province"], r["city"],
             r["district"], r["source"]),
        )
        if existed:
            updated += 1
        else:
            inserted += 1
    conn.commit()
    total = conn.execute("SELECT COUNT(*) n FROM orders WHERE shop_id=?", (SHOP_ID,)).fetchone()["n"]
    # 各状态分布
    dist = conn.execute(
        "SELECT status, COUNT(*) n FROM orders WHERE shop_id=? GROUP BY status ORDER BY n DESC",
        (SHOP_ID,),
    ).fetchall()
    conn.close()
    print(json.dumps({
        "ok": True, "csv_rows": len(rows), "inserted": inserted, "updated": updated,
        "shop3_total": total, "status_dist": [{"status": d["status"], "n": d["n"]} for d in dist],
    }, ensure_ascii=False))

if __name__ == "__main__":
    main()
