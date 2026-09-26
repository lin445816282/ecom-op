#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""导入抓取的 9 月订单到 orders 表（幂等，order_no 去重）。"""
import json
import sqlite3
import os
from datetime import datetime

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "catalog.db")
JSON_PATH = "/mnt/c/tmp/orders_sep_all.json"
SHOP_ID = 3  # 如若月下

STATUS_MAP = {0: "待发货", 1: "已发货，待收货", 2: "已收货"}

def ts2str(ts):
    try:
        return datetime.fromtimestamp(int(ts)).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return ""

def main():
    data = json.load(open(JSON_PATH, encoding="utf-8"))
    orders = data.get("orders", [])
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    inserted = 0
    skipped = 0
    for o in orders:
        order_no = o.get("order_sn") or ""
        if not order_no:
            continue
        exists = conn.execute(
            "SELECT 1 FROM orders WHERE shop_id=? AND order_no=?", (SHOP_ID, order_no)
        ).fetchone()
        if exists:
            skipped += 1
            continue
        pay_time = ts2str(o.get("order_time"))
        pay_amount = o.get("pay_amount")
        buyer_amount = round(pay_amount / 100, 2) if isinstance(pay_amount, (int, float)) else None
        status = STATUS_MAP.get(o.get("shipping_status"), "待发货")
        conn.execute(
            "INSERT INTO orders(shop_id, order_no, status, quantity, pay_time, platform_product_id, "
            "buyer_amount, province) VALUES(?,?,?,?,?,?,?,?)",
            (SHOP_ID, order_no, status, o.get("goods_number") or 1, pay_time,
             str(o.get("goods_id") or ""), buyer_amount, o.get("province_name") or ""),
        )
        inserted += 1
    conn.commit()
    # 统计结果
    total = conn.execute("SELECT COUNT(*) n FROM orders WHERE shop_id=?", (SHOP_ID,)).fetchone()["n"]
    sep = conn.execute(
        "SELECT COUNT(*) n FROM orders WHERE shop_id=? AND pay_time >= '2026-09-23'", (SHOP_ID,)
    ).fetchone()["n"]
    conn.close()
    print(json.dumps({
        "ok": True, "fetched": len(orders), "inserted": inserted, "skipped_exist": skipped,
        "shop3_total": total, "since_sep23": sep,
    }, ensure_ascii=False))

if __name__ == "__main__":
    main()
