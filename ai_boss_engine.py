# -*- coding: utf-8 -*-
"""AI老板决策规则引擎：三条规则 + 硬约束（系统当董事会）。

规则 A：标题提词/换词 —— 成交词前移 + 零成交词移除
规则 B：7 天零数据下架
规则 C：出单品加推
硬约束：标题修改每 14 天 1 次（系统强制，AI 只能提议不能突破）
"""
import catalog
from datetime import datetime, timedelta

TITLE_COOLDOWN_DAYS = 14  # 硬约束：标题修改频率上限（每 14 天 1 次）
ZERO_DATA_DAYS = 7          # 规则 B：上架满 7 天零数据判定
PROMOTE_STREAK_DAYS = 3     # 规则 C：连续 N 天每天至少 1 单


def _daily_asc(goods_id, days=30):
    """取某商品最近 N 天日粒度数据，按日期升序。"""
    rows = catalog.list_ai_boss_daily(goods_id=goods_id, days=days)
    return list(reversed(rows))  # list 是 DESC，反转为升序


def _visitor_3days_down(goods_id):
    """规则 A 触发条件之一：访客数连续 3 天下降且降幅 > 20%。"""
    series = _daily_asc(goods_id, days=7)
    if len(series) < 3:
        return False
    v = [r.get("visitor_cnt") or 0 for r in series[-3:]]
    if not (v[0] > v[1] > v[2]):
        return False
    if v[0] > 0 and (v[0] - v[2]) / float(v[0]) > 0.20:
        return True
    return False


def _top_converting_keywords(goods_id, days=7, top_n=2):
    """规则 A 输入：近 7 天有成交的词，按转化率排序，取前 N。"""
    kws = catalog.list_ai_boss_keywords(goods_id=goods_id, days=days)
    kws = [k for k in kws if (k.get("pay_order_cnt") or 0) > 0]
    kws.sort(key=lambda k: k.get("pay_rate") or 0, reverse=True)
    return kws[:top_n]


def _zero_convert_keywords(goods_id, days=7):
    """规则 A 输入：近 7 天零成交的词（应从标题移除）。"""
    kws = catalog.list_ai_boss_keywords(goods_id=goods_id, days=days)
    return [k for k in kws if (k.get("pay_order_cnt") or 0) == 0]


def _consecutive_order_days(goods_id, days=14, need_days=PROMOTE_STREAK_DAYS):
    """规则 C 触发条件：连续 N 天每天至少 1 单。返回 (是否满足, 连续天数)。"""
    series = _daily_asc(goods_id, days=days)
    if len(series) < need_days:
        return False, 0
    streak = 0
    max_streak = 0
    for r in series:
        if (r.get("pay_order_cnt") or 0) >= 1:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0
    return max_streak >= need_days, max_streak


def _days_since(date_str):
    """距今天数（date_str 格式 YYYY-MM-DD 或含时间戳）。"""
    if not date_str:
        return None
    try:
        d = datetime.strptime(str(date_str)[:10], "%Y-%m-%d").date()
        return (datetime.now().date() - d).days
    except Exception:
        return None


def _rule_a_title(gid, goods_name):
    """规则 A：标题提词/换词。返回触发状态 + 建议动作。"""
    cooldown_ok, cooldown_msg = _title_cooldown_ok(gid)
    visitor_down = _visitor_3days_down(gid)
    top_kws = _top_converting_keywords(gid)
    zero_kws = _zero_convert_keywords(gid)

    triggered = visitor_down and cooldown_ok
    if not triggered:
        return {"rule": "A", "triggered": False, "goods_id": gid, "goods_name": goods_name,
                "reason": cooldown_msg if not cooldown_ok else "访客未连续3天下降>20%",
                "cooldown_ok": cooldown_ok, "visitor_down": visitor_down}

    return {
        "rule": "A", "triggered": True, "goods_id": gid, "goods_name": goods_name,
        "action_type": "title_update",
        "detail": {
            "前移词": [{"keyword": k["keyword"], "pay_rate": k.get("pay_rate")} for k in top_kws],
            "移除词": [{"keyword": k["keyword"]} for k in zero_kws[:3]],
            "约束": "一次最多动6字符，前12字外的词优先动，晚上12点后操作",
        },
    }


