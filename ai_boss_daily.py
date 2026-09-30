#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI 老板每日工作流：采集 → 评估规则 → 决策执行 → 复盘 → 写日志。

被 Hermes cron 定时唤醒（每天跑一次）。输出 JSON 供汇报，同时写 ai_boss_log 表。

工作内容（AI 老板职责）：
  1. 采集自己上架商品的经营数据（访客/订单/转化），多店串行
  2. 跑规则引擎评估 A/B/C 规则是否触发
  3. 对「改标题 / 加推」类动作自动执行（复用后端 CDP 改标题链路，含质量门+14天硬约束）
     对「下架」不自动执行（需人工确认，如实留痕）
  4. 写工作日志（ai_boss_log），输出 JSON 供 cron 汇报

用法:
  python3 ai_boss_daily.py [--no-collect] [--no-execute] [--dry-run]
"""
import json
import os
import sys
import urllib.request
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalog
import ai_boss_engine
import aiboss_collect

API_BASE = "http://127.0.0.1:8765"
ACCESS_TOKEN = os.environ.get("ECOM_OP_TOKEN", "Alcz8283103")
# AI 老板有商品的店铺 CDP 端口（嘉裕=9232，闲时来=9234），串行采集避免 CDP 冲突
SHOP_PORTS = ["9232", "9234"]


def _call_execute(gid, action_type, rule, goods_name, detail):
    """调后端 /api/aiboss/execute 触发动作执行（后端异步，结果写 ai_boss_actions 审计）。"""
    body = json.dumps({
        "goods_id": gid, "action_type": action_type,
        "rule": rule, "goods_name": goods_name, "detail": detail,
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{API_BASE}/api/aiboss/execute", data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {ACCESS_TOKEN}"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def build_summary(result):
    c = result["collect"]["count"]
    g = result["evaluate"]["goods_count"]
    t = result["evaluate"]["actions_count"]
    e = result["execute"]["executed"]
    b = result["execute"]["blocked"]
    f = result["execute"]["failed"]
    lines = [f"采集 {c} 条经营数据", f"分析 {g} 个自营商品", f"触发 {t} 个动作"]
    if e or b or f:
        lines.append(f"执行 {e} 成功 / {b} 拦截 / {f} 失败")
    else:
        lines.append("无待执行动作")
    if result["collect"]["error"]:
        lines.append(f"采集异常:{result['collect']['error'][:80]}")
    if result["evaluate"].get("error"):
        lines.append(f"评估异常:{result['evaluate']['error'][:80]}")
    return "；".join(lines)


def main():
    catalog.init_db()  # 确保表结构存在（独立脚本运行时）
    work_date = datetime.now().strftime("%Y-%m-%d")
    args = sys.argv[1:]
    do_collect = "--no-collect" not in args
    do_execute = "--no-execute" not in args
    dry_run = "--dry-run" in args

    result = {
        "work_date": work_date,
        "collect": {"count": 0, "error": None},
        "evaluate": {"goods_count": 0, "actions_count": 0, "actions": [], "error": None},
        "execute": {"executed": 0, "blocked": 0, "failed": 0, "detail": []},
    }

    # 1. 采集（多店串行）
    if do_collect:
        for port in SHOP_PORTS:
            try:
                n = aiboss_collect.collect(port)
                result["collect"]["count"] += n
            except Exception as e:
                msg = f"{port}:{e}"
                result["collect"]["error"] = (result["collect"]["error"] + ";" if result["collect"]["error"] else "") + msg

    # 2. 评估规则
    try:
        rules = ai_boss_engine.evaluate_rules()
        result["evaluate"]["goods_count"] = rules.get("goods_count", 0)
        result["evaluate"]["actions"] = rules.get("actions", [])
        result["evaluate"]["actions_count"] = len(rules.get("actions", []))
    except Exception as e:
        result["evaluate"]["error"] = str(e)

    # 3. 决策 + 执行（自动执行改标题类动作；下架需人工，不自动）
    if do_execute and not dry_run:
        for a in result["evaluate"]["actions"]:
            at = a.get("action_type")
            if at not in ("title_update", "promote"):
                continue
            gid = str(a.get("goods_id") or "")
            try:
                _call_execute(gid, at, a.get("rule") or "", a.get("goods_name") or "", a.get("detail") or {})
                result["execute"]["executed"] += 1
                result["execute"]["detail"].append({"goods_id": gid, "action_type": at, "status": "started"})
            except Exception as e:
                result["execute"]["failed"] += 1
                result["execute"]["detail"].append({"goods_id": gid, "action_type": at, "status": "error", "reason": str(e)[:80]})

    # 4. 写日志
    status = "success"
    if result["collect"]["error"] or result["evaluate"].get("error"):
        status = "partial"
    catalog.add_ai_boss_log(
        work_date=work_date,
        trigger_type="cron",
        collect_count=result["collect"]["count"],
        goods_analyzed=result["evaluate"]["goods_count"],
        actions_triggered=result["evaluate"]["actions_count"],
        actions_executed=result["execute"]["executed"],
        actions_detail=result["evaluate"]["actions"],
        summary=build_summary(result),
        status=status,
    )

    return result


if __name__ == "__main__":
    r = main()
    print(json.dumps(r, ensure_ascii=False))
