# -*- coding: utf-8 -*-
"""电商运营工作台：平台 + 电商层级 目录数据层（SQLite）。

层级模型：
    平台 platform (拼多多/淘宝/京东/抖音…)
      └─ 店铺 shop (嘉裕工艺品…)
          └─ 商品 product (SPU)
              └─ SKU

真实平台数据（拼多多商家后台导出）导入后存于此，与原有 JSON 手工投产数据
（data.py / products.json）相互独立，不互相覆盖。
"""
from __future__ import annotations

import os
import sqlite3
from contextlib import closing

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

DB_PATH = os.path.join(DATA_DIR, "catalog.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS platforms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS shops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(platform_id, name),
    FOREIGN KEY(platform_id) REFERENCES platforms(id)
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL,
    platform_product_id TEXT NOT NULL,
    name TEXT DEFAULT '',
    code TEXT DEFAULT '',
    cost_price REAL,
    status TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(shop_id, platform_product_id),
    FOREIGN KEY(shop_id) REFERENCES shops(id)
);

CREATE TABLE IF NOT EXISTS skus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    platform_sku_id TEXT NOT NULL,
    spec_name TEXT DEFAULT '',
    spec_code TEXT DEFAULT '',
    dan_price REAL,
    pin_price REAL,
    stock INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(product_id, platform_sku_id),
    FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_skus_product ON skus(product_id);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL,
    order_no TEXT UNIQUE,
    status TEXT DEFAULT '',
    quantity INTEGER DEFAULT 0,
    pay_time TEXT DEFAULT '',
    confirm_time TEXT DEFAULT '',
    product_id INTEGER,
    platform_product_id TEXT DEFAULT '',
    spec TEXT DEFAULT '',
    aftersale_status TEXT DEFAULT '',
    buyer_amount REAL,
    seller_amount REAL,
    tracking_no TEXT DEFAULT '',
    courier TEXT DEFAULT '',
    province TEXT DEFAULT '',
    city TEXT DEFAULT '',
    district TEXT DEFAULT '',
    source TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(shop_id) REFERENCES shops(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_shop ON orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(platform_product_id);

CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL,
    product_id INTEGER,
    platform_product_id TEXT DEFAULT '',
    product_name TEXT DEFAULT '',
    scene TEXT DEFAULT '',
    plan_name TEXT DEFAULT '',
    bid_type TEXT DEFAULT '',
    group_name TEXT DEFAULT '',
    period TEXT DEFAULT '',
    deal_spend REAL,
    deal_amount REAL,
    actual_roi REAL,
    total_spend REAL,
    net_deal_count INTEGER,
    impressions INTEGER,
    clicks INTEGER,
    metrics TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(shop_id) REFERENCES shops(id)
);

CREATE INDEX IF NOT EXISTS idx_promotions_shop ON promotions(shop_id);
CREATE INDEX IF NOT EXISTS idx_promotions_product ON promotions(platform_product_id);

CREATE TABLE IF NOT EXISTS modifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL,
    platform_product_id TEXT NOT NULL,
    platform_sku_id TEXT DEFAULT '',
    field TEXT NOT NULL,
    old_value TEXT DEFAULT '',
    new_value TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(platform_product_id, platform_sku_id, field)
);

CREATE INDEX IF NOT EXISTS idx_mods_shop ON modifications(shop_id);

