import catalog, sqlite3
catalog.init_db()
c = sqlite3.connect(catalog.DB_PATH); c.row_factory = sqlite3.Row
cands = catalog.title_opt_candidates(3)
print("候选总数:", len(cands))
from collections import Counter
cnt = Counter()
for p in cands[:40]:
    ho = catalog.has_order(3, p["platform_product_id"])
    cnt["有订单" if ho else "无订单"] += 1
print("前40个 has_order 分布:", dict(cnt))
rows = c.execute("SELECT platform_product_id, COUNT(*) n FROM orders WHERE shop_id=3 GROUP BY platform_product_id").fetchall()
print("shop_id=3 有订单的 platform_product_id:", len(rows), "个")
prod_ids = set(r["platform_product_id"] for r in c.execute("SELECT platform_product_id FROM products WHERE shop_id=3"))
order_ids = set(r["platform_product_id"] for r in rows)
print("products shop_id=3 商品数:", len(prod_ids))
print("订单里不在 products 的:", len(order_ids - prod_ids))
print("订单里在 products 的:", len(order_ids.intersection(prod_ids)))
cand_ids = set(p["platform_product_id"] for p in cands)
overlap = cand_ids.intersection(order_ids)
print("候选商品里其实有订单的:", len(overlap))
print("重叠的商品ID:", list(overlap)[:5])
c.close()
