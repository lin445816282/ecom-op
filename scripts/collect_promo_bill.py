#!/usr/bin/env python3
"""采集拼多多推广月结账单（发票管理页待开票账单）写入 promo_monthly_bill 表。

用法: python3 collect_promo_bill.py <shop_id>
"""
import sys
import json
import subprocess

sys.path.insert(0, '/mnt/d/电商运营/运营工作台')
import catalog

NODE = "/mnt/d/Program Files/nodejs/node.exe"
JS = r"C:\tmp\fetch_promo_bill.js"
SHOP_CDP_PORT = {3: 9230, 5: 9232, 6: 9228}  # 1=闲时来登录态丢失


def main():
    shop_id = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    port = SHOP_CDP_PORT.get(shop_id)
    if not port:
        print(f"未知 shop_id: {shop_id}（可用: {list(SHOP_CDP_PORT.keys())}）")
        return
    try:
        r = subprocess.run([NODE, JS, str(port)], capture_output=True, text=True, timeout=45)
    except subprocess.TimeoutExpired:
        print(f"shop_id={shop_id} 采集超时（CDP {port} 可能未就绪）")
        return
    out = (r.stdout or '').strip()
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        print(f"shop_id={shop_id} 解析失败: {out[:200]}")
        return
    if not data.get('ok'):
        print(f"shop_id={shop_id} 采集失败: {data.get('err')}")
        return
    # 过滤空账单（bill_period='-' 且金额 0）
    bills = [b for b in data.get('bills', []) if b.get('bill_period') and b['bill_period'] != '-']
    if not bills:
        print(f"shop_id={shop_id} 无有效账单")
        return
    n = catalog.import_promo_monthly_bill(shop_id, bills)
    print(f"✅ shop_id={shop_id} 月结账单入库 {n} 条：")
    for b in bills:
        print(f"  {b['bill_period']} | {b['bill_subject'][:12]} | ¥{b['bill_amount']}")


if __name__ == '__main__':
    main()
