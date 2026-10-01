# -*- coding: utf-8 -*-
"""快速选品测试：只搜 1 个关键词，验证 搜索→过滤→选品 链路"""
import sys, os
sys.path.insert(0, '/mnt/d/电商运营/运营工作台')
import aiboss_select as A

items = A.search_1688('万圣节装饰', 12)
print('搜索到商品数:', len(items))

candidates = []
seen = set()
for it in items:
    oid = str(it.get('oid') or '')
    if not oid or oid in seen:
        continue
    seen.add(oid)
    title, price = A.parse_product(it.get('txt', ''))
    if not title:
        continue
    if not any(w in title for w in A.FESTIVAL_WORDS):
        continue
    if price is not None and (price < 0.5 or price > 200):
        continue
    candidates.append({'oid': oid, 'title': title, 'price': price})

candidates.sort(key=lambda c: c['price'] if c['price'] else 999)
print('过滤后候选数:', len(candidates))
print('=== 选出的前 5 个（按价格升序）===')
for i, c in enumerate(candidates[:5], 1):
    print(f"{i}. ¥{c['price']} | {c['title']}")
    print(f"   https://detail.1688.com/offer/{c['oid']}.html")
