# -*- coding: utf-8 -*-
"""监控 autopublish 任务 #96-#99 直到全部终态"""
import sys, json, time
sys.path.insert(0, '/mnt/d/电商运营/运营工作台')
import catalog
catalog.init_db()

TARGET = [96, 97, 98, 99]
DONE = {'submitted', 'failed', 'timeout', 'verified'}

def status():
    conn = catalog._conn()
    rows = conn.execute(f"SELECT id, status, stage, pdd_goods_id, error FROM autopublish_tasks WHERE id IN ({','.join(map(str,TARGET))})").fetchall()
    conn.close()
    return {r['id']: r for r in rows}

for i in range(40):  # 最多 40*15s = 10 分钟
    time.sleep(15)
    st = status()
    all_done = all(st.get(t) and st[t]['status'] in DONE for t in TARGET)
    # 打印当前进度
    line = ' | '.join(f"#{t}:{st.get(t,{}).get('status','?')}/{st.get(t,{}).get('stage','')}" for t in TARGET)
    print(f"[{i*15}s] {line}", flush=True)
    if all_done:
        break

print('=== 最终结果 ===')
for t in TARGET:
    r = st.get(t, {})
    print(f"#{t} [{r.get('status')}/{r.get('stage')}] pdd={r.get('pdd_goods_id')} error={r.get('error')}")