CREATE TABLE IF NOT EXISTS goods_effect (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER DEFAULT 0,
    platform_product_id TEXT NOT NULL,
    goods_name TEXT DEFAULT '',
    stat_date TEXT DEFAULT '',
    goods_uv REAL,
    goods_pv REAL,
    pay_ordr_amt REAL,
    pay_ordr_cnt INTEGER,
    pay_ordr_usr_cnt INTEGER,
    goods_vcr REAL,
    goods_fav_cnt INTEGER,
    thumb_url TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(platform_product_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_ge_product ON goods_effect(platform_product_id);
"""


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with closing(_conn()) as c:
        c.executescript(SCHEMA)
        c.commit()
        _migrate(c)


def _migrate(conn: sqlite3.Connection) -> None:
    """幂等迁移：为已存在的旧表补充缺失列。"""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(orders)").fetchall()}
    for name in ("province", "city", "district", "source"):
        if name not in cols:
            conn.execute(f"ALTER TABLE orders ADD COLUMN {name} TEXT DEFAULT ''")
    # modifications 表 status 列（待处理/已处理标注）
    mcols = {r[1] for r in conn.execute("PRAGMA table_info(modifications)").fetchall()}
    if "status" not in mcols:
        conn.execute("ALTER TABLE modifications ADD COLUMN status TEXT DEFAULT 'pending'")
    # products 表 cost_price 列（成本价）
    pcols = {r[1] for r in conn.execute("PRAGMA table_info(products)").fetchall()}
    if "cost_price" not in pcols:
        conn.execute("ALTER TABLE products ADD COLUMN cost_price REAL")
    # products 表 status 列（商品状态标签）
    if "status" not in pcols:
        conn.execute("ALTER TABLE products ADD COLUMN status TEXT DEFAULT ''")
    conn.commit()


# ----------------------------- 平台 / 店铺 -----------------------------

def upsert_platform(code: str, name: str) -> int:
    with closing(_conn()) as c:
        c.execute(
            "INSERT INTO platforms(code, name) VALUES(?, ?) "
            "ON CONFLICT(code) DO UPDATE SET name=excluded.name",
            (code, name),
        )
        c.commit()
        row = c.execute("SELECT id FROM platforms WHERE code=?", (code,)).fetchone()
        return row["id"]


def upsert_shop(platform_id: int, name: str) -> int:
    with closing(_conn()) as c:
        c.execute(
            "INSERT INTO shops(platform_id, name) VALUES(?, ?) "
            "ON CONFLICT(platform_id, name) DO NOTHING",
            (platform_id, name),
        )
        c.commit()
        row = c.execute(
            "SELECT id FROM shops WHERE platform_id=? AND name=?",
            (platform_id, name),
        ).fetchone()
        return row["id"]


def rename_platform(platform_id: int, name: str) -> bool:
    with closing(_conn()) as c:
        c.execute("UPDATE platforms SET name=? WHERE id=?", (name, platform_id))
        c.commit()
        return c.total_changes > 0


def rename_shop(shop_id: int, name: str) -> bool:
    with closing(_conn()) as c:
        c.execute("UPDATE shops SET name=? WHERE id=?", (name, shop_id))
        c.commit()
        return c.total_changes > 0


def _count_platform(conn, platform_id: int) -> dict:
    shops = conn.execute("SELECT COUNT(*) AS n FROM shops WHERE platform_id=?", (platform_id,)).fetchone()["n"]
    products = conn.execute(
        "SELECT COUNT(*) AS n FROM products WHERE shop_id IN (SELECT id FROM shops WHERE platform_id=?)",
        (platform_id,)).fetchone()["n"]
    skus = conn.execute(
        "SELECT COUNT(*) AS n FROM skus WHERE product_id IN "
        "(SELECT id FROM products WHERE shop_id IN (SELECT id FROM shops WHERE platform_id=?))",
        (platform_id,)).fetchone()["n"]
    orders = conn.execute(
        "SELECT COUNT(*) AS n FROM orders WHERE shop_id IN (SELECT id FROM shops WHERE platform_id=?)",
        (platform_id,)).fetchone()["n"]
    promos = conn.execute(
        "SELECT COUNT(*) AS n FROM promotions WHERE shop_id IN (SELECT id FROM shops WHERE platform_id=?)",
        (platform_id,)).fetchone()["n"]
    return {"platforms": 1, "shops": shops, "products": products,
            "skus": skus, "orders": orders, "promotions": promos}


def delete_platform(platform_id: int) -> dict:
    """级联删除平台及其下店铺/商品/SKU/订单/推广，返回删除统计。"""
    with closing(_conn()) as c:
        stats = _count_platform(c, platform_id)
        c.execute("DELETE FROM skus WHERE product_id IN "
                  "(SELECT id FROM products WHERE shop_id IN (SELECT id FROM shops WHERE platform_id=?))",
                  (platform_id,))
        c.execute("DELETE FROM orders WHERE shop_id IN (SELECT id FROM shops WHERE platform_id=?)", (platform_id,))
        c.execute("DELETE FROM promotions WHERE shop_id IN (SELECT id FROM shops WHERE platform_id=?)", (platform_id,))
        c.execute("DELETE FROM products WHERE shop_id IN (SELECT id FROM shops WHERE platform_id=?)", (platform_id,))
        c.execute("DELETE FROM shops WHERE platform_id=?", (platform_id,))
        c.execute("DELETE FROM platforms WHERE id=?", (platform_id,))
        c.commit()
        return stats


def _count_shop(conn, shop_id: int) -> dict:
    products = conn.execute("SELECT COUNT(*) AS n FROM products WHERE shop_id=?", (shop_id,)).fetchone()["n"]
    skus = conn.execute(
        "SELECT COUNT(*) AS n FROM skus WHERE product_id IN (SELECT id FROM products WHERE shop_id=?)",
        (shop_id,)).fetchone()["n"]
    orders = conn.execute("SELECT COUNT(*) AS n FROM orders WHERE shop_id=?", (shop_id,)).fetchone()["n"]
    promos = conn.execute("SELECT COUNT(*) AS n FROM promotions WHERE shop_id=?", (shop_id,)).fetchone()["n"]
    return {"shops": 1, "products": products, "skus": skus,
            "orders": orders, "promotions": promos}


def delete_shop(shop_id: int) -> dict:
    """级联删除店铺及其下商品/SKU/订单/推广，返回删除统计。"""
    with closing(_conn()) as c:
        stats = _count_shop(c, shop_id)
        c.execute("DELETE FROM skus WHERE product_id IN (SELECT id FROM products WHERE shop_id=?)", (shop_id,))
        c.execute("DELETE FROM orders WHERE shop_id=?", (shop_id,))
        c.execute("DELETE FROM promotions WHERE shop_id=?", (shop_id,))
        c.execute("DELETE FROM products WHERE shop_id=?", (shop_id,))
        c.execute("DELETE FROM shops WHERE id=?", (shop_id,))
        c.commit()
        return stats


# ----------------------------- 单连接批量导入 -----------------------------

def import_batch(shop_id: int, products: list[dict], skus: list[dict]) -> dict:
    """单连接 + 单事务批量导入，避免逐条开连接的开销。

    products: [{platform_product_id, name, code}]
    skus:     [{platform_product_id, platform_sku_id, spec_name, spec_code,
                dan_price, pin_price, stock}]
    """
    conn = _conn()
    try:
        # 商品（先插，拿到 product_id 映射）
        pid_map = {}
        for p in products:
            conn.execute(
                "INSERT INTO products(shop_id, platform_product_id, name, code) VALUES(?, ?, ?, ?) "
                "ON CONFLICT(shop_id, platform_product_id) DO UPDATE SET "
                "name=excluded.name, code=CASE WHEN excluded.code='' THEN products.code ELSE excluded.code END",
                (shop_id, p["platform_product_id"], p.get("name", ""), p.get("code", "")),
            )
        # 读取映射
        rows = conn.execute(
            "SELECT id, platform_product_id FROM products WHERE shop_id=?", (shop_id,)
        ).fetchall()
        for r in rows:
            pid_map[r["platform_product_id"]] = r["id"]

        # SKU
        for s in skus:
            product_id = pid_map.get(s["platform_product_id"])
            if product_id is None:
                continue
            conn.execute(
                "INSERT INTO skus(product_id, platform_sku_id, spec_name, spec_code, dan_price, pin_price, stock) "
                "VALUES(?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(product_id, platform_sku_id) DO UPDATE SET "
                "spec_name=excluded.spec_name, spec_code=excluded.spec_code, "
                "dan_price=COALESCE(excluded.dan_price, skus.dan_price), "
                "pin_price=COALESCE(excluded.pin_price, skus.pin_price), "
                "stock=COALESCE(excluded.stock, skus.stock)",
                (product_id, s["platform_sku_id"], s.get("spec_name", ""),
                 s.get("spec_code", ""), s.get("dan_price"), s.get("pin_price"),
                 s.get("stock")),
            )
        conn.commit()
        return catalog_stats(conn)
    finally:
        conn.close()


# ----------------------------- 订单 / 推广 导入 -----------------------------

def import_orders(shop_id: int, orders: list[dict]) -> int:
    """批量导入订单（单连接），自动按 platform_product_id 关联 product_id。

    orders: [{order_no, status, quantity, pay_time, confirm_time,
              platform_product_id, spec, aftersale_status, buyer_amount,
              seller_amount, tracking_no, courier}]
    """
    conn = _conn()
    try:
        pid_map = dict(conn.execute(
            "SELECT platform_product_id, id FROM products WHERE shop_id=?", (shop_id,)
        ).fetchall())
        n = 0
        for o in orders:
            pid = pid_map.get(o.get("platform_product_id", ""))
            conn.execute(
                "INSERT INTO orders(shop_id, order_no, status, quantity, pay_time, confirm_time, "
                "product_id, platform_product_id, spec, aftersale_status, buyer_amount, "
                "seller_amount, tracking_no, courier, province, city, district, source) "
                "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(order_no) DO UPDATE SET status=excluded.status, "
                "buyer_amount=excluded.buyer_amount, seller_amount=excluded.seller_amount, "
                "province=excluded.province, city=excluded.city, district=excluded.district, "
                "source=excluded.source",
                (shop_id, o.get("order_no", ""), o.get("status", ""),
                 o.get("quantity", 0), o.get("pay_time", ""), o.get("confirm_time", ""),
                 pid, o.get("platform_product_id", ""), o.get("spec", ""),
                 o.get("aftersale_status", ""), o.get("buyer_amount"), o.get("seller_amount"),
                 o.get("tracking_no", ""), o.get("courier", ""),
                 o.get("province", ""), o.get("city", ""), o.get("district", ""),
                 o.get("source", "")),
            )
            n += 1
        conn.commit()
        return n
    finally:
        conn.close()


def import_promotions(shop_id: int, promos: list[dict]) -> int:
    """批量导入推广汇总（单连接）。核心指标单列，完整 45 字段存 metrics JSON。

    promos: [{platform_product_id, product_name, scene, plan_name, bid_type,
              group_name, period, deal_spend, deal_amount, actual_roi, total_spend,
              net_deal_count, impressions, clicks, metrics}]
    """
    import json as _json
    conn = _conn()
    try:
        pid_map = dict(conn.execute(
            "SELECT platform_product_id, id FROM products WHERE shop_id=?", (shop_id,)
        ).fetchall())
        n = 0
        for p in promos:
            pid = pid_map.get(p.get("platform_product_id", ""))
            conn.execute(
                "INSERT INTO promotions(shop_id, product_id, platform_product_id, product_name, "
                "scene, plan_name, bid_type, group_name, period, deal_spend, deal_amount, "
                "actual_roi, total_spend, net_deal_count, impressions, clicks, metrics) "
                "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (shop_id, pid, p.get("platform_product_id", ""), p.get("product_name", ""),
                 p.get("scene", ""), p.get("plan_name", ""), p.get("bid_type", ""),
                 p.get("group_name", ""), p.get("period", ""),
                 p.get("deal_spend"), p.get("deal_amount"), p.get("actual_roi"),
                 p.get("total_spend"), p.get("net_deal_count"), p.get("impressions"),
                 p.get("clicks"), _json.dumps(p.get("metrics", {}), ensure_ascii=False)),
            )
            n += 1
        conn.commit()
        return n
    finally:
        conn.close()


# ----------------------------- 价格/库存快照更新 -----------------------------

def import_sku_prices(shop_id: int, updates: list[dict]) -> dict:
    """批量更新 SKU 价格/库存（幂等，只覆盖非空值，保留已有数据）。

    用于「商品快照」导出（商品列表批量导出）的价格/库存回填，
    与「修改模板」不同，快照里含真实当前价格与库存。

    updates: [{platform_product_id, platform_sku_id, spec_code, spec_name,
               dan_price, pin_price, stock}]
    匹配优先级：platform_sku_id → spec_code → spec_name（同一商品下）。
    返回 {"updated": n, "skipped": n}。
    """
    conn = _conn()
    try:
        pid_map = dict(conn.execute(
            "SELECT platform_product_id, id FROM products WHERE shop_id=?", (shop_id,)
        ).fetchall())
        sku_rows = conn.execute(
            "SELECT s.id, s.product_id, s.platform_sku_id, s.spec_code, s.spec_name "
            "FROM skus s JOIN products p ON p.id=s.product_id WHERE p.shop_id=?", (shop_id,)
        ).fetchall()
        by_skuid = {}
        by_code = {}
        by_name = {}
        for r in sku_rows:
            pid = r["product_id"]
            if r["platform_sku_id"]:
                by_skuid[(pid, r["platform_sku_id"])] = r["id"]
            if r["spec_code"]:
                by_code[(pid, r["spec_code"])] = r["id"]
            if r["spec_name"]:
                by_name[(pid, r["spec_name"])] = r["id"]

        updated = skipped = 0
        for u in updates:
            product_id = pid_map.get(u.get("platform_product_id"))
            if product_id is None:
                skipped += 1
                continue
            sku_rowid = (by_skuid.get((product_id, u.get("platform_sku_id")))
                         or by_code.get((product_id, u.get("spec_code")))
                         or by_name.get((product_id, u.get("spec_name"))))
            if sku_rowid is None:
                skipped += 1
                continue
            conn.execute(
                "UPDATE skus SET dan_price=COALESCE(?, dan_price), "
                "pin_price=COALESCE(?, pin_price), stock=COALESCE(?, stock) WHERE id=?",
                (u.get("dan_price"), u.get("pin_price"), u.get("stock"), sku_rowid),
            )
            updated += 1
        conn.commit()
        return {"updated": updated, "skipped": skipped}
    finally:
        conn.close()


# ----------------------------- 查询 -----------------------------

def catalog_stats(conn: sqlite3.Connection = None) -> dict:
    own = conn is None
    if own:
        conn = _conn()
    try:
        p = conn.execute("SELECT COUNT(*) AS n FROM platforms").fetchone()["n"]
        s = conn.execute("SELECT COUNT(*) AS n FROM shops").fetchone()["n"]
        pr = conn.execute("SELECT COUNT(*) AS n FROM products").fetchone()["n"]
        sk = conn.execute("SELECT COUNT(*) AS n FROM skus").fetchone()["n"]
        sku_priced = conn.execute(
            "SELECT COUNT(*) AS n FROM skus WHERE dan_price IS NOT NULL OR pin_price IS NOT NULL"
        ).fetchone()["n"]
        sku_stocked = conn.execute(
            "SELECT COUNT(*) AS n FROM skus WHERE stock IS NOT NULL"
        ).fetchone()["n"]
        od = conn.execute("SELECT COUNT(*) AS n FROM orders").fetchone()["n"]
        pm = conn.execute("SELECT COUNT(*) AS n FROM promotions").fetchone()["n"]
        return {
            "platforms": p, "shops": s, "products": pr, "skus": sk,
            "sku_priced": sku_priced, "sku_stocked": sku_stocked,
            "orders": od, "promotions": pm,
        }
    finally:
        if own:
            conn.close()


def list_platforms() -> list[dict]:
    with closing(_conn()) as c:
        return [dict(r) for r in c.execute("SELECT * FROM platforms ORDER BY id").fetchall()]


def list_shops(platform_id: int = None) -> list[dict]:
    with closing(_conn()) as c:
        if platform_id:
            rows = c.execute("SELECT * FROM shops WHERE platform_id=? ORDER BY id", (platform_id,)).fetchall()
        else:
            rows = c.execute("SELECT * FROM shops ORDER BY id").fetchall()
        return [dict(r) for r in rows]


def list_products(shop_id: int = None, q: str = None, limit: int = 500) -> list[dict]:
    with closing(_conn()) as c:
        sql = ("SELECT p.*, (SELECT COUNT(*) FROM skus s WHERE s.product_id=p.id) AS sku_count "
               "FROM products p")
        args = []
        conds = []
        if shop_id:
            conds.append("p.shop_id=?")
            args.append(shop_id)
        if q:
            conds.append("(p.name LIKE ? OR p.platform_product_id LIKE ? OR p.code LIKE ?)")
            like = f"%{q}%"
            args += [like, like, like]
        if conds:
            sql += " WHERE " + " AND ".join(conds)
        sql += " ORDER BY p.id LIMIT ?"
        args.append(limit)
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def list_skus(product_id: int = None) -> list[dict]:
    with closing(_conn()) as c:
        if product_id:
            rows = c.execute("SELECT * FROM skus WHERE product_id=? ORDER BY id", (product_id,)).fetchall()
        else:
            rows = c.execute("SELECT * FROM skus ORDER BY id").fetchall()
        return [dict(r) for r in rows]


def list_orders(shop_id: int = None, limit: int = 500) -> list[dict]:
    with closing(_conn()) as c:
        base = ("SELECT o.*, s.name AS shop_name FROM orders o "
                "LEFT JOIN shops s ON s.id = o.shop_id")
        if shop_id:
            rows = c.execute(
                base + " WHERE o.shop_id=? ORDER BY o.pay_time DESC LIMIT ?",
                (shop_id, limit),
            ).fetchall()
        else:
            rows = c.execute(base + " ORDER BY o.pay_time DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]


def list_promotions(shop_id: int = None, limit: int = 500) -> list[dict]:
    with closing(_conn()) as c:
        if shop_id:
            rows = c.execute(
                "SELECT * FROM promotions WHERE shop_id=? ORDER BY id LIMIT ?",
                (shop_id, limit),
            ).fetchall()
        else:
            rows = c.execute("SELECT * FROM promotions ORDER BY id LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]


def catalog_tree() -> list[dict]:
    """完整层级树：平台 → 店铺 → 商品（含 sku_count）。"""
    with closing(_conn()) as c:
        tree = []
        for pl in c.execute("SELECT * FROM platforms ORDER BY id").fetchall():
            pl_node = dict(pl)
            pl_node["shops"] = []
            for sh in c.execute("SELECT * FROM shops WHERE platform_id=? ORDER BY id", (pl["id"],)).fetchall():
                sh_node = dict(sh)
                sh_node["products"] = [
                    dict(pr) for pr in c.execute(
                        "SELECT p.*, (SELECT COUNT(*) FROM skus s WHERE s.product_id=p.id) AS sku_count, "
                        "(SELECT MIN(COALESCE(s.pin_price, s.dan_price)) FROM skus s "
                        " WHERE s.product_id=p.id AND (s.pin_price IS NOT NULL OR s.dan_price IS NOT NULL)) AS min_price "
                        "FROM products p WHERE p.shop_id=? ORDER BY p.id", (sh["id"],)
                    ).fetchall()
                ]
                pl_node["shops"].append(sh_node)
            tree.append(pl_node)
        return tree


def catalog_analysis() -> dict:
    """商品库数据概览：数据完整度 + SKU 规模排行 + 货号系列分布。"""
    import re
    with closing(_conn()) as c:
        total_products = c.execute("SELECT COUNT(*) AS n FROM products").fetchone()["n"]
        total_skus = c.execute("SELECT COUNT(*) AS n FROM skus").fetchone()["n"]
        priced = c.execute(
            "SELECT COUNT(*) AS n FROM skus WHERE dan_price IS NOT NULL OR pin_price IS NOT NULL"
        ).fetchone()["n"]
        stocked = c.execute("SELECT COUNT(*) AS n FROM skus WHERE stock IS NOT NULL").fetchone()["n"]
        coded = c.execute("SELECT COUNT(*) AS n FROM products WHERE code != ''").fetchone()["n"]
        top = c.execute(
            "SELECT p.id, p.name, p.code, p.platform_product_id, COUNT(s.id) AS sku_count "
            "FROM products p LEFT JOIN skus s ON s.product_id = p.id "
            "GROUP BY p.id ORDER BY sku_count DESC, p.id LIMIT 8"
        ).fetchall()
        series = {}
        for row in c.execute("SELECT code FROM products").fetchall():
            code = row["code"] or ""
            m = re.match(r'^([A-Za-z]+)', code)
            key = m.group(1).upper() if m else ("无货号" if not code else "?")
            series[key] = series.get(key, 0) + 1
        return {
            "total_products": total_products,
            "total_skus": total_skus,
            "priced": priced,
            "stocked": stocked,
            "coded": coded,
            "top_skus": [dict(r) for r in top],
            "series": series,
        }


def catalog_performance(shop_id: int = None) -> dict:
    """商品库经营分析：销售概览 + 商品销量排行 + 日趋势 + 地区分布 + 售后。
    shop_id 提供时按店铺筛选。
    """
    with closing(_conn()) as c:
        w = " WHERE shop_id=?" if shop_id else ""
        args = [shop_id] if shop_id else []

        s = c.execute(
            "SELECT COUNT(*) AS order_count, SUM(buyer_amount) AS gmv, "
            "SUM(seller_amount) AS seller_amt, SUM(quantity) AS item_count, "
            "SUM(CASE WHEN aftersale_status LIKE '%退款%' THEN 1 ELSE 0 END) AS refund_count "
            "FROM orders" + w, args
        ).fetchone()
        order_count = s["order_count"] or 0
        gmv = s["gmv"] or 0.0
        item_count = s["item_count"] or 0
        refund_count = s["refund_count"] or 0

        # 商品销量/销售额排行（关联商品名/货号）
        top_products = [dict(r) for r in c.execute(
            "SELECT o.platform_product_id, "
            "COALESCE(p.name,'') AS name, COALESCE(p.code,'') AS code, "
            "COUNT(*) AS orders, ROUND(SUM(o.buyer_amount),2) AS amount, SUM(o.quantity) AS qty "
            "FROM orders o LEFT JOIN products p ON p.platform_product_id = o.platform_product_id "
            + (" WHERE o.shop_id=?" if shop_id else "") +
            " GROUP BY o.platform_product_id ORDER BY amount DESC, orders DESC LIMIT 20", args
        ).fetchall()]

        # 按日趋势
        daily_trend = [dict(r) for r in c.execute(
            "SELECT substr(pay_time,1,10) AS date, COUNT(*) AS orders, "
            "ROUND(SUM(buyer_amount),2) AS amount "
            "FROM orders WHERE pay_time != ''" + (" AND shop_id=?" if shop_id else "") +
            " GROUP BY date ORDER BY date", args
        ).fetchall()]

        # 地区分布 TOP（过滤拼多多脱敏的 ****）
        regions = [dict(r) for r in c.execute(
            "SELECT province, COUNT(*) AS orders, ROUND(SUM(buyer_amount),2) AS amount "
            "FROM orders WHERE province != '' AND province != '****'"
            + (" AND shop_id=?" if shop_id else "") +
            " GROUP BY province ORDER BY orders DESC LIMIT 10", args
        ).fetchall()]

        return {
            "summary": {
                "order_count": order_count,
                "gmv": round(gmv, 2),
                "seller_amt": round(s["seller_amt"] or 0.0, 2),
                "item_count": item_count,
                "avg_order": round(gmv / order_count, 2) if order_count else 0.0,
                "refund_count": refund_count,
                "aftersale_rate": round(refund_count / order_count * 100, 1) if order_count else 0.0,
            },
            "top_products": top_products,
            "daily_trend": daily_trend,
            "regions": regions,
        }


# ----------------------------- 修改记录 -----------------------------

FIELD_LABELS = {
    "title": "改标题",
    "code": "改编码",
    "dan_price": "单买价",
    "pin_price": "拼单价",
    "stock": "库存增减",
}


def add_modification(shop_id: int, platform_product_id: str, field: str,
                     new_value: str, platform_sku_id: str = "") -> bool:
    """记录一条修改。同商品/SKU 同字段重复修改覆盖为最新值（old_value 取当前库内值）。

    field: title/code/dan_price/pin_price/stock。
    不改动 products/skus 原始值，仅写入 modifications 表（待导出）。
    """
    conn = _conn()
    try:
        old_value = ""
        if field in ("title", "code"):
            row = conn.execute(
                "SELECT name, code FROM products WHERE shop_id=? AND platform_product_id=?",
                (shop_id, platform_product_id),
            ).fetchone()
            if row:
                old_value = (row["name"] if field == "title" else (row["code"] or ""))
        else:
            row = conn.execute(
                "SELECT s.dan_price, s.pin_price, s.stock "
                "FROM skus s JOIN products p ON p.id=s.product_id "
                "WHERE p.shop_id=? AND p.platform_product_id=? AND s.platform_sku_id=?",
                (shop_id, platform_product_id, platform_sku_id),
            ).fetchone()
            if row:
                if field == "dan_price":
                    old_value = "" if row["dan_price"] is None else str(row["dan_price"])
                elif field == "pin_price":
                    old_value = "" if row["pin_price"] is None else str(row["pin_price"])
                elif field == "stock":
                    old_value = "" if row["stock"] is None else str(row["stock"])
        conn.execute(
            "INSERT INTO modifications(shop_id, platform_product_id, platform_sku_id, field, old_value, new_value, status) "
            "VALUES(?,?,?,?,?,?, 'pending') "
            "ON CONFLICT(platform_product_id, platform_sku_id, field) DO UPDATE SET "
            "new_value=excluded.new_value, old_value=excluded.old_value, status='pending', "
            "created_at=datetime('now','localtime')",
            (shop_id, platform_product_id, platform_sku_id, field, old_value, new_value),
        )
        conn.commit()
        return True
    finally:
        conn.close()


def list_modifications(shop_id: int = None) -> list[dict]:
    """列出修改记录（JOIN 商品名 / SKU 规格名，便于展示）。"""
    with closing(_conn()) as c:
        sql = (
            "SELECT m.*, p.name AS product_name, s.spec_name AS spec_name "
            "FROM modifications m "
            "LEFT JOIN products p ON p.shop_id=m.shop_id AND p.platform_product_id=m.platform_product_id "
            "LEFT JOIN skus s ON s.product_id=p.id AND s.platform_sku_id=m.platform_sku_id "
        )
        args = []
        if shop_id:
            sql += " WHERE m.shop_id=?"
            args.append(shop_id)
        sql += " ORDER BY m.id DESC"
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def delete_modification(mid: int) -> bool:
    with closing(_conn()) as c:
        c.execute("DELETE FROM modifications WHERE id=?", (mid,))
        c.commit()
        return c.total_changes > 0


def clear_modifications(shop_id: int = None) -> int:
    with closing(_conn()) as c:
        if shop_id:
            c.execute("DELETE FROM modifications WHERE shop_id=?", (shop_id,))
        else:
            c.execute("DELETE FROM modifications")
        c.commit()
        return c.total_changes


def modification_count(shop_id: int = None) -> int:
    with closing(_conn()) as c:
        if shop_id:
            return c.execute(
                "SELECT COUNT(*) AS n FROM modifications WHERE shop_id=?", (shop_id,)
            ).fetchone()["n"]
        return c.execute("SELECT COUNT(*) AS n FROM modifications").fetchone()["n"]


def modification_counts(shop_id: int = None) -> dict:
    """按 4 个按钮维度统计待处理数量（title/price/stock/code；price 按 SKU 去重）。"""
    with closing(_conn()) as c:
        def q(sql, args=()):
            return c.execute(sql, args).fetchone()["n"]
        if shop_id:
            title = q("SELECT COUNT(*) AS n FROM modifications WHERE shop_id=? AND field='title' AND status='pending'", (shop_id,))
            code = q("SELECT COUNT(*) AS n FROM modifications WHERE shop_id=? AND field='code' AND status='pending'", (shop_id,))
            stock = q("SELECT COUNT(*) AS n FROM modifications WHERE shop_id=? AND field='stock' AND status='pending'", (shop_id,))
            price = q("SELECT COUNT(DISTINCT platform_product_id || '|' || platform_sku_id) AS n FROM modifications WHERE shop_id=? AND field IN ('dan_price','pin_price') AND status='pending'", (shop_id,))
        else:
            title = q("SELECT COUNT(*) AS n FROM modifications WHERE field='title' AND status='pending'")
            code = q("SELECT COUNT(*) AS n FROM modifications WHERE field='code' AND status='pending'")
            stock = q("SELECT COUNT(*) AS n FROM modifications WHERE field='stock' AND status='pending'")
            price = q("SELECT COUNT(DISTINCT platform_product_id || '|' || platform_sku_id) AS n FROM modifications WHERE field IN ('dan_price','pin_price') AND status='pending'")
        return {"title": title, "code": code, "stock": stock, "price": price}


def mark_modifications_done(field: str, shop_id: int = None) -> int:
    """把某字段的待处理修改标注为已处理。field 支持 price（合并 dan_price/pin_price）。"""
    fields = ("dan_price", "pin_price") if field == "price" else (field,)
    with closing(_conn()) as c:
        ph = ",".join("?" * len(fields))
        if shop_id:
            cur = c.execute(
                f"UPDATE modifications SET status='done' WHERE shop_id=? AND field IN ({ph}) AND status='pending'",
                (shop_id, *fields),
            )
        else:
            cur = c.execute(
                f"UPDATE modifications SET status='done' WHERE field IN ({ph}) AND status='pending'",
                fields,
            )
        n = cur.rowcount
        c.commit()
        return n


# ----------------------------- 商品访问明细 -----------------------------

def save_goods_effect(shop_id: int, records: list[dict]) -> int:
    """批量 upsert 商品访问明细（拼多多商品数据·商品明细）。

    records: [{platform_product_id, goods_name, stat_date, goods_uv, goods_pv,
               pay_ordr_amt, pay_ordr_cnt, pay_ordr_usr_cnt, goods_vcr,
               goods_fav_cnt, thumb_url}]
    """
    with closing(_conn()) as c:
        n = 0
        for r in records:
            c.execute(
                "INSERT INTO goods_effect(shop_id, platform_product_id, goods_name, stat_date, "
                "goods_uv, goods_pv, pay_ordr_amt, pay_ordr_cnt, pay_ordr_usr_cnt, goods_vcr, "
                "goods_fav_cnt, thumb_url) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(platform_product_id, stat_date) DO UPDATE SET "
                "goods_name=excluded.goods_name, goods_uv=excluded.goods_uv, goods_pv=excluded.goods_pv, "
                "pay_ordr_amt=excluded.pay_ordr_amt, pay_ordr_cnt=excluded.pay_ordr_cnt, "
                "pay_ordr_usr_cnt=excluded.pay_ordr_usr_cnt, goods_vcr=excluded.goods_vcr, "
                "goods_fav_cnt=excluded.goods_fav_cnt, thumb_url=excluded.thumb_url",
                (shop_id, r.get("platform_product_id", ""), r.get("goods_name", ""),
                 r.get("stat_date", ""), r.get("goods_uv"), r.get("goods_pv"),
                 r.get("pay_ordr_amt"), r.get("pay_ordr_cnt"), r.get("pay_ordr_usr_cnt"),
                 r.get("goods_vcr"), r.get("goods_fav_cnt"), r.get("thumb_url", "")),
            )
            n += 1
        c.commit()
        return n


def list_goods_effect(shop_id: int = None, limit: int = 500) -> list[dict]:
    with closing(_conn()) as c:
        if shop_id:
            rows = c.execute(
                "SELECT * FROM goods_effect WHERE shop_id=? "
                "ORDER BY stat_date DESC, pay_ordr_amt DESC LIMIT ?",
                (shop_id, limit),
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT * FROM goods_effect ORDER BY stat_date DESC, pay_ordr_amt DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]


# ----------------------------- 导出 CSV -----------------------------

def export_csv(etype: str) -> tuple:
    """导出数据为 CSV，返回 (文件名, CSV内容)。etype: products/skus/orders/promotions。"""
    import csv
    import io
    out = io.StringIO()
    w = csv.writer(out)

    def _v(x):
        return "" if x is None else x

    with closing(_conn()) as c:
        if etype == "modify-title":
            # 仅导出「待处理」标题修改（改后商品名称 = 新值）
            w.writerow(["商品ID（必填）", "商品名称", "改后商品名称"])
            for r in c.execute(
                "SELECT m.platform_product_id, m.new_value, p.name "
                "FROM modifications m "
                "LEFT JOIN products p ON p.shop_id=m.shop_id AND p.platform_product_id=m.platform_product_id "
                "WHERE m.field='title' AND m.status='pending' ORDER BY m.id"
            ).fetchall():
                w.writerow([r["platform_product_id"], r["name"] or "", r["new_value"]])
            return "批量修改标题模板.csv", out.getvalue()

        if etype == "modify-price":
            # 仅导出「待处理」价格修改（单买价/拼单价 = 新值，未改字段留空）
            dan = {(r["platform_product_id"], r["platform_sku_id"]): r["new_value"] for r in c.execute(
                "SELECT platform_product_id, platform_sku_id, new_value "
                "FROM modifications WHERE field='dan_price' AND status='pending'"
            ).fetchall()}
            pin = {(r["platform_product_id"], r["platform_sku_id"]): r["new_value"] for r in c.execute(
                "SELECT platform_product_id, platform_sku_id, new_value "
                "FROM modifications WHERE field='pin_price' AND status='pending'"
            ).fetchall()}
            keys = set(dan) | set(pin)
            w.writerow(["商品ID（必填）", "商品名称", "SKUID（必填，注意不是SKU编码）", "规格名称",
                        "单买价", "拼单价", "规格编码"])
            for r in c.execute(
                "SELECT p.platform_product_id, p.name, s.platform_sku_id, s.spec_name, s.spec_code "
                "FROM skus s JOIN products p ON p.id=s.product_id ORDER BY p.id, s.id"
            ).fetchall():
                key = (r["platform_product_id"], r["platform_sku_id"])
                if key not in keys:
                    continue
                w.writerow([r["platform_product_id"], r["name"], r["platform_sku_id"],
                            r["spec_name"], dan.get(key, ""), pin.get(key, ""), r["spec_code"]])
            return "批量修改价格模板.csv", out.getvalue()

        if etype == "modify-stock":
            # 仅导出「待处理」库存修改（库存增减 = 新值）
            w.writerow(["商品ID（必填）", "商品名称", "SKUID（必填，注意不是SKU编码）", "规格名称",
                        "库存增减", "规格编码"])
            for r in c.execute(
                "SELECT m.platform_product_id, m.platform_sku_id, m.new_value, p.name, s.spec_name, s.spec_code "
                "FROM modifications m "
                "LEFT JOIN products p ON p.shop_id=m.shop_id AND p.platform_product_id=m.platform_product_id "
                "LEFT JOIN skus s ON s.product_id=p.id AND s.platform_sku_id=m.platform_sku_id "
                "WHERE m.field='stock' AND m.status='pending' ORDER BY m.id"
            ).fetchall():
                w.writerow([r["platform_product_id"], r["name"] or "", r["platform_sku_id"],
                            r["spec_name"] or "", r["new_value"], r["spec_code"] or ""])
            return "批量修改库存模板.csv", out.getvalue()

        if etype == "modify-code":
            # 仅导出「待处理」编码修改（改后商品编码 = 新值）
            w.writerow(["商品ID（必填）", "商品名称", "商品编码", "改后商品编码"])
            for r in c.execute(
                "SELECT m.platform_product_id, m.new_value, p.name, p.code "
                "FROM modifications m "
                "LEFT JOIN products p ON p.shop_id=m.shop_id AND p.platform_product_id=m.platform_product_id "
                "WHERE m.field='code' AND m.status='pending' ORDER BY m.id"
            ).fetchall():
                w.writerow([r["platform_product_id"], r["name"] or "", r["code"] or "", r["new_value"]])
            return "批量修改商品编码模板.csv", out.getvalue()

        if etype == "modifications":
            # 修改记录清单（审计用，含原值→新值 + 状态）
            w.writerow(["修改时间", "商品ID", "商品名称", "SKUID", "规格名称", "修改字段", "原值", "新值", "状态"])
            for r in c.execute(
                "SELECT m.*, p.name AS product_name, s.spec_name AS spec_name "
                "FROM modifications m "
                "LEFT JOIN products p ON p.shop_id=m.shop_id AND p.platform_product_id=m.platform_product_id "
                "LEFT JOIN skus s ON s.product_id=p.id AND s.platform_sku_id=m.platform_sku_id "
                "ORDER BY m.id"
            ).fetchall():
                w.writerow([r["created_at"], r["platform_product_id"], r["product_name"] or "",
                            r["platform_sku_id"], r["spec_name"] or "",
                            FIELD_LABELS.get(r["field"], r["field"]), r["old_value"], r["new_value"],
                            "已处理" if r["status"] == "done" else "待处理"])
            return "修改记录清单.csv", out.getvalue()

        if etype == "products":
            w.writerow(["商品ID", "商品名称", "货号编码", "SKU数"])
            for r in c.execute(
                "SELECT p.platform_product_id, p.name, p.code, "
                "(SELECT COUNT(*) FROM skus s WHERE s.product_id=p.id) AS sku_count "
                "FROM products p ORDER BY p.id"
            ).fetchall():
                w.writerow([r["platform_product_id"], r["name"], r["code"], r["sku_count"]])
            return "商品列表.csv", out.getvalue()

        if etype == "skus":
            w.writerow(["商品ID", "商品名称", "SKUID", "规格名称", "规格编码", "单买价", "拼单价", "库存"])
            for r in c.execute(
                "SELECT p.platform_product_id, p.name, s.platform_sku_id, s.spec_name, "
                "s.spec_code, s.dan_price, s.pin_price, s.stock "
                "FROM skus s JOIN products p ON p.id=s.product_id ORDER BY p.id, s.id"
            ).fetchall():
                w.writerow([r["platform_product_id"], r["name"], r["platform_sku_id"],
                            r["spec_name"], r["spec_code"],
                            _v(r["dan_price"]), _v(r["pin_price"]), _v(r["stock"])])
            return "SKU列表.csv", out.getvalue()

        if etype == "orders":
            w.writerow(["订单号", "订单状态", "商品数量(件)", "支付时间", "确认收货时间", "商品id",
                        "商品规格", "售后状态", "用户实付金额(元)", "商家实收金额(元)", "快递单号", "快递公司",
                        "省", "市", "区", "订单来源"])
            for r in c.execute("SELECT * FROM orders ORDER BY pay_time DESC").fetchall():
                w.writerow([r["order_no"], r["status"], r["quantity"], r["pay_time"], r["confirm_time"],
                            r["platform_product_id"], r["spec"], r["aftersale_status"],
                            _v(r["buyer_amount"]), _v(r["seller_amount"]),
                            r["tracking_no"], r["courier"],
                            r["province"], r["city"], r["district"], r["source"]])
            return "订单.csv", out.getvalue()

        if etype == "promotions":
            w.writerow(["商品ID", "商品名称", "推广场景", "推广名称", "出价方式", "分组", "时段",
                        "成交花费", "交易额", "实际投产比", "总花费", "净成交笔数", "曝光量", "点击量"])
            for r in c.execute("SELECT * FROM promotions ORDER BY id").fetchall():
                w.writerow([r["platform_product_id"], r["product_name"], r["scene"], r["plan_name"],
                            r["bid_type"], r["group_name"], r["period"],
                            _v(r["deal_spend"]), _v(r["deal_amount"]), _v(r["actual_roi"]),
                            _v(r["total_spend"]), _v(r["net_deal_count"]),
                            _v(r["impressions"]), _v(r["clicks"])])
            return "推广.csv", out.getvalue()

        raise ValueError(f"未知导出类型: {etype}")


def update_product_cost(shop_id: int, platform_product_id: str, cost_price) -> bool:
    """更新商品成本价（本地维护，cost_price 传 None 清空）。"""
    with closing(_conn()) as c:
        c.execute(
            "UPDATE products SET cost_price=? WHERE shop_id=? AND platform_product_id=?",
            (cost_price, shop_id, platform_product_id),
        )
        c.commit()
        return c.total_changes > 0


# 商品状态标签（本地维护，与平台真实上下架解耦，供选品决策用）
PRODUCT_STATUS = ["在售", "下架", "售罄", "清仓", "新品", "停推"]


def update_product_status(shop_id: int, platform_product_id: str, status: str) -> bool:
    """更新商品状态标签。status 传空字符串表示清除标签（回到默认）。"""
    if status not in PRODUCT_STATUS and status != "":
        raise ValueError(f"无效状态: {status}（可选：{'/'.join(PRODUCT_STATUS)}）")
    with closing(_conn()) as c:
        c.execute(
            "UPDATE products SET status=? WHERE shop_id=? AND platform_product_id=?",
            (status, shop_id, platform_product_id),
        )
        c.commit()
        return c.total_changes > 0


def selection_analysis() -> dict:
    """选品联动：把销量、访问、毛利、库存、推广 ROI、售后联动成选品建议。

    对每个商品综合打分，输出四象限建议：
    - 主力爆款（有销量 + 正毛利）
    - 潜力款（有访问/点击但成交少）
    - 滞销清仓（无成交 + 库存积压）
    - 亏损止损（负毛利）
    仅对有数据（订单/访问/推广/成本）的商品给出建议，纯空白商品不纳入。
    """
    with closing(_conn()) as c:
        # 每个商品的订单聚合
        orders = {}
        for r in c.execute(
            "SELECT platform_product_id, COUNT(*) AS n, ROUND(SUM(buyer_amount),2) AS amt, "
            "SUM(quantity) AS qty, "
            "SUM(CASE WHEN aftersale_status LIKE '%退款%' THEN 1 ELSE 0 END) AS refunds "
            "FROM orders GROUP BY platform_product_id"
        ).fetchall():
            orders[r["platform_product_id"]] = dict(r)

        # 每个商品的访问聚合（goods_effect 取累计 UV/PV）
        visits = {}
        for r in c.execute(
            "SELECT platform_product_id, ROUND(SUM(goods_uv),0) AS uv, ROUND(SUM(goods_pv),0) AS pv, "
            "ROUND(SUM(pay_ordr_amt),2) AS effect_amt, SUM(pay_ordr_cnt) AS effect_cnt "
            "FROM goods_effect GROUP BY platform_product_id"
        ).fetchall():
            visits[r["platform_product_id"]] = dict(r)

        # 每个商品的推广聚合
        promos = {}
        for r in c.execute(
            "SELECT platform_product_id, ROUND(SUM(total_spend),2) AS spend, "
            "ROUND(SUM(deal_amount),2) AS amt, SUM(impressions) AS imp, SUM(clicks) AS clk "
            "FROM promotions WHERE platform_product_id != '' GROUP BY platform_product_id"
        ).fetchall():
            promos[r["platform_product_id"]] = dict(r)

        # 商品基础信息 + SKU 库存/价格
        items = []
        for p in c.execute(
            "SELECT p.id, p.shop_id, p.platform_product_id, p.name, p.code, p.cost_price, p.status, "
            "sh.name AS shop_name, "
            "(SELECT MIN(COALESCE(s.pin_price, s.dan_price)) FROM skus s "
            " WHERE s.product_id=p.id AND (s.pin_price IS NOT NULL OR s.dan_price IS NOT NULL)) AS min_price, "
            "(SELECT MIN(s.stock) FROM skus s WHERE s.product_id=p.id AND s.stock IS NOT NULL) AS min_stock, "
            "(SELECT SUM(s.stock) FROM skus s WHERE s.product_id=p.id) AS total_stock, "
            "(SELECT COUNT(*) FROM skus s WHERE s.product_id=p.id) AS sku_count "
            "FROM products p LEFT JOIN shops sh ON sh.id=p.shop_id"
        ).fetchall():
            d = dict(p)
            ppid = d["platform_product_id"]
            od = orders.get(ppid, {})
            v = visits.get(ppid, {})
            pm = promos.get(ppid, {})
            d["orders"] = od.get("n", 0) or 0
            d["amount"] = od.get("amt", 0) or 0
            d["qty"] = od.get("qty", 0) or 0
            d["refunds"] = od.get("refunds", 0) or 0
            d["uv"] = v.get("uv", 0) or 0
            d["pv"] = v.get("pv", 0) or 0
            d["effect_cnt"] = v.get("effect_cnt", 0) or 0
            d["ad_spend"] = pm.get("spend", 0) or 0
            d["ad_amt"] = pm.get("amt", 0) or 0
            d["impressions"] = pm.get("imp", 0) or 0
            d["clicks"] = pm.get("clk", 0) or 0
            # 毛利率
            cost = d["cost_price"]
            price = d["min_price"]
            d["margin"] = round((price - cost) / price * 100, 1) if (cost is not None and price and price > 0) else None
            # ROI（成交额 / 花费）
            d["roi"] = round(d["ad_amt"] / d["ad_spend"], 2) if d["ad_spend"] else None
            # 是否有任何数据
            d["has_data"] = bool(d["orders"] or d["uv"] or d["ad_spend"] or cost is not None)
            items.append(d)

        # 打分 + 建议标签
        for it in items:
            label, score, reason = _classify(it)
            it["label"] = label
            it["score"] = score
            it["reason"] = reason

        # 有数据的按 score 排序，无数据的排除
        ranked = sorted([x for x in items if x["has_data"]], key=lambda x: x["score"], reverse=True)
        summary = {
            "total": len(items),
            "with_data": len(ranked),
            "labels": {},
        }
        for it in ranked:
            summary["labels"][it["label"]] = summary["labels"].get(it["label"], 0) + 1
        return {"summary": summary, "items": ranked}


def _classify(it: dict) -> tuple[str, int, str]:
    """给单个商品打选品建议标签。返回 (label, score, reason)。"""
    margin = it["margin"]
    has_cost = it["cost_price"] is not None
    orders = it["orders"]
    uv = it["uv"]
    ad_spend = it["ad_spend"]
    min_stock = it["min_stock"]

    # 亏损止损：有成本且负毛利，且还在投广告或压货
    if has_cost and margin is not None and margin < 0:
        return ("亏损止损", 0, f"毛利率 {margin}%（成本 ¥{it['cost_price']} 高于售价 ¥{it['min_price']}）")

    # 主力爆款：有成交 + 正毛利（或无成本但有成交）
    if orders > 0 and (margin is None or margin >= 0):
        m = f"毛利 {margin}%" if margin is not None else "未设成本"
        return ("主力爆款", 90 + min(orders, 10), f"{orders} 单成交，{m}")

    # 潜力款：有访问/点击但成交少
    if uv > 0 or it["effect_cnt"] > 0 or ad_spend > 0:
        return ("潜力款", 50 + min(int(uv), 30), f"访问 {uv}，成交仅 {orders} 单，需优化转化")

    # 滞销清仓：无成交无访问，但库存积压（min_stock 有值）
    if min_stock is not None and min_stock > 0:
        return ("滞销清仓", 20, f"无成交无访问，库存 {it['total_stock'] or min_stock} 件积压")

    # 有成本但完全没动销
    if has_cost:
        return ("滞销清仓", 15, "已设成本但无任何成交/访问数据")

    # 有数据但无法归类（极少情况）
    return ("观察", 10, "数据不足")


def promotions_analysis() -> dict:
    """推广数据汇总 + 按商品聚合 ROI 排行。"""
    with closing(_conn()) as c:
        s = c.execute(
            "SELECT COUNT(*) AS n, ROUND(SUM(deal_spend),2) AS spend, ROUND(SUM(deal_amount),2) AS amt, "
            "ROUND(SUM(total_spend),2) AS total_spend, SUM(net_deal_count) AS deals, "
            "SUM(impressions) AS imp, SUM(clicks) AS clk FROM promotions"
        ).fetchone()
        n = s["n"] or 0
        spend = s["spend"] or 0.0
        amt = s["amt"] or 0.0
        total_spend = s["total_spend"] or 0.0
        avg_roi = round(amt / total_spend, 2) if total_spend else None
        top_roi = [dict(r) for r in c.execute(
            "SELECT platform_product_id, MAX(product_name) AS product_name, "
            "ROUND(SUM(deal_spend),2) AS spend, ROUND(SUM(deal_amount),2) AS amt, "
            "ROUND(SUM(total_spend),2) AS total_spend, SUM(net_deal_count) AS deals, "
            "SUM(impressions) AS imp, SUM(clicks) AS clk "
            "FROM promotions WHERE platform_product_id != '' GROUP BY platform_product_id "
            "ORDER BY amt DESC LIMIT 20"
        ).fetchall()]
        for r in top_roi:
            r["roi"] = round(r["amt"] / r["total_spend"], 2) if r["total_spend"] else None
        return {
            "summary": {
                "count": n, "spend": spend, "amt": amt, "total_spend": total_spend,
                "avg_roi": avg_roi, "deals": s["deals"] or 0,
                "impressions": s["imp"] or 0, "clicks": s["clk"] or 0,
            },
            "top_roi": top_roi,
        }


def low_stock(threshold: int = 10) -> list[dict]:
    """低库存 SKU 列表（stock <= threshold，关联商品名）。"""
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT p.platform_product_id, p.name, p.code, s.platform_sku_id, s.spec_name, s.spec_code, s.stock "
            "FROM skus s JOIN products p ON p.id = s.product_id "
            "WHERE s.stock IS NOT NULL AND s.stock <= ? "
            "ORDER BY s.stock ASC LIMIT 100",
            (threshold,),
        ).fetchall()
        return [dict(r) for r in rows]


# ----------------------------- 导入 CSV -----------------------------

# 导入字段映射（中文表头 → 内部字段名）
IMPORT_FIELDS = {
    "products": [
        ("商品ID", "platform_product_id"),
        ("商品名称", "name"),
        ("货号编码", "code"),
    ],
    "skus": [
        ("商品ID", "platform_product_id"),
        ("SKUID", "platform_sku_id"),
        ("规格名称", "spec_name"),
        ("规格编码", "spec_code"),
        ("单买价", "dan_price"),
        ("拼单价", "pin_price"),
        ("库存", "stock"),
    ],
    "orders": [
        ("订单号", "order_no"),
        ("订单状态", "status"),
        ("商品数量(件)", "quantity"),
        ("支付时间", "pay_time"),
        ("确认收货时间", "confirm_time"),
        ("商品id", "platform_product_id"),
        ("商品规格", "spec"),
        ("售后状态", "aftersale_status"),
        ("用户实付金额(元)", "buyer_amount"),
        ("商家实收金额(元)", "seller_amount"),
        ("快递单号", "tracking_no"),
        ("快递公司", "courier"),
        ("省", "province"),
        ("市", "city"),
        ("区", "district"),
        ("订单来源", "source"),
    ],
    "promotions": [
        ("商品ID", "platform_product_id"),
        ("商品名称", "product_name"),
        ("推广场景", "scene"),
        ("推广名称", "plan_name"),
        ("出价方式", "bid_type"),
        ("分组", "group_name"),
        ("时段", "period"),
        ("成交花费", "deal_spend"),
        ("交易额", "deal_amount"),
        ("实际投产比", "actual_roi"),
        ("总花费", "total_spend"),
        ("净成交笔数", "net_deal_count"),
        ("曝光量", "impressions"),
        ("点击量", "clicks"),
    ],
}

NUMERIC_FIELDS = {
    "dan_price", "pin_price", "stock", "quantity", "buyer_amount", "seller_amount",
    "deal_spend", "deal_amount", "actual_roi", "total_spend", "net_deal_count",
    "impressions", "clicks",
}

# 模板示例行（表头下第一行，方便用户理解格式）
TEMPLATE_EXAMPLES = {
    "products": ["1005751284107", "塑料透明鞋柜家用鞋架防尘可折叠多层收纳", "S005"],
    "skus": ["1005751284107", "1234567890", "白色-大号", "S005-W", "39.90", "29.90", "100"],
    "orders": ["PDD20260922001", "已支付", "1", "2026-09-22 10:00:00", "", "1005751284107",
               "白色-大号", "无售后或售后取消", "29.90", "28.00", "SF1234567890", "顺丰速运",
               "广东省", "深圳市", "南山区", "自然搜索"],
    "promotions": ["1005751284107", "塑料透明鞋柜", "多多搜索", "推广计划A", "手动出价",
                   "分组1", "2026-09", "50.00", "200.00", "4.00", "60.00", "5", "1000", "80"],
}


def _parse_csv_rows(etype: str, csv_text: str) -> list[dict]:
    import csv
    import io
    text = csv_text.lstrip("\ufeff")
    reader = csv.DictReader(io.StringIO(text))
    field_map = IMPORT_FIELDS[etype]
    rows = []
    for raw in reader:
        rec = {}
        for cn, field in field_map:
            v = (raw.get(cn) or "").strip()
            if field in NUMERIC_FIELDS:
                if v == "":
                    rec[field] = None
                else:
                    try:
                        rec[field] = float(v) if "." in v else int(v)
                    except Exception:
                        rec[field] = None
            else:
                rec[field] = v
        rows.append(rec)
    return rows


def import_csv(etype: str, shop_id: int, csv_text: str) -> dict:
    """网页导入入口：解析 CSV → 调对应 import 函数写库。返回 {imported, skipped}。"""
    if etype not in IMPORT_FIELDS:
        raise ValueError(f"未知导入类型: {etype}")
    rows = _parse_csv_rows(etype, csv_text)

    if etype == "products":
        products = [{"platform_product_id": r["platform_product_id"], "name": r.get("name", ""),
                     "code": r.get("code", "")} for r in rows if r["platform_product_id"]]
        stats = import_batch(shop_id, products, [])
        return {"imported": len(products), "skipped": len(rows) - len(products), "stats": stats}

    if etype == "skus":
        skus = [{"platform_product_id": r["platform_product_id"], "platform_sku_id": r["platform_sku_id"],
                 "spec_name": r.get("spec_name", ""), "spec_code": r.get("spec_code", ""),
                 "dan_price": r.get("dan_price"), "pin_price": r.get("pin_price"),
                 "stock": r.get("stock")} for r in rows if r["platform_product_id"] and r["platform_sku_id"]]
        stats = import_batch(shop_id, [], skus)
        return {"imported": len(skus), "skipped": len(rows) - len(skus), "stats": stats}

    if etype == "orders":
        orders = [r for r in rows if r.get("order_no")]
        n = import_orders(shop_id, orders)
        return {"imported": n, "skipped": len(rows) - len(orders)}

    if etype == "promotions":
        promos = [r for r in rows if r.get("platform_product_id")]
        n = import_promotions(shop_id, promos)
        return {"imported": n, "skipped": len(rows) - len(promos)}

    raise ValueError(f"未知导入类型: {etype}")


def template_csv(etype: str) -> tuple:
    """返回 (文件名, CSV内容) 的导入模板（表头 + 一行示例）。"""
    import csv
    import io
    if etype not in IMPORT_FIELDS:
        raise ValueError(f"未知模板类型: {etype}")
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow([cn for cn, _ in IMPORT_FIELDS[etype]])
    if etype in TEMPLATE_EXAMPLES:
        w.writerow(TEMPLATE_EXAMPLES[etype])
    names = {
        "products": "商品列表", "skus": "SKU价格库存", "orders": "订单", "promotions": "推广",
    }
    return f"导入模板-{names.get(etype, etype)}.csv", out.getvalue()
