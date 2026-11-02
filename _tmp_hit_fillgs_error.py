# -*- coding: utf-8 -*-
"""补 count+1，反映多件优惠问题已实际发生一次（2616 任务）"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalog

et = "淘宝V2多件优惠未选（GS注入英文percent不生效）"
r = catalog.hit_error_by_type(et, node_id="fill_gs")
print("hit_error_by_type 返回:", {k: r.get(k) for k in ("id", "error_type", "node_id", "count", "last_seen")})
