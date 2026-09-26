#!/usr/bin/env python3
"""拼多多推广跟踪 — 抓取 9 条稳定成本推广数据，输出报告给 cron 运营决策。

依赖：
- Windows Edge CDP (127.0.0.1:9222)，通过 node.exe 调用 cdp_eval.js
- 9 条推广的商品 ID 硬编码于此
"""
import subprocess
import json
import time
import os
import sys
import urllib.request
from datetime import datetime

NODE = "/mnt/d/Program Files/nodejs/node.exe"
CDP_SCRIPT = r"C:\tmp\cdp_eval.js"
HISTORY_FILE = os.path.expanduser("~/.hermes/pdd_promotion_history.json")

# 9 条推广：商品ID -> (拼单价, 当前目标投产比)
PRODUCTS = [
    ("620947981768", "19.80", "3.79", "门后挂钩免打孔强力衣钩"),
    ("250423264",    "11.30", "3.79", "【加粗加厚】门后挂衣钩"),
    ("63360840",     "7.54",  "3.10", "免钉门后挂钩挂衣衣架"),
    ("661208654127", "28.82", "3.16", "门后挂钩打孔墙上挂衣架"),
    ("661208505980", "29.99", "3.79", "挂钩特价宿舍"),
    ("661208432308", "29.90", "3.79", "门后挂钩卧室卫生间"),
    ("661208407257", "13.52", "3.79", "打孔挂衣钩门后挂钩"),
    ("661202839190", "12.50", "3.79", "商品661202839190"),
    ("318070950662", "12.90", "3.79", "商品318070950662"),
]

# 保本 ROI（40% 利润率）
BREAKEVEN_ROI = 2.5


def cdp(js, timeout=30, retries=3):
    """通过 node.exe 调用 CDP 执行 JS，返回 result.value（带重试，应对 WSL vsock 间歇性失败）"""
    for attempt in range(retries):
        try:
            r = subprocess.run(
                [NODE, CDP_SCRIPT], input=js, capture_output=True, text=True, timeout=timeout
            )
            if r.returncode == 0:
                d = json.loads(r.stdout)
                return d["result"].get("value") if "result" in d else None
        except Exception:
            pass
        if attempt < retries - 1:
            time.sleep(2)
    return None


def cd_ok():
    """CDP 是否可用"""
    return cdp("'ping'") == "ping"


def search(pid):
    return cdp(f'''(() => {{
      const input = document.querySelector('input[placeholder*="商品 ID"]') || document.querySelector('input.anq-input');
      if (!input) return 'NO_INPUT';
      const ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      ns.call(input, '{pid}');
      input.dispatchEvent(new Event('input', {{bubbles:true}}));
      input.dispatchEvent(new KeyboardEvent('keydown', {{key:'Enter', keyCode:13, bubbles:true}}));
      return 'OK';
    }})()''')


def clear_search():
    return cdp('''(() => {
      const input = document.querySelector('input[placeholder*="商品 ID"]') || document.querySelector('input.anq-input');
      if (!input) return 'NO_INPUT';
      const ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      ns.call(input, '');
      input.dispatchEvent(new Event('input', {bubbles:true}));
      input.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', keyCode:13, bubbles:true}));
      return 'OK';
    })()''')


def read_row(pid):
    """读指定商品的数据行，返回 {exp, click, cost, trade, roi, orders}"""
    js = f'''(() => {{
      const tables = document.querySelectorAll('table');
      const dataTable = tables[tables.length - 1];
      const rows = [...dataTable.querySelectorAll('tr')];
      const row = rows.find(r => (r.innerText||'').includes('{pid}'));
      if (!row) return JSON.stringify({{err:'NO_ROW'}});
      const tds = [...row.querySelectorAll('td')];
      const g = i => tds[i] ? (tds[i].innerText||'').trim() : '';
      return JSON.stringify({{
        exp: g(32), click: g(33), cost: g(5), trade: g(6),
        roi: g(7), orders: g(25)
      }});
    }})()'''
    v = cdp(js)
    if not v:
        return None
    try:
        return json.loads(v)
    except Exception:
        return None


