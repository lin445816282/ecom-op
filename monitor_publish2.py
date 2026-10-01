# -*- coding: utf-8 -*-
"""监控 autopublish 任务 #100-#103 直到全部终态（只查库，不碰 CDP）"""
import sys, time
sys.path.insert(0, '/mnt/d/电商运营/运营工作台')
import catalog
catalog.init_db()

TARGET = [100, 101, 102, 103]
DONE = {'submitted', 'failed', 'timeout', 'verified'}

def status():
    conn = catalog._conn()
    rows = conn.execute(
        "SELECT id, status, stage, pdd_goods_id, error FROM autopublish_tasks WHERE id IN (%s)" % ','.join(map(str, TARGET))
    ).fetchall()
    conn.close()
    return {r['id']: {'status': r['status'], 'stage': r['stage'], 'pdd': r['pdd_goods_id'], 'error': r['error']} for r in rows}

for i in range(40):  # 最多 40*15s = 10 分钟
    time.sleep(15)
    st = status()
    line = ' | '.join("#%d:%s/%s" % (t, st.get(t, {}).get('status','?'), st.get(t, {}).get('stage','')) for t in TARGET)
    print("[%ds] %s" % (i*15, line), flush=True)
    if all(t in st and st[t]['status'] in DONE for t in TARGET):
        break

print('=== 最终结果 ===', flush=True)
for t in TARGET:
    s = st.get(t, {})
    print("#%d [%s/%s] pdd=%s error=%s" % (t, s.get('status'), s.get('stage'), s.get('pdd'), s.get('error', '')[:40]), flush=True)