def _rule_b_offshelf(gid, goods_name, published_at=""):
    """规则 B：7 天零数据下架。"""
    days = _days_since(published_at)
    if days is None or days < ZERO_DATA_DAYS:
        return {"rule": "B", "triggered": False, "goods_id": gid, "goods_name": goods_name,
                "reason": f"上架未满{ZERO_DATA_DAYS}天(已{0 if days is None else days}天)"}

    series = _daily_asc(gid, days=ZERO_DATA_DAYS)
    if not series:
        return {"rule": "B", "triggered": False, "goods_id": gid, "goods_name": goods_name,
                "reason": "无经营数据，无法判定"}

    visitors = sum(r.get("visitor_cnt") or 0 for r in series)
    collects = sum(r.get("collect_cnt") or 0 for r in series)
    pay_orders = sum(r.get("pay_order_cnt") or 0 for r in series)
    pay_rate = (sum(r.get("pay_rate") or 0 for r in series)) / len(series) if series else 0

    cond1 = visitors == 0 and collects == 0
    cond2 = visitors > 20 and pay_orders == 0 and pay_rate == 0
    triggered = cond1 or cond2

    return {
        "rule": "B", "triggered": triggered, "goods_id": gid, "goods_name": goods_name,
        "action_type": "offshelf",
        "detail": {"访客数": visitors, "收藏数": collects, "支付订单": pay_orders,
                   "命中条件": "访客0且收藏0" if cond1 else ("访客>20但零转化" if cond2 else "无")},
        "reason": "" if triggered else "数据未达下架阈值",
    }


def _rule_c_promote(gid, goods_name):
    """规则 C：出单品加推。"""
    ok, streak = _consecutive_order_days(gid)
    if not ok:
        return {"rule": "C", "triggered": False, "goods_id": gid, "goods_name": goods_name,
                "reason": f"未连续{PROMOTE_STREAK_DAYS}天每天≥1单(当前连续{streak}天)"}

    top_kws = _top_converting_keywords(gid)
    return {
        "rule": "C", "triggered": True, "goods_id": gid, "goods_name": goods_name,
        "action_type": "promote",
        "detail": {
            "连续出单天数": streak,
            "成交词": [k["keyword"] for k in top_kws],
            "动作": "标题强化成交词 + 查更低进价供应商 + 报免费活动",
        },
    }


def _title_cooldown_ok(gid):
    """硬约束：标题修改每 14 天 1 次。返回 (是否可改, 说明)。"""
    last = catalog.last_title_update(gid)
    if not last:
        return True, "无历史标题修改"
    days = _days_since(last.get("created_at"))
    if days is None or days >= TITLE_COOLDOWN_DAYS:
        return True, f"距上次改标题{0 if days is None else days}天(≥{TITLE_COOLDOWN_DAYS})"
    return False, f"距上次改标题仅{days}天(<{TITLE_COOLDOWN_DAYS}天)，硬约束拦截"


def evaluate_rules():
    """评估所有有经营数据的商品，返回建议动作列表 + 汇总。"""
    daily = catalog.list_ai_boss_daily(days=30)
    gids = list(dict.fromkeys([d.get("goods_id") for d in daily if d.get("goods_id")]))
    # 关联商品名
    name_map = {}
    for d in daily:
        if d.get("goods_id") and d.get("goods_name"):
            name_map.setdefault(d["goods_id"], d["goods_name"])
    # 上架时间：从 published_goods 里找
    pub_map = {}
    for g in catalog.list_published_goods(300):
        if g.get("goods_id"):
            pub_map.setdefault(str(g["goods_id"]), g.get("published_at") or g.get("created_at"))

    results = {"A": [], "B": [], "C": [], "actions": []}
    for gid in gids:
        name = name_map.get(gid, gid)
        a = _rule_a_title(gid, name)
        b = _rule_b_offshelf(gid, name, pub_map.get(gid, ""))
        c = _rule_c_promote(gid, name)
        results["A"].append(a)
        results["B"].append(b)
        results["C"].append(c)
        for r in (a, b, c):
            if r.get("triggered"):
                results["actions"].append(r)

    return {
        "goods_count": len(gids),
        "actions": results["actions"],
        "rules": {
            "A": {"name": "标题提词/换词", "triggered": [x for x in results["A"] if x["triggered"]]},
            "B": {"name": "7天零数据下架", "triggered": [x for x in results["B"] if x["triggered"]]},
            "C": {"name": "出单品加推", "triggered": [x for x in results["C"] if x["triggered"]]},
        },
        "constraints": {
            "title_cooldown_days": TITLE_COOLDOWN_DAYS,
            "zero_data_days": ZERO_DATA_DAYS,
            "promote_streak_days": PROMOTE_STREAK_DAYS,
        },
    }