def fetch_all():
    """抓取 9 条数据（带轮询重试，处理虚拟滚动渲染延迟）"""
    results = []
    for pid, price, target, name in PRODUCTS:
        sr = search(pid)
        if sr == 'NO_INPUT':
            # 页面没有搜索框：大概率已掉登录态或不在推广管理页，继续等只会超时
            print("⚠️ 页面无搜索框（可能已掉登录态/不在推广管理页），终止抓取。")
            results.append({"id": pid, "name": name, "price": price,
                            "target": target, "err": "NO_INPUT（页面不对/未登录）"})
            break
        # 轮询等行渲染出来（最多 16 秒，虚拟滚动 + 置顶行渲染慢）
        d = None
        for _ in range(8):
            time.sleep(2.0)
            d = read_row(pid)
            if d and "err" not in d:
                break
        if d and "err" not in d:
            results.append({
                "id": pid, "name": name, "price": price,
                "target": target,
                "exp": d.get("exp", "0"), "click": d.get("click", "0"),
                "cost": d.get("cost", "0"), "trade": d.get("trade", "0"),
                "roi": d.get("roi", "0"), "orders": d.get("orders", "0"),
            })
        else:
            results.append({"id": pid, "name": name, "price": price,
                            "target": target, "err": str(d)})
        time.sleep(0.5)
    clear_search()
    return results


def to_num(s):
    try:
        return float(str(s).replace("%", "").strip() or 0)
    except Exception:
        return 0.0


def load_history():
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_history(snapshot):
    hist = load_history()
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    hist[ts] = snapshot
    # 只保留最近 30 次
    keys = sorted(hist.keys())
    if len(keys) > 30:
        for k in keys[:-30]:
            del hist[k]
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(hist, f, ensure_ascii=False, indent=2)


ECOM_OP_TASKS_URL = "https://www.ct256.cn/ecom-op/api/tasks"
ACCESS_TOKEN = os.environ.get("ECOM_OP_TOKEN", "Alcz8283103")


def write_sop_task(results, totals, date_str):
    """把当日推广数据写入 ecom-op 的 SOP 任务，方便后续跟踪管理"""
    checklist = [
        {"text": f"曝光 {int(totals['exp'])} / 点击 {int(totals['click'])}", "done": False},
        {"text": f"花费 {totals['cost']:.2f} / 交易额 {totals['trade']:.2f} / 成交 {int(totals['orders'])} 单", "done": False},
    ]
    if totals["cost"] > 0:
        roi = totals["trade"] / totals["cost"]
        if totals["trade"] > 0:
            flag = "⚠️低于保本" if roi < BREAKEVEN_ROI else ("✅健康" if roi > 3.0 else "观察")
            checklist.append({"text": f"整体实际ROI {roi:.2f}（保本 {BREAKEVEN_ROI}）{flag}", "done": False})
        else:
            checklist.append({"text": f"冷启动中：花费 {totals['cost']:.2f}，暂无成交", "done": False})
    # 有数据的商品单列
    for r in results:
        if "err" in r:
            continue
        exp = to_num(r["exp"]); cost = to_num(r["cost"])
        if exp > 0 or cost > 0:
            roi = to_num(r["roi"])
            checklist.append({
                "text": f"{r['name'][:12]}：曝光{int(exp)} 花费{cost:.2f} ROI{roi:.2f}",
                "done": False,
            })
    # 零曝光商品（连续关注项）
    zero_exp = [r["name"][:10] for r in results if "err" not in r and to_num(r["exp"]) == 0]
    if zero_exp:
        checklist.append({"text": f"零曝光 {len(zero_exp)} 条：{', '.join(zero_exp)}", "done": False})

    task = {
        "id": "pdd_" + date_str.replace("-", ""),
        "template": "",
        "title": f"推广复盘 {date_str}",
        "module": "推广跟踪",
        "priority": "中",
        "date": date_str,
        "checklist": checklist,
        "done": False,
    }
    data = json.dumps(task).encode("utf-8")
    req = urllib.request.Request(
        ECOM_OP_TASKS_URL, data=data, method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ACCESS_TOKEN}",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read()
        return True
    except Exception as e:
        print(f"⚠️ 写 SOP 任务失败：{e}")
        return False


