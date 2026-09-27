#!/usr/bin/env python3
"""采集拼多多推广账户财务数据（余额 + 花费）写入 promo_finance 表。

用法: python3 collect_promo_finance.py <shop_id>
  shop_id: 1=闲时来 3=如若月下 5=嘉裕 6=欧世艺
"""
import sys
import json
import subprocess

sys.path.insert(0, '/mnt/d/电商运营/运营工作台')
import catalog

NODE = "/mnt/d/Program Files/nodejs/node.exe"
JS = r"C:\tmp\fetch_promo_finance.js"
SHOP_CDP_PORT = {3: 9230, 5: 9232, 6: 9228}  # 1=闲时来登录态丢失(待恢复扫码)


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
    n = catalog.import_promo_finance(shop_id, data)
    print(f"✅ shop_id={shop_id} 财务快照入库 {n} 条 | "
          f"余额={data.get('total_balance')} 今日花费={data.get('today_spend')} "
          f"昨日花费={data.get('yesterday_spend')}")


if __name__ == '__main__':
    main()
