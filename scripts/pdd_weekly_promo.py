#!/usr/bin/env python3
"""拼多多推广数据录入 — 每天录入近 7 日推广数据到 ecom-op promotions 表。

⚠️ 日期填值失效（已知限制）：报表页 DateAreaV2 的日期选择器填值后 ~2s 被 React
重置回「近 7 日」，所以脚本采到的始终是「近 7 日」数据。period 用「近 7 日」实际
起止日期（昨天往前 7 天 ~ 昨天），每天跑一次，period 每天变化 → 数据每天新增。

店铺（4 家）：
- 闲时来工艺 (shop_id=1, 9234)
- 如若月下   (shop_id=3, 9230)
- 嘉裕工艺品 (shop_id=5, 9232)
- OSHIYI欧世艺旗舰店 (shop_id=6, 9228)

用法：python3 pdd_weekly_promo.py   （默认近 7 日）
      python3 pdd_weekly_promo.py 2026/09/18 2026/09/24   （指定日期范围，实际仍采近7日）
"""
import subprocess
import json
import sqlite3
import sys
from datetime import datetime, timedelta

NODE = "/mnt/d/Program Files/nodejs/node.exe"
FETCH_SCRIPT = r"C:\tmp\pdd_report_fetch.js"
DB_PATH = "/mnt/d/电商运营/运营工作台/data/catalog.db"

# 店铺配置：名称 -> (shop_id, CDP端口, Edge profile)
SHOPS = [
    {"name": "闲时来工艺", "shop_id": 1, "port": 9234, "profile": r"C:\tmp\edge-cdp-xsl"},
    {"name": "如若月下", "shop_id": 3, "port": 9230, "profile": r"C:\tmp\edge-cdp-jy"},
    {"name": "嘉裕工艺品", "shop_id": 5, "port": 9232, "profile": r"C:\tmp\edge-cdp-ry"},
    {"name": "OSHIYI欧世艺旗舰店", "shop_id": 6, "port": 9228, "profile": r"C:\tmp\edge-cdp-profile"},
]


def recent_7_range(today=None):
    """返回近 7 日（昨天往前 7 天 ~ 昨天），返回 (斜杠格式, 横杠格式) 两组。

    每天跑一次，period 用近 7 日起止（滚动窗口），数据每天新增（唯一索引不冲突）。
    """
    if today is None:
        today = datetime.now()
    end = today - timedelta(days=1)  # 昨天（当天数据未出全，用昨天截止）
    start = end - timedelta(days=6)  # 昨天往前 6 天 = 共 7 天
    slash_start = start.strftime("%Y/%m/%d")
    slash_end = end.strftime("%Y/%m/%d")
    dash_period = start.strftime("%Y-%m-%d") + "~" + end.strftime("%Y-%m-%d")
    return slash_start, slash_end, dash_period


def fetch_report(port, start, end):
    """调用 node 脚本采集报表页数据，返回 dict。"""
    try:
        r = subprocess.run(
            [NODE, FETCH_SCRIPT, str(port), start, end],
            capture_output=True, text=True, timeout=90,
        )
        out = (r.stdout or "").strip()
        if r.returncode != 0:
            return {"err": f"node 失败: {(r.stderr or '')[:200]}"}
        return json.loads(out)
    except subprocess.TimeoutExpired:
        return {"err": "采集超时（90s）"}
    except Exception as e:
        return {"err": f"异常: {e}"}


def to_num(s):
    try:
        return float(str(s).replace(",", "").replace("%", "").strip() or 0)
    except Exception:
        return 0.0


def ensure_unique_index():
    """确保 promotions 表有 (shop_id, platform_product_id, period) 唯一索引，用于幂等。"""
    conn = sqlite3.connect(DB_PATH)
    try:
        idx = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='promotions' AND name='idx_promo_unique'"
        ).fetchone()
        if not idx:
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_unique ON promotions(shop_id, platform_product_id, period)"
            )
            conn.commit()
    finally:
        conn.close()


