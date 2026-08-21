# -*- coding: utf-8 -*-
"""电商运营 CLI：批量导入/导出、指标计算与快捷任务。"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys

import data


def cmd_import(path: str):
    if not os.path.exists(path):
        print(f"文件不存在：{path}")
        sys.exit(1)
    added = 0
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        col = {c.strip(): c for c in (reader.fieldnames or [])}
        def pick(row, *names):
            for n in names:
                if n in col and row.get(col[n], "").strip() != "":
                    return row[col[n]].strip()
            return ""
        for row in reader:
            name = pick(row, "商品名", "名称", "name") or "未命名商品"
            def num(*names, default=0.0):
                v = pick(row, *names)
                try:
                    return float(v) if v != "" else default
                except Exception:
                    return default
            def integer(*names):
                v = pick(row, *names)
                try:
                    return int(float(v)) if v != "" else 0
                except Exception:
                    return 0
            item = {
                "id": pick(row, "ID", "id") or "",
                "name": name,
                "selling_price": num("到手售价", "售价", "selling_price"),
                "gross_profit": num("单件毛利", "毛利", "gross_profit"),
                "ad_cost": num("单件广告花费", "ad_cost", default=0),
                "refund_rate": num("售后率", "refund_rate", default=0.15),
                "ad_spend": num("周期广告花费", "广告花费", "ad_spend", default=0),
                "orders": integer("周期订单数", "订单数", "orders"),
                "impressions": integer("曝光", "展现量", "impressions"),
                "clicks": integer("点击", "点击量", "clicks"),
                "sold": integer("成交件数", "销量", "sold"),
                "notes": pick(row, "备注", "notes"),
            }
            data.add_product(item)
            added += 1
    print(f"导入完成：{added} 条，保存至 {data.DB_PATH}")


def cmd_export(path: str):
    items = data.load_products()
    if not items:
        print("暂无产品数据。")
        return
    fields = ["ID", "商品名", "到手售价", "单件毛利", "利润率", "售后率", "保本投产比",
              "目标投产比", "单件广告花费", "周期广告花费", "周期订单数", "曝光", "点击",
              "成交件数", "点击率", "转化率", "每日建议预算", "备注"]
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(fields)
        for p in items:
            pr = data.Product.from_dict(p)
            cm = pr.click_metrics()
            w.writerow([
                p.get("id", ""), p.get("name", ""), pr.selling_price, pr.gross_profit,
                round(pr.margin, 4), pr.refund_rate, pr.break_even_roi, pr.target_roi,
                pr.ad_cost, pr.ad_spend, pr.orders, pr.impressions, pr.clicks, pr.sold,
                cm["ctr"], cm["cvr"], pr.suggested_daily_budget, p.get("notes", ""),
            ])
    print(f"导出完成：{len(items)} 条 -> {path}")


def cmd_show():
    items = data.load_products()
    if not items:
        print("暂无产品数据。")
        return
    print(f"{'ID':<8} {'商品名':<14} {'到手价':>8} {'毛利':>8} {'利润率':>8} "
          f"{'保本ROI':>9} {'目标ROI':>9}")
    for p in items:
        pr = data.Product.from_dict(p)
        print(f"{p.get('id',''):<8} {p.get('name','')[:12]:<14} "
              f"{pr.selling_price:>8.2f} {pr.gross_profit:>8.2f} {pr.margin:>8.2%} "
              f"{pr.break_even_roi:>9.3f} {pr.target_roi:>9.3f}")


def cmd_reset():
    if os.path.exists(data.DB_PATH):
        os.remove(data.DB_PATH)
    fixtures = [
        {"id": "p1", "name": "示例商品 A", "selling_price": 29.9, "gross_profit": 9.0,
         "ad_cost": 6.0, "refund_rate": 0.20, "ad_spend": 120.0, "orders": 10,
         "impressions": 5000, "clicks": 250, "sold": 12, "notes": "测试数据"},
    ]
    data.save_products(fixtures)
    print("已重置为示例数据。")

def main():
    ap = argparse.ArgumentParser(description="电商运营工作台 CLI")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("import", help="从 CSV 导入商品").add_argument("path")
    sub.add_parser("export", help="导出计算后的 CSV").add_argument("path")
    sub.add_parser("show", help="显示商品指标")
    sub.add_parser("reset", help="重置为示例数据")
    args = ap.parse_args()

    if args.cmd == "import":
        cmd_import(args.path)
    elif args.cmd == "export":
        cmd_export(args.path)
    elif args.cmd == "show":
        cmd_show()
    elif args.cmd == "reset":
        cmd_reset()


if __name__ == "__main__":
    main()
