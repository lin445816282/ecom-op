#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
嘉裕工艺品 分时投产比调度 — 到 top3 时段设投产比 2，平时调回正常值
cron: 每小时跑一次（0 * * * *）
用法: python3 pdd_time_roi.py [--dry-run]
"""
import sys, json, subprocess, datetime, os
from datetime import timezone, timedelta

NODE = "/mnt/d/Program Files/nodejs/node.exe"
SYNC_JS = r"C:\tmp\sync_time_roi.js"
PORT = "9232"  # 嘉裕工艺品 CDP

# 嘉裕 top3 时刻表（weekday 0=周一, 1=周二 ... 6=周日）
TOP3_HOURS = {
    0: [23, 21, 20],   # 周一
    1: [16, 19, 10],   # 周二
    2: [19, 22, 10],   # 周三
    3: [23, 11, 14],   # 周四
    4: [23, 21, 13],   # 周五
    5: [16, 20, 12],   # 周六
    6: [22, 15, 11],   # 周日
}

# 推广中计划：正常值（调回值）
NORMAL_ROI = {
    "63360840": "2.99",
    "661202839190": "3.79",
}

TOP3_ROI = "2.0"  # top3 时段投产比

CST = timezone(timedelta(hours=8))

def main():
    dry = '--dry-run' in sys.argv
    now = datetime.datetime.now(CST)
    wd = now.weekday()  # 0=周一
    hour = now.hour
    wd_names = ['周一','周二','周三','周四','周五','周六','周日']
    top3 = TOP3_HOURS.get(wd, [])
    is_top3 = hour in top3

    target_roi = TOP3_ROI if is_top3 else None

    cfg = []
    for gid, normal in NORMAL_ROI.items():
        roi = TOP3_ROI if is_top3 else normal
        cfg.append({"gid": gid, "roi": roi})

    label = f"{wd_names[wd]} {hour}点 {'【top3时段】' if is_top3 else '(平时)'} -> 目标投产比: " + \
            ", ".join(f"{c['gid']}={c['roi']}" for c in cfg)

    if dry:
        print("[DRY-RUN] " + label)
        return

    # 调 node 幂等同步
    cfg_json = json.dumps(cfg)
    try:
        r = subprocess.run([NODE, SYNC_JS, PORT, cfg_json],
                           capture_output=True, text=True, timeout=120)
        out = r.stdout.strip()
        print(f"[{now.strftime('%Y-%m-%d %H:%M')}] {label}")
        print(f"  结果: {out}")
    except subprocess.TimeoutExpired:
        print(f"[{now.strftime('%Y-%m-%d %H:%M')}] {label}\n  结果: TIMEOUT")
    except Exception as e:
        print(f"[{now.strftime('%Y-%m-%d %H:%M')}] {label}\n  结果: ERR {e}")

if __name__ == '__main__':
    main()
