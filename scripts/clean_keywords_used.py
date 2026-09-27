# -*- coding: utf-8 -*-
"""清理关键词库「已用」标记里的 CDP 误报商品（无结果商品）。

背景：历史版本在 AI 生成标题（optimize）时就回填关键词，导致 CDP 连接失败
（note=无结果）的商品也把词误标成了「已用」。本脚本按 title_opt 备份文件里的
误报商品 id，把这些商品的「已用」标记清除。

用法:
  python3 scripts/clean_keywords_used.py [备份文件.json]
  # 备份文件默认 data/exports/title_opt_no_result_backup_YYYYMMDD.json

清理规则（幂等，可重复跑）：
  - 移除每个「已用」词 used_by 里的误报商品 id
  - 重算 used_count = len(used_by)
  - used_by 清空则 status 改回「待用」，并清空 used_at/used_count/used_by
"""
import json
import os
import sys


def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if len(sys.argv) > 1:
        bak_rel = sys.argv[1]
    else:
        # 默认找最新一个无结果备份
        import glob
        cands = sorted(glob.glob(os.path.join(base, "data", "exports", "title_opt_no_result_backup_*.json")))
        if not cands:
            print(json.dumps({"ok": False, "error": "找不到备份文件"}, ensure_ascii=False))
            return
        bak_rel = cands[-1]
    bak_path = bak_rel if os.path.isabs(bak_rel) else os.path.join(base, bak_rel)
    bak = json.load(open(bak_path, encoding="utf-8"))
    bad_ids = set(x["platform_product_id"] for x in bak)

    kw_path = os.path.join(base, "data", "keywords.json")
    kws = json.load(open(kw_path, encoding="utf-8"))

    # 清理前完整备份
    bak_out = os.path.join(base, "data", "exports", "keywords_used_before_clean.json")
    json.dump(kws, open(bak_out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    cleared = 0       # 纯脏：used_by 全是误报商品 → 改回待用
    partial = 0       # 部分脏：移除部分误报商品，仍保留已用
    removed_refs = 0  # 移除的 (词,商品) 引用总数
    for k in kws:
        if k.get("status") != "已用":
            continue
        ub = k.get("used_by") or []
        new_ub = [pid for pid in ub if pid not in bad_ids]
        removed = len(ub) - len(new_ub)
        if removed == 0:
            continue
        removed_refs += removed
        # 同步清理 used_history 里的误报商品记录
        hist = k.get("used_history") or []
        if hist:
            new_hist = [h for h in hist if h.get("product_id") not in bad_ids]
            if len(new_hist) != len(hist):
                k["used_history"] = new_hist
        if not new_ub:
            k["status"] = "待用"
            k.pop("used_at", None)
            k.pop("used_count", None)
            k.pop("used_by", None)
            k.pop("used_history", None)
            cleared += 1
        else:
            k["used_by"] = new_ub
            k["used_count"] = len(new_ub)
            partial += 1

    json.dump(kws, open(kw_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(json.dumps({
        "ok": True,
        "bad_ids": len(bad_ids),
        "cleared": cleared,
        "partial": partial,
        "removed_refs": removed_refs,
        "backup": bak_out,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