def write_promotions(shop_id, period, rows):
    """写 promotions 表（幂等：shop_id + platform_product_id + period 唯一，重复跑覆盖）。"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    written = 0
    try:
        for row in rows:
            pid = (row.get("product_id") or "").strip()
            if not pid:
                continue
            prod = conn.execute(
                "SELECT id, name FROM products WHERE shop_id=? AND platform_product_id=?",
                (shop_id, pid),
            ).fetchone()
            product_id = prod["id"] if prod else None
            name = prod["name"] if prod else (row.get("product_name") or "")

            deal_spend = to_num(row.get("deal_spend"))
            deal_amount = to_num(row.get("deal_amount"))
            actual_roi = to_num(row.get("actual_roi"))
            total_spend = to_num(row.get("total_spend"))
            net_count = int(to_num(row.get("net_deal_count")))
            impressions = int(to_num(row.get("impressions")))
            clicks = int(to_num(row.get("clicks")))

            conn.execute(
                """INSERT INTO promotions(shop_id, product_id, platform_product_id, product_name,
                   scene, plan_name, period, deal_spend, deal_amount, actual_roi, total_spend,
                   net_deal_count, impressions, clicks, metrics, created_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))
                   ON CONFLICT(shop_id, platform_product_id, period) DO UPDATE SET
                     deal_spend=excluded.deal_spend, deal_amount=excluded.deal_amount,
                     actual_roi=excluded.actual_roi, total_spend=excluded.total_spend,
                     net_deal_count=excluded.net_deal_count, impressions=excluded.impressions,
                     clicks=excluded.clicks, metrics=excluded.metrics, created_at=datetime('now','localtime')""",
                (shop_id, product_id, pid, name, "", "", period, deal_spend, deal_amount,
                 actual_roi, total_spend, net_count, impressions, clicks,
                 json.dumps(row, ensure_ascii=False)),
            )
            written += 1
        conn.commit()
    finally:
        conn.close()
    return written


def main():
    ensure_unique_index()

    if len(sys.argv) >= 3:
        slash_start, slash_end = sys.argv[1], sys.argv[2]
        period = slash_start.replace("/", "-") + "~" + slash_end.replace("/", "-")
    else:
        slash_start, slash_end, period = recent_7_range()

    print(f"=== 拼多多推广录入（近7日） ===")
    print(f"时间段：{period}（{slash_start} ~ {slash_end}）\n")

    report_lines = []
    for shop in SHOPS:
        name, shop_id, port = shop["name"], shop["shop_id"], shop["port"]
        print(f"--- [{name}] shop_id={shop_id} (CDP {port}) ---")
        res = fetch_report(port, slash_start, slash_end)
        if "err" in res:
            msg = res["err"]
            print(f"  ❌ {msg}")
            if msg == "NEED_LOGIN":
                print(f"  ⚠️ 需扫码登录「{name}」，脚本暂无法自动采集")
            report_lines.append(f"【{name}】❌ {msg}")
            continue
        data = res.get("data", [])
        if not data:
            print(f"  ⚠️ 无推广数据（可能该店本周无推广或无曝光）")
            report_lines.append(f"【{name}】无推广数据")
            continue
        n = write_promotions(shop_id, period, data)
        total_spend = sum(to_num(d.get("total_spend")) for d in data)
        total_amount = sum(to_num(d.get("deal_amount")) for d in data)
        print(f"  ✅ 录入 {n} 条推广数据；总花费 {total_spend:.2f}，交易额 {total_amount:.2f}")
        report_lines.append(
            f"【{name}】{n} 条推广，总花费 {total_spend:.2f}，交易额 {total_amount:.2f}"
        )

    print("\n=== 汇总 ===")
    print("\n".join(report_lines))


if __name__ == "__main__":
    import sys
    sys.path.insert(0, "/home/xiaolin/.hermes/scripts")
    import notify_task_run as _ntr
    _ntr.run_and_log("promo_daily", main)