def main():
    if not cd_ok():
        print("⚠️ CDP 不可用（Edge 未开或未登录）。跳过本次抓取。")
        print("提示：需保持 Windows 上 Edge 窗口打开且登录拼多多推广平台。")
        return

    results = fetch_all()
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    # 全部抓取失败（页面异常/未登录/结构变化）时不写入历史与 SOP，避免污染数据
    if results and all("err" in r for r in results):
        print("本次全部抓取失败，不写入历史/SOP 任务：")
        for r in results:
            print(f"  {r.get('name', '?')}: {r.get('err')}")
        return

    # 汇总指标
    total_exp = sum(to_num(r.get("exp", 0)) for r in results if "err" not in r)
    total_click = sum(to_num(r.get("click", 0)) for r in results if "err" not in r)
    total_cost = sum(to_num(r.get("cost", 0)) for r in results if "err" not in r)
    total_trade = sum(to_num(r.get("trade", 0)) for r in results if "err" not in r)
    total_orders = sum(to_num(r.get("orders", 0)) for r in results if "err" not in r)

    snapshot = {"time": now, "total": {
        "exp": total_exp, "click": total_click, "cost": total_cost,
        "trade": total_trade, "orders": total_orders,
    }, "items": results}
    save_history(snapshot)

    # 写入 ecom-op SOP 任务
    date_str = datetime.now().strftime("%Y-%m-%d")
    totals = {"exp": total_exp, "click": total_click, "cost": total_cost,
              "trade": total_trade, "orders": total_orders}
    sop_ok = write_sop_task(results, totals, date_str)
    if sop_ok:
        print(f"✅ 已写入 ecom-op SOP 任务（推广复盘 {date_str}）")

    # 输出报告
    print(f"=== 拼多多推广跟踪报告 {now} ===")
    print(f"汇总：曝光 {total_exp} | 点击 {total_click} | 成交花费 {total_cost:.2f} | "
          f"交易额 {total_trade:.2f} | 成交 {total_orders} 单")
    if total_cost > 0:
        overall_roi = total_trade / total_cost
        print(f"整体实际投产比：{overall_roi:.2f}（保本线 {BREAKEVEN_ROI}）")

    print("\n各商品明细（曝光/点击/花费/交易额/实际ROI/成交）：")
    for r in results:
        if "err" in r:
            print(f"  {r['name']}: 抓取失败 {r['err']}")
            continue
        exp = to_num(r["exp"]); click = to_num(r["click"])
        cost = to_num(r["cost"]); trade = to_num(r["trade"]); roi = to_num(r["roi"])
        ctr = (click / exp * 100) if exp > 0 else 0
        print(f"  {r['name'][:14]} | 曝光{int(exp)} | 点击{int(click)} | "
              f"花费{cost:.2f} | 交易{trade:.2f} | ROI{roi:.2f} | CTR{ctr:.1f}%")

    # 对比上次
    hist = load_history()
    keys = sorted(hist.keys())
    if len(keys) >= 2:
        prev = hist[keys[-2]]
        p = prev.get("total", {})
        print(f"\n对比上次（{keys[-2]}）：曝光 {int(p.get('exp',0))}→{int(total_exp)} | "
              f"点击 {int(p.get('click',0))}→{int(total_click)} | "
              f"花费 {p.get('cost',0):.2f}→{total_cost:.2f} | "
              f"交易额 {p.get('trade',0):.2f}→{total_trade:.2f}")


if __name__ == "__main__":
    import sys
    sys.path.insert(0, "/home/xiaolin/.hermes/scripts")
    import notify_task_run as _ntr
    _ntr.run_and_log("promo_track", main)
