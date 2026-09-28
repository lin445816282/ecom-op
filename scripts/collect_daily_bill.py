#!/usr/bin/env python3
# 采集拼多多推广「日账单」流水明细，入库 promo_daily_bill
# 用法: python3 collect_daily_bill.py <shop_id> [startDate] [endDate]
# 默认 2026-06-01 ~ 2026-09-28
import sys, subprocess, json, os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import catalog

NODE = "/mnt/d/Program Files/nodejs/node.exe"
FETCH_JS = r"C:\tmp\fetch_daily_bill.js"
SHOP_CDP_PORT = {3: 9230, 5: 9232, 6: 9228}  # 如若月下/嘉裕/欧世艺

def main():
    shop_id = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    start = sys.argv[2] if len(sys.argv) > 2 else "2026-06-01"
    end = sys.argv[3] if len(sys.argv) > 3 else "2026-09-28"
    port = SHOP_CDP_PORT.get(shop_id)
    if not port:
        print(f"[ERR] 未知 shop_id={shop_id}")
        return
    r = subprocess.run([NODE, FETCH_JS, str(port), start, end], capture_output=True, text=True, timeout=180)
    out = r.stdout.strip()
    try:
        data = json.loads(out)
    except Exception:
        print(f"[ERR] 解析失败: {out[:200]}")
        return
    if not data.get("ok"):
        print(f"[ERR] 采集失败: {data.get('err')}")
        return
    rows = data.get("rows", [])
    summary = data.get("summary", {})
    # 字段映射：node 的 time/txnId/fundType/flowType → DB 的 flow_time/transaction_id/fund_type/flow_type
    db_rows = [{
        "flow_time": r.get("time", ""),
        "transaction_id": r.get("txnId", ""),
        "fund_type": r.get("fundType"),
        "flow_type": r.get("flowType"),
        "amount": r.get("amount"),
        "balance": r.get("balance"),
        "brief": r.get("brief", ""),
        "summary": r.get("summary", ""),
    } for r in rows]
    n = catalog.import_promo_daily_bill(shop_id, db_rows)
    print(f"[OK] shop_id={shop_id} 采集 {len(rows)} 条，新增入库 {n} 条")
    print(f"     汇总: 收入 {summary.get('incomeAmount')} ({summary.get('incomeCount')}笔) / 支出 {summary.get('spendAmount')} ({summary.get('spendCount')}笔)")

if __name__ == "__main__":
    main()
