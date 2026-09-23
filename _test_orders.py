# -*- coding: utf-8 -*-
"""测试各平台订单表头识别（normalize_header + _parse_table_rows）。"""
import import_catalog as ic
import catalog

BASE = '/mnt/c/Users/小林/Desktop/2'

cases = [
    ('小红书', '小红书-OSHIYI欧世艺的店/5fb06964-3e01-4e3f-8f1f-46da2e3ce139.xlsx', 'xlsx'),
    ('微信', '微信-嘉裕工艺品/微信小店订单_wx577e7c3cbac85631_2026年09月23日17时25分58秒_1.xlsx', 'xlsx'),
    ('淘宝', '淘宝-嘉裕工艺品/订单.xlsx', 'xlsx'),
    ('抖音', '抖音-OSHIYI欧世艺厦门嘉裕工艺品有限公司专卖店/订单信息.csv', 'csv'),
    ('拼多多', '嘉裕工艺品/嘉裕工艺品_订单.csv', 'csv'),
]

import os
for name, rel, typ in cases:
    p = os.path.join(BASE, rel)
    if typ == 'xlsx':
        rows = ic.read_sheet_rows(p)
    else:
        rows = ic._read_csv_rows(p)
    if not rows:
        print(f'[{name}] 空')
        continue
    col_map = catalog.normalize_header('orders', rows[0])
    parsed = catalog._parse_table_rows('orders', rows)
    # 只显示关键字段的映射
    keys = ['订单号', '商品id', '商品规格', '售后状态', '用户实付金额(元)', '商家实收金额(元)', '省', '市', '区', '快递单号', '快递公司', '支付时间']
    mapped = {k: col_map.get(k) for k in keys if k in col_map}
    print(f'[{name}] 表头列数={len(rows[0])} 解析={len(parsed)} 行')
    print(f'  映射: {mapped}')
    if parsed:
        r = parsed[0]
        print(f'  首行: order_no={r.get("order_no")!r} status={r.get("status")!r} quantity={r.get("quantity")} buyer={r.get("buyer_amount")} seller={r.get("seller_amount")} province={r.get("province")!r} spec={r.get("spec")!r}')
    print()
