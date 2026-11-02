# -*- coding: utf-8 -*-
"""临时脚本：把「多件优惠未选」问题记账到流程树 fill_gs 节点"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalog

et = "淘宝V2多件优惠未选（GS注入英文percent不生效）"
desc = ("fill_v2_gs 只做了 GS 注入 type:percent（英文值）+ enable，漏了 CDP 点选下拉选"
        "「满2件打折」这一步。GS 注入的 percent 是英文，淘宝 UI 下拉只认中文「满2件打折」，"
        "所以 checkbox 勾了但优惠方式没选对→多件优惠实际未生效。2616 任务第5次跑通 formError={} 时此项仍为空。")
sol = ("三步：① GS 注入 enable+type:percent+value 9.9；② CDP 点下拉触发器→点选「满2件打折」；"
       "③ 点选后 type 变数字1、value 清空→GS 重设 value=9.9。skill: v2-multi-discount-fill")

r = catalog.add_error(et, description=desc, skill_name="v2-multi-discount-fill",
                      solution=sol, node_id="fill_gs")
print("add_error 返回:", r)

rows = catalog.query_errors(node_id="fill_gs")
print("fill_gs 节点现有记录数:", len(rows))
for x in rows:
    print(" -", x["id"], x["error_type"], "| node_id=", x["node_id"], "| count=", x["count"])
