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
CREATE UNIQUE INDEX IF NOT EXISTS idx_promotions_uniq ON promotions(shop_id, platform_product_id, scene, plan_name, group_name, period);

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

CREATE TABLE IF NOT EXISTS title_opt (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL,
    platform_product_id TEXT NOT NULL,
    product_name TEXT DEFAULT '',
    product_code TEXT DEFAULT '',
    old_title TEXT DEFAULT '',
    new_title TEXT DEFAULT '',
    status TEXT DEFAULT 'selected',
    opt_date TEXT DEFAULT '',
    baseline TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(shop_id, platform_product_id)
);

CREATE INDEX IF NOT EXISTS idx_title_opt_shop ON title_opt(shop_id);

CREATE TABLE IF NOT EXISTS freight (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_name TEXT DEFAULT '',
    tracking_no TEXT UNIQUE,
    courier TEXT DEFAULT '',
    ship_date TEXT DEFAULT '',
    province TEXT DEFAULT '',
    city TEXT DEFAULT '',
    weight REAL,
    freight_cost REAL,
    bill_fee REAL,
    extra_fee REAL,
    total REAL,
    matched_order_no TEXT DEFAULT '',
    matched_shop_id INTEGER,
    matched INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_freight_tracking ON freight(tracking_no);

CREATE TABLE IF NOT EXISTS freight_rate (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    courier TEXT DEFAULT '中通快递',
    account_name TEXT DEFAULT '嘉裕工艺品',
    region_group TEXT DEFAULT '',
    provinces TEXT DEFAULT '',
    w0_05 REAL,
    w05_1 REAL,
    w1_2 REAL,
    w2_3 REAL,
    first_price REAL,
    add_price REAL,
    effective_from TEXT DEFAULT '2025-11-10',
    remark TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    contact TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    source TEXT DEFAULT '',
    remark TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS supplier_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    category TEXT DEFAULT '',
    product_name TEXT DEFAULT '',
    product_code TEXT DEFAULT '',
    spec TEXT DEFAULT '',
    color TEXT DEFAULT '',
    supply_price REAL,
    retail_price REAL,
    weight REAL,
    box_spec TEXT DEFAULT '',
    stock TEXT DEFAULT '',
    source_url TEXT DEFAULT '',
    image TEXT DEFAULT '',
    remark TEXT DEFAULT '',
    raw_json TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
);

CREATE INDEX IF NOT EXISTS idx_sp_supplier ON supplier_products(supplier_id);
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
        _seed_freight_rate(c)


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
    # supplier_products 表 image 列（产品图片）
    spcols = {r[1] for r in conn.execute("PRAGMA table_info(supplier_products)").fetchall()}
    if "image" not in spcols:
        conn.execute("ALTER TABLE supplier_products ADD COLUMN image TEXT DEFAULT ''")
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
        # 补关联该店铺订单（先导订单后导商品的场景）
        conn.execute(
            "UPDATE orders SET product_id = (SELECT p.id FROM products p "
            "WHERE p.shop_id=orders.shop_id AND p.platform_product_id=orders.platform_product_id) "
            "WHERE shop_id=? AND product_id IS NULL", (shop_id,))
        conn.commit()
        return catalog_stats(conn)
    finally:
        conn.close()


def relink_orders(shop_id: int = None) -> int:
    """按 platform_product_id 补关联订单 product_id（先导订单后导商品的场景）。

    返回修复的订单数。
    """
    conn = _conn()
    try:
        if shop_id is not None:
            cur = conn.execute(
                "UPDATE orders SET product_id = (SELECT p.id FROM products p "
                "WHERE p.shop_id=orders.shop_id AND p.platform_product_id=orders.platform_product_id) "
                "WHERE shop_id=? AND product_id IS NULL", (shop_id,))
        else:
            cur = conn.execute(
                "UPDATE orders SET product_id = (SELECT p.id FROM products p "
                "WHERE p.shop_id=orders.shop_id AND p.platform_product_id=orders.platform_product_id) "
                "WHERE product_id IS NULL")
        conn.commit()
        return cur.rowcount
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
                "product_id=CASE WHEN excluded.product_id IS NOT NULL THEN excluded.product_id ELSE orders.product_id END, "
                "buyer_amount=excluded.buyer_amount, seller_amount=excluded.seller_amount, "
                "province=excluded.province, city=excluded.city, district=excluded.district, "
                "source=excluded.source, aftersale_status=excluded.aftersale_status, "
                "tracking_no=CASE WHEN excluded.tracking_no != '' THEN excluded.tracking_no ELSE orders.tracking_no END, "
                "courier=CASE WHEN excluded.courier != '' THEN excluded.courier ELSE orders.courier END, "
                "confirm_time=CASE WHEN excluded.confirm_time != '' THEN excluded.confirm_time ELSE orders.confirm_time END",
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
                "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(shop_id, platform_product_id, scene, plan_name, group_name, period) "
                "DO UPDATE SET product_id=excluded.product_id, product_name=excluded.product_name, "
                "bid_type=excluded.bid_type, deal_spend=excluded.deal_spend, deal_amount=excluded.deal_amount, "
                "actual_roi=excluded.actual_roi, total_spend=excluded.total_spend, "
                "net_deal_count=excluded.net_deal_count, impressions=excluded.impressions, "
                "clicks=excluded.clicks, metrics=excluded.metrics",
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


# ----------------------------- 运费账单 -----------------------------

def import_freight(rows: list[dict]) -> dict:
    """批量导入运费账单（快递公司账单），导入后自动匹配订单。

    rows: [{tracking_no, account_name, courier, ship_date, province, city,
            weight, freight_cost, bill_fee, extra_fee, total}]
    返回 {imported, skipped, matched}。
    """
    conn = _conn()
    try:
        imported = skipped = 0
        for r in rows:
            tn = (r.get("tracking_no") or "").strip()
            if not tn:
                skipped += 1
                continue
            conn.execute(
                "INSERT INTO freight(account_name, tracking_no, courier, ship_date, "
                "province, city, weight, freight_cost, bill_fee, extra_fee, total) "
                "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(tracking_no) DO UPDATE SET "
                "account_name=excluded.account_name, courier=excluded.courier, "
                "ship_date=excluded.ship_date, province=excluded.province, city=excluded.city, "
                "weight=excluded.weight, freight_cost=excluded.freight_cost, "
                "bill_fee=excluded.bill_fee, extra_fee=excluded.extra_fee, total=excluded.total",
                (r.get("account_name", ""), tn, r.get("courier", ""),
                 r.get("ship_date", ""), r.get("province", ""), r.get("city", ""),
                 r.get("weight"), r.get("freight_cost"), r.get("bill_fee"),
                 r.get("extra_fee"), r.get("total")),
            )
            imported += 1
        conn.commit()
        matched = _match_freight(conn)
        return {"imported": imported, "skipped": skipped, "matched": matched}
    finally:
        conn.close()


def _match_freight(conn) -> int:
    """按 tracking_no 精确匹配 orders，反填 matched_order_no / matched_shop_id。
    返回本次新匹配数量。"""
    n = 0
    rows = conn.execute(
        "SELECT id, tracking_no FROM freight WHERE matched = 0"
    ).fetchall()
    for fr in rows:
        o = conn.execute(
            "SELECT order_no, shop_id FROM orders WHERE tracking_no = ? LIMIT 1",
            (fr["tracking_no"],),
        ).fetchone()
        if o:
            conn.execute(
                "UPDATE freight SET matched=1, matched_order_no=?, matched_shop_id=? WHERE id=?",
                (o["order_no"], o["shop_id"], fr["id"]),
            )
            n += 1
    conn.commit()
    return n


def match_freight() -> dict:
    """重新匹配所有未匹配的运费单（订单数据补齐后调用）。"""
    with closing(_conn()) as c:
        n = _match_freight(c)
        total = c.execute("SELECT COUNT(*) FROM freight").fetchone()[0]
        matched = c.execute("SELECT COUNT(*) FROM freight WHERE matched=1").fetchone()[0]
        return {"new_matched": n, "total": total, "matched": matched}


def list_freight(limit: int = 5000, unmatched_only: bool = False) -> list[dict]:
    with closing(_conn()) as c:
        sql = ("SELECT f.*, s.name AS shop_name FROM freight f "
               "LEFT JOIN shops s ON s.id = f.matched_shop_id")
        if unmatched_only:
            sql += " WHERE f.matched = 0"
        sql += " ORDER BY f.ship_date DESC LIMIT ?"
        return [dict(r) for r in c.execute(sql, (limit,)).fetchall()]


def freight_analysis(month: str = None, shop_id: int = None) -> dict:
    """运费账单分析：汇总 + 匹配率 + 月度趋势 + 目的地 + 快递公司。
    month: 按月筛选（YYYY-MM）；shop_id: 按匹配到的店铺筛选。"""
    with closing(_conn()) as c:
        w = []
        args = []
        if month:
            w.append("substr(f.ship_date,1,7) = ?")
            args.append(month)
        if shop_id:
            w.append("f.matched_shop_id = ?")
            args.append(shop_id)
        where = (" WHERE " + " AND ".join(w)) if w else ""
        ext = (" AND " + " AND ".join(w)) if w else ""
        wargs = tuple(args)

        total = c.execute("SELECT COUNT(*) FROM freight f" + where, wargs).fetchone()[0]
        matched = c.execute(
            "SELECT COUNT(*) FROM freight f WHERE f.matched=1" + ext, wargs).fetchone()[0]
        tot_fee = c.execute(
            "SELECT COALESCE(SUM(f.total),0) FROM freight f" + where, wargs).fetchone()[0]
        tot_fee = round(tot_fee, 2)
        avg_fee = round(tot_fee / total, 2) if total else 0
        # 月度趋势始终返回全量（供前端月份导航），不受筛选影响
        monthly = c.execute(
            "SELECT substr(f.ship_date,1,7) ym, COUNT(*) n, ROUND(SUM(COALESCE(f.total,0)),2) amt "
            "FROM freight f GROUP BY ym ORDER BY ym"
        ).fetchall()
        provs = c.execute(
            "SELECT f.province, COUNT(*) n FROM freight f WHERE f.province != ''" + ext +
            " GROUP BY f.province ORDER BY n DESC LIMIT 10", wargs).fetchall()
        couriers = c.execute(
            "SELECT f.courier, COUNT(*) n FROM freight f WHERE f.courier != ''" + ext +
            " GROUP BY f.courier ORDER BY n DESC", wargs).fetchall()
        gmv = c.execute(
            "SELECT COALESCE(SUM(o.buyer_amount),0) FROM freight f "
            "JOIN orders o ON o.order_no = f.matched_order_no" + where, wargs).fetchone()[0]
        gmv = round(gmv, 2)
        matched_fee = c.execute(
            "SELECT COALESCE(SUM(f.total),0) FROM freight f WHERE f.matched=1" + ext, wargs).fetchone()[0]
        matched_fee = round(matched_fee, 2)
        return {
            "total": total, "matched": matched,
            "match_rate": round(matched / total * 100, 1) if total else 0,
            "total_fee": tot_fee, "avg_fee": avg_fee,
            "matched_gmv": gmv, "matched_fee": matched_fee,
            "fee_gmv_ratio": round(matched_fee / gmv * 100, 2) if gmv else None,
            "monthly": [dict(r) for r in monthly],
            "provinces": [dict(r) for r in provs],
            "couriers": [dict(r) for r in couriers],
        }


def freight_match_analysis(month: str = None, shop_id: int = None) -> dict:
    """运费匹配分析：相同商品+规格+数量的订单，标准运费 vs 异常运费。

    按 (platform_product_id, spec, quantity) 分组，每组找标准运费（众数），
    标出偏离标准运费的异常单（显示差值/重量/目的地，判断成因）。
    month: 按月筛选（YYYY-MM）；shop_id: 按匹配到的店铺筛选。
    """
    from collections import Counter
    with closing(_conn()) as c:
        w = ["o.spec != ''"]
        args = []
        if month:
            w.append("substr(f.ship_date,1,7) = ?")
            args.append(month)
        if shop_id:
            w.append("f.matched_shop_id = ?")
            args.append(shop_id)
        rows = c.execute(
            "SELECT f.tracking_no, f.total, f.weight, f.province, f.city, "
            "o.platform_product_id, o.spec, o.quantity, o.order_no "
            "FROM freight f JOIN orders o ON o.order_no = f.matched_order_no "
            "WHERE " + " AND ".join(w),
            tuple(args),
        ).fetchall()
        groups = {}
        for r in rows:
            key = (r["platform_product_id"], r["spec"], r["quantity"])
            groups.setdefault(key, []).append(dict(r))

        anomalies = []
        group_summary = []
        for (ppid, spec, qty), items in groups.items():
            fee_counter = Counter(it["total"] for it in items)
            standard_fee = fee_counter.most_common(1)[0][0]
            n = len(items)
            anomaly_items = [it for it in items if it["total"] != standard_fee]
            for it in anomaly_items:
                anomalies.append({
                    "tracking_no": it["tracking_no"],
                    "order_no": it["order_no"],
                    "platform_product_id": ppid,
                    "spec": spec,
                    "quantity": it["quantity"],
                    "standard_fee": standard_fee,
                    "actual_fee": it["total"],
                    "diff": round((it["total"] or 0) - (standard_fee or 0), 2),
                    "weight": it["weight"],
                    "province": it["province"],
                    "city": it["city"],
                })
            group_summary.append({
                "platform_product_id": ppid,
                "spec": spec,
                "quantity": qty,
                "n": n,
                "standard_fee": standard_fee,
                "max_fee": max(it["total"] or 0 for it in items),
                "anomaly_count": len(anomaly_items),
            })

        anomalies.sort(key=lambda x: x["diff"], reverse=True)
        group_summary.sort(key=lambda x: -x["anomaly_count"])
        return {
            "total_groups": len(groups),
            "anomaly_total": len(anomalies),
            "groups": group_summary,
            "anomalies": anomalies,
        }


# ----------------------------- 运费报价单 -----------------------------

# (region_group, provinces, w0_05, w05_1, w1_2, w2_3, first_price, add_price)
FREIGHT_RATE_SEED = [
    ("福建", "福建", 2.5, 3.0, 4.2, 5.4, 4.0, 1.2),
    ("上海、浙江、广东", "上海,浙江,广东", 2.5, 3.0, 4.2, 5.4, 5.0, 1.8),
    ("江苏、安徽、湖南、湖北、江西", "江苏,安徽,湖南,湖北,江西", 2.5, 3.0, 4.2, 5.4, 5.0, 2.5),
    ("北京、山东、河北、河南、天津、广西、陕西、四川、贵州、重庆、山西",
     "北京,山东,河北,河南,天津,广西,陕西,四川,贵州,重庆,山西", 2.5, 3.0, 4.2, 5.4, 7.0, 3.5),
    ("黑龙江、吉林、辽宁、海南、云南", "黑龙江,吉林,辽宁,海南,云南", 2.9, 3.7, 5.8, 6.8, 8.0, 5.0),
    ("宁夏、青海、甘肃、内蒙古", "宁夏,青海,甘肃,内蒙古", 5.2, 6.2, None, None, 8.0, 7.0),
    ("新疆", "新疆", 7.2, 10.2, None, None, 12.0, 12.0),
    ("西藏", "西藏", 9.2, 13.2, None, None, 19.0, 16.0),
]


def _seed_freight_rate(conn) -> int:
    """幂等录入报价单（表空才插入）。返回当前条数。"""
    n = conn.execute("SELECT COUNT(*) FROM freight_rate").fetchone()[0]
    if n > 0:
        return n
    for (rg, provs, w0, w1, w12, w23, fp, ap) in FREIGHT_RATE_SEED:
        conn.execute(
            "INSERT INTO freight_rate(region_group, provinces, w0_05, w05_1, w1_2, w2_3, first_price, add_price) "
            "VALUES(?,?,?,?,?,?,?,?)",
            (rg, provs, w0, w1, w12, w23, fp, ap),
        )
    conn.commit()
    return len(FREIGHT_RATE_SEED)


def list_freight_rate() -> list[dict]:
    with closing(_conn()) as c:
        return [dict(r) for r in c.execute("SELECT * FROM freight_rate ORDER BY id").fetchall()]


def _find_rate(rates, province):
    for r in rates:
        provs = [p.strip() for p in (r["provinces"] or "").split(",") if p.strip()]
        if any(p in province for p in provs):
            return r
    return None


def calc_freight(province: str, city: str, weight: float, rates=None) -> dict:
    """按目的地省市区 + 重量计算标准运费。

    返回 {region_group, base, surcharge, total, weight}，未匹配到报价组返回 None。
    计费：≤3kg 按分段区间直查（/ 区间走首重+续重）；>3kg 首重(1kg)+续重×(重量-1)。
    """
    province = (province or "").strip()
    city = (city or "").strip()
    if not province or weight is None:
        return None
    if rates is None:
        rates = list_freight_rate()
    rate = _find_rate(rates, province)
    if not rate:
        return None
    if weight <= 0.5:
        base = rate["w0_05"]
    elif weight <= 1:
        base = rate["w05_1"]
    elif weight <= 2 and rate["w1_2"] is not None:
        base = rate["w1_2"]
    elif weight <= 3 and rate["w2_3"] is not None:
        base = rate["w2_3"]
    else:
        base = (rate["first_price"] or 0) + (rate["add_price"] or 0) * (weight - 1)
    surcharge = 0.0
    if "北京" in province:
        surcharge = 1.5
    elif "上海" in province:
        surcharge = 1.0
    elif "深圳" in city:
        surcharge = 0.5
    elif "海南" in province:
        surcharge = 0.5
    return {
        "region_group": rate["region_group"],
        "base": round(base or 0, 2),
        "surcharge": surcharge,
        "total": round((base or 0) + surcharge, 2),
        "weight": weight,
    }


def freight_compare() -> dict:
    """自动对账：实际运费 vs 报价单标准，标多收/少收/相符。"""
    with closing(_conn()) as c:
        rates = list_freight_rate()
        rows = c.execute(
            "SELECT f.tracking_no, f.total AS actual, f.weight, f.province, f.city, "
            "o.order_no, o.spec FROM freight f "
            "JOIN orders o ON o.order_no = f.matched_order_no "
            "WHERE f.matched = 1 AND f.weight IS NOT NULL"
        ).fetchall()
        items = []
        match = over = under = 0
        for r in rows:
            calc = calc_freight(r["province"], r["city"], r["weight"], rates)
            if calc is None:
                continue
            actual = r["actual"] or 0
            diff = round(actual - calc["total"], 2)
            status = "相符" if abs(diff) < 0.005 else ("多收" if diff > 0 else "少收")
            if status == "相符":
                match += 1
            elif status == "多收":
                over += 1
            else:
                under += 1
            items.append({
                "tracking_no": r["tracking_no"], "order_no": r["order_no"],
                "spec": r["spec"], "province": r["province"], "city": r["city"],
                "weight": r["weight"], "region_group": calc["region_group"],
                "standard": calc["total"], "actual": actual, "diff": diff, "status": status,
            })
        items.sort(key=lambda x: -x["diff"])
        over_amount = round(sum(x["diff"] for x in items if x["status"] == "多收"), 2)
        return {
            "total_compared": len(items),
            "match": match, "over": over, "under": under,
            "over_amount": over_amount,
            "items": items,
        }


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


def _perf_summary(c, shop_id=None, start=None, end=None, statuses=None) -> dict:
    """经营分析 summary（统一口径，供 catalog_performance / catalog_performance_all 复用）。

    start/end: 日期字符串 "YYYY-MM-DD"，提供时仅统计该时间段订单（含边界当天）。
    statuses: 订单状态列表，提供时仅统计这些状态订单（空/None = 全部状态，支持多选）。

    口径（跨平台通用）：
    - order_count     总订单数（含未发货/已取消/待付款）
    - shipped_count   有发货订单数 = 订单状态含「已发货/已收货/已完成/交易成功」或 有快递单号
                      （抖音订单状态列为空，靠快递单号判定发货）
    - aftersale_count 发货后售后数 = 有发货 且 售后状态非空且非「无售后」
    - aftersale_rate  售后率 = 发货后售后 ÷ 有发货订单 ×100%（发货后口径，剔除未发货退款）
    - unshipped_refund 未发货退款数 = 无发货 但有售后（下单后未发货即退款，算下单流失）
    - canceled         已取消/关闭数 = 状态含「取消」或「关闭」
    """
    SHIPPED = ("(status LIKE '%已发货%' OR status LIKE '%已收货%' OR status LIKE '%已完成%' "
               "OR status LIKE '%交易成功%' OR tracking_no != '')")
    REFUND = "(aftersale_status != '' AND aftersale_status NOT LIKE '无售后%')"
    CANCELED = "(status LIKE '%取消%' OR status LIKE '%关闭%')"
    conds = []
    args = []
    if shop_id:
        conds.append("shop_id=?")
        args.append(shop_id)
    if start:
        conds.append("pay_time >= ?")
        args.append(start)
    if end:
        conds.append("pay_time <= ?")
        args.append(end + " 23:59:59")
    if statuses:
        conds.append("status IN (" + ",".join("?" * len(statuses)) + ")")
        args.extend(statuses)
    w = (" WHERE " + " AND ".join(conds)) if conds else ""
    s = c.execute(
        "SELECT COUNT(*) AS order_count, SUM(buyer_amount) AS gmv, "
        "SUM(seller_amount) AS seller_amt, SUM(quantity) AS item_count, "
        "SUM(CASE WHEN " + SHIPPED + " THEN 1 ELSE 0 END) AS shipped_count, "
        "SUM(CASE WHEN " + SHIPPED + " AND " + REFUND + " THEN 1 ELSE 0 END) AS aftersale_count, "
        "SUM(CASE WHEN NOT " + SHIPPED + " AND " + REFUND + " THEN 1 ELSE 0 END) AS unshipped_refund, "
        "SUM(CASE WHEN " + CANCELED + " THEN 1 ELSE 0 END) AS canceled "
        "FROM orders" + w, args
    ).fetchone()
    order_count = s["order_count"] or 0
    shipped_count = s["shipped_count"] or 0
    gmv = s["gmv"] or 0.0
    aftersale_count = s["aftersale_count"] or 0
    return {
        "order_count": order_count,
        "shipped_count": shipped_count,
        "gmv": round(gmv, 2),
        "seller_amt": round(s["seller_amt"] or 0.0, 2),
        "item_count": s["item_count"] or 0,
        "avg_order": round(gmv / order_count, 2) if order_count else 0.0,
        "aftersale_count": aftersale_count,
        "aftersale_rate": round(aftersale_count / shipped_count * 100, 1) if shipped_count else 0.0,
        "unshipped_refund": s["unshipped_refund"] or 0,
        "canceled": s["canceled"] or 0,
    }


def catalog_performance(shop_id: int = None, start: str = None, end: str = None,
                        statuses: list = None) -> dict:
    """商品库经营分析：销售概览 + 商品销量排行 + 日趋势 + 地区分布 + 售后。
    shop_id 提供时按店铺筛选；start/end 提供时按时间段筛选（含边界当天）；
    statuses 提供时按订单状态筛选（列表，支持多选；空/None = 全部状态）。
    """
    with closing(_conn()) as c:
        def _w(prefix=""):
            cs, as_ = [], []
            if shop_id:
                cs.append(prefix + "shop_id=?"); as_.append(shop_id)
            if start:
                cs.append(prefix + "pay_time >= ?"); as_.append(start)
            if end:
                cs.append(prefix + "pay_time <= ?"); as_.append(end + " 23:59:59")
            if statuses:
                cs.append(prefix + "status IN (" + ",".join("?" * len(statuses)) + ")")
                as_.extend(statuses)
            return cs, as_

        # 商品销量/销售额排行（关联商品名/货号）
        ocs, oargs = _w("o.")
        top_products = [dict(r) for r in c.execute(
            "SELECT o.platform_product_id, "
            "COALESCE(p.name,'') AS name, COALESCE(p.code,'') AS code, "
            "COUNT(*) AS orders, ROUND(SUM(o.buyer_amount),2) AS amount, SUM(o.quantity) AS qty "
            "FROM orders o LEFT JOIN products p ON p.platform_product_id = o.platform_product_id "
            + ((" WHERE " + " AND ".join(ocs)) if ocs else "") +
            " GROUP BY o.platform_product_id ORDER BY amount DESC, orders DESC LIMIT 20", oargs
        ).fetchall()]

        # 按日趋势（排除空支付时间）
        cs, args = _w("")
        cs = ["pay_time != ''"] + cs
        daily_trend = [dict(r) for r in c.execute(
            "SELECT substr(pay_time,1,10) AS date, COUNT(*) AS orders, "
            "ROUND(SUM(buyer_amount),2) AS amount "
            "FROM orders WHERE " + " AND ".join(cs) +
            " GROUP BY date ORDER BY date", args
        ).fetchall()]

        # 地区分布 TOP（过滤拼多多脱敏的 ****）
        cs2, args2 = _w("")
        cs2 = ["province != ''", "province != '****'"] + cs2
        regions = [dict(r) for r in c.execute(
            "SELECT province, COUNT(*) AS orders, ROUND(SUM(buyer_amount),2) AS amount "
            "FROM orders WHERE " + " AND ".join(cs2) +
            " GROUP BY province ORDER BY orders DESC LIMIT 10", args2
        ).fetchall()]

        return {
            "summary": _perf_summary(c, shop_id, start, end, statuses),
            "top_products": top_products,
            "daily_trend": daily_trend,
            "regions": regions,
        }


def catalog_performance_all(start: str = None, end: str = None, statuses: list = None) -> dict:
    """经营分析：全部店铺汇总 + 各店铺 summary 对比 + 服务器日期（供前端一屏直看）。

    start/end: 日期字符串 "YYYY-MM-DD"，提供时仅统计该时间段订单。
    statuses: 订单状态列表（支持多选；空/None = 全部状态）。
    """
    with closing(_conn()) as c:
        shops = c.execute(
            "SELECT s.id, s.name, COALESCE(p.name,'') AS platform FROM shops s "
            "LEFT JOIN platforms p ON p.id = s.platform_id ORDER BY s.id"
        ).fetchall()
        result = []
        for sh in shops:
            result.append({
                "shop_id": sh["id"],
                "shop_name": sh["name"],
                "platform": sh["platform"],
                "summary": _perf_summary(c, sh["id"], start, end, statuses),
            })
        server_today = c.execute("SELECT date('now','localtime') AS d").fetchone()["d"]
        return {"summary": _perf_summary(c, None, start, end, statuses), "shops": result,
                "server_today": server_today}


def order_statuses() -> list[dict]:
    """订单状态枚举（含数量，按数量降序），供前端下拉筛选。"""
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT status, COUNT(*) AS n FROM orders WHERE status != '' "
            "GROUP BY status ORDER BY n DESC"
        ).fetchall()
        return [{"status": r["status"], "count": r["n"]} for r in rows]


def platform_overview() -> dict:
    """按平台聚合真实经营数据：商品数/SKU数/订单数/GMV，供运营总览展示。

    订单数/GMV 只统计「有效成交」订单：排除退款（含「退款」）、取消（含「取消」）、
    关闭（含「关闭」）、待付款、待发货；保留已收货/已发货待收货/交易成功/已完成等。
    """
    # 有效成交状态过滤：排除退款/取消/关闭/待定；
    # status 为空但有快递单号（抖音等无状态列平台，已发货）也算有效
    VALID = ("((status != '' AND status NOT LIKE '%退款%' AND status NOT LIKE '%取消%' "
             "AND status NOT LIKE '%关闭%' AND status NOT IN ('待付款','待发货')) "
             "OR (status = '' AND tracking_no != ''))")
    with closing(_conn()) as c:
        items = []
        for pl in c.execute("SELECT * FROM platforms ORDER BY id").fetchall():
            pid = pl["id"]
            shop_in = "SELECT id FROM shops WHERE platform_id=?"
            prod_in = ("SELECT id FROM products WHERE shop_id IN (%s)" % shop_in)
            products = c.execute(
                "SELECT COUNT(*) AS n FROM products WHERE shop_id IN (%s)" % shop_in,
                (pid,)).fetchone()["n"]
            skus = c.execute(
                "SELECT COUNT(*) AS n FROM skus WHERE product_id IN (%s)" % prod_in,
                (pid,)).fetchone()["n"]
            orders = c.execute(
                "SELECT COUNT(*) AS n FROM orders WHERE shop_id IN (%s) AND %s" % (shop_in, VALID),
                (pid,)).fetchone()["n"]
            gmv = c.execute(
                "SELECT ROUND(COALESCE(SUM(buyer_amount),0),2) AS n FROM orders "
                "WHERE shop_id IN (%s) AND %s" % (shop_in, VALID),
                (pid,)).fetchone()["n"]
            items.append({
                "platform_id": pid,
                "code": pl["code"],
                "name": pl["name"],
                "products": products,
                "skus": skus,
                "orders": orders,
                "gmv": gmv,
            })
        return {"items": items}


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
        base = ("SELECT g.*, s.name AS shop_name FROM goods_effect g "
                "LEFT JOIN shops s ON s.id = g.shop_id")
        if shop_id:
            rows = c.execute(
                base + " WHERE g.shop_id=? ORDER BY g.stat_date DESC, g.pay_ordr_amt DESC LIMIT ?",
                (shop_id, limit),
            ).fetchall()
        else:
            rows = c.execute(
                base + " ORDER BY g.stat_date DESC, g.pay_ordr_amt DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]


# ----------------------------- 标题优化 -----------------------------

def title_opt_candidates(shop_id: int, q: str = None, limit: int = 500) -> list[dict]:
    """标题优化候选商品：排除已有订单的商品 + 排除已挑过的商品。"""
    with closing(_conn()) as c:
        sql = (
            "SELECT p.id, p.platform_product_id, p.name, p.code, "
            "(SELECT COUNT(*) FROM skus s WHERE s.product_id=p.id) AS sku_count "
            "FROM products p "
            "WHERE p.shop_id=? "
            "AND p.platform_product_id NOT IN (SELECT DISTINCT platform_product_id FROM orders "
            "  WHERE shop_id=? AND platform_product_id IS NOT NULL AND platform_product_id!='') "
            "AND p.platform_product_id NOT IN (SELECT platform_product_id FROM title_opt WHERE shop_id=?)"
        )
        args = [shop_id, shop_id, shop_id]
        if q:
            sql += " AND (p.name LIKE ? OR p.platform_product_id LIKE ? OR p.code LIKE ?)"
            like = f"%{q}%"
            args += [like, like, like]
        sql += " ORDER BY p.id LIMIT ?"
        args.append(limit)
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def add_title_opt(shop_id: int, platform_product_id: str) -> int:
    """挑选商品进标题优化，快照旧标题，状态 selected。返回 id；有订单返回 -1；不存在返回 None。"""
    with closing(_conn()) as c:
        prod = c.execute(
            "SELECT id, platform_product_id, name, code FROM products WHERE shop_id=? AND platform_product_id=?",
            (shop_id, platform_product_id),
        ).fetchone()
        if not prod:
            return None
        has_order = c.execute(
            "SELECT COUNT(*) FROM orders WHERE shop_id=? AND platform_product_id=?",
            (shop_id, platform_product_id),
        ).fetchone()[0]
        if has_order:
            return -1
        c.execute(
            "INSERT INTO title_opt(shop_id, platform_product_id, product_name, product_code, old_title, status) "
            "VALUES(?,?,?,?,?,'selected') "
            "ON CONFLICT(shop_id, platform_product_id) DO NOTHING",
            (shop_id, platform_product_id, prod["name"], prod["code"] or "", prod["name"] or ""),
        )
        c.commit()
        row = c.execute(
            "SELECT id FROM title_opt WHERE shop_id=? AND platform_product_id=?",
            (shop_id, platform_product_id),
        ).fetchone()
        return row["id"] if row else None


def list_title_opt(shop_id: int = None) -> list[dict]:
    """列出标题优化记录，附带该商品最新一条访问明细（效果跟踪对比用）。"""
    with closing(_conn()) as c:
        base = (
            "SELECT t.*, "
            "(SELECT stat_date FROM goods_effect g WHERE g.platform_product_id=t.platform_product_id "
            "  ORDER BY g.stat_date DESC LIMIT 1) AS latest_stat_date, "
            "(SELECT goods_uv FROM goods_effect g WHERE g.platform_product_id=t.platform_product_id "
            "  ORDER BY g.stat_date DESC LIMIT 1) AS latest_uv, "
            "(SELECT goods_pv FROM goods_effect g WHERE g.platform_product_id=t.platform_product_id "
            "  ORDER BY g.stat_date DESC LIMIT 1) AS latest_pv, "
            "(SELECT pay_ordr_cnt FROM goods_effect g WHERE g.platform_product_id=t.platform_product_id "
            "  ORDER BY g.stat_date DESC LIMIT 1) AS latest_ordr, "
            "(SELECT pay_ordr_amt FROM goods_effect g WHERE g.platform_product_id=t.platform_product_id "
            "  ORDER BY g.stat_date DESC LIMIT 1) AS latest_amt "
            "FROM title_opt t"
        )
        if shop_id:
            rows = c.execute(base + " WHERE t.shop_id=? ORDER BY t.id DESC", (shop_id,)).fetchall()
        else:
            rows = c.execute(base + " ORDER BY t.id DESC").fetchall()
        return [dict(r) for r in rows]


def update_title_opt(opt_id: int, new_title: str = None, status: str = None, note: str = None) -> bool:
    with closing(_conn()) as c:
        sets, args = [], []
        if new_title is not None:
            sets.append("new_title=?")
            args.append(new_title)
        if status is not None:
            sets.append("status=?")
            args.append(status)
        if note is not None:
            sets.append("note=?")
            args.append(note)
        if not sets:
            return False
        args.append(opt_id)
        c.execute(f"UPDATE title_opt SET {', '.join(sets)} WHERE id=?", args)
        c.commit()
        return True


def delete_title_opt(opt_id: int) -> bool:
    with closing(_conn()) as c:
        c.execute("DELETE FROM title_opt WHERE id=?", (opt_id,))
        c.commit()
        return True


def get_title_opt_by_ids(ids: list) -> list[dict]:
    """按 id 批量查标题优化记录（执行更新用）。"""
    if not ids:
        return []
    with closing(_conn()) as c:
        ph = ",".join("?" * len(ids))
        rows = c.execute(f"SELECT * FROM title_opt WHERE id IN ({ph})", ids).fetchall()
        return [dict(r) for r in rows]


def save_title_opt_baseline(opt_id: int) -> dict:
    """快照优化前基线：读该商品最新一条访问明细，写入 baseline 字段。"""
    import json as _json
    with closing(_conn()) as c:
        row = c.execute("SELECT * FROM title_opt WHERE id=?", (opt_id,)).fetchone()
        if not row:
            return None
        ge = c.execute(
            "SELECT stat_date, goods_uv, goods_pv, pay_ordr_cnt, pay_ordr_amt, goods_vcr FROM goods_effect "
            "WHERE platform_product_id=? ORDER BY stat_date DESC LIMIT 1",
            (row["platform_product_id"],),
        ).fetchone()
        baseline = {}
        if ge:
            baseline = {
                "stat_date": ge["stat_date"], "uv": ge["goods_uv"], "pv": ge["goods_pv"],
                "pay_ordr_cnt": ge["pay_ordr_cnt"], "pay_ordr_amt": ge["pay_ordr_amt"],
                "vcr": ge["goods_vcr"],
            }
        c.execute("UPDATE title_opt SET baseline=? WHERE id=?", (_json.dumps(baseline, ensure_ascii=False), opt_id))
        c.commit()
        return baseline


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

        if etype == "freight":
            w.writerow(["运单号", "结算对象", "快递公司", "账单日期", "目的地省", "目的地市",
                        "结算重量", "快递费(元)", "面单费(元)", "附加费(元)", "应结金额(元)",
                        "匹配订单号", "匹配店铺"])
            for r in c.execute(
                "SELECT f.*, s.name AS shop_name FROM freight f "
                "LEFT JOIN shops s ON s.id = f.matched_shop_id ORDER BY f.ship_date DESC"
            ).fetchall():
                w.writerow([r["tracking_no"], r["account_name"], r["courier"], r["ship_date"],
                            r["province"], r["city"],
                            _v(r["weight"]), _v(r["freight_cost"]), _v(r["bill_fee"]),
                            _v(r["extra_fee"]), _v(r["total"]),
                            r["matched_order_no"], r["shop_name"] or ""])
            return "运费账单.csv", out.getvalue()

        if etype == "supplier":
            # 供应商商品库导出（采购侧）
            w.writerow(["供应商名称", "分类", "货号", "商品名称", "供货价", "零售价",
                        "规格", "颜色", "重量(kg)", "箱规", "库存", "来源链接", "备注"])
            for r in c.execute(
                "SELECT sp.*, s.name AS supplier_name FROM supplier_products sp "
                "LEFT JOIN suppliers s ON s.id = sp.supplier_id ORDER BY sp.supplier_id, sp.id"
            ).fetchall():
                w.writerow([r["supplier_name"] or "", r["category"], r["product_code"],
                            r["product_name"], _v(r["supply_price"]), _v(r["retail_price"]),
                            r["spec"], r["color"], _v(r["weight"]), r["box_spec"],
                            r["stock"], r["source_url"], r["remark"]])
            return "供应商商品库.csv", out.getvalue()

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
    """推广数据汇总 + 按商品聚合 ROI 排行（带店铺归属）。"""
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
            "SELECT p.shop_id, sh.name AS shop_name, p.platform_product_id, MAX(p.product_name) AS product_name, "
            "ROUND(SUM(p.deal_spend),2) AS spend, ROUND(SUM(p.deal_amount),2) AS amt, "
            "ROUND(SUM(p.total_spend),2) AS total_spend, SUM(p.net_deal_count) AS deals, "
            "SUM(p.impressions) AS imp, SUM(p.clicks) AS clk "
            "FROM promotions p LEFT JOIN shops sh ON sh.id = p.shop_id "
            "WHERE p.platform_product_id != '' GROUP BY p.shop_id, p.platform_product_id "
            "ORDER BY amt DESC LIMIT 50"
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
    """低库存 SKU 列表（stock <= threshold，关联商品名 + 店铺名）。"""
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT p.shop_id, sh.name AS shop_name, p.platform_product_id, p.name, p.code, "
            "s.platform_sku_id, s.spec_name, s.spec_code, s.stock "
            "FROM skus s JOIN products p ON p.id = s.product_id "
            "LEFT JOIN shops sh ON sh.id = p.shop_id "
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
    rows = list(csv.reader(io.StringIO(text)))
    return _parse_table_rows(etype, rows)


# ---- xlsx 导入支持 + 表头归一化（2026-09-23）----

# 导入表头关键词映射（兼容拼多多/淘宝导出表头 → 标准字段，大小写不敏感包含匹配）
IMPORT_HEADER_KEYWORDS = {
    "platform_product_id": ["商品id", "商品编号", "goods_id", "商品编码(平台)", "商品编码（平台）"],
    "name": ["商品名称", "商品标题", "宝贝名称"],
    "code": ["商品编码", "货号"],
    "platform_sku_id": ["skuid", "规格id", "sku_id"],
    "spec_name": ["规格名称", "sku名称", "规格名"],
    "spec_code": ["规格编码", "sku编码", "商家编码"],
    "dan_price": ["单买价", "单卖价", "销售价", "商品价格", "售价", "现价", "单价"],
    "pin_price": ["拼单价", "团购价", "拼团价", "拼团价格"],
    "stock": ["库存", "可售库存", "库存数量", "库存增减"],
    "order_no": ["订单号", "订单编号", "主订单编号"],
    "status": ["订单状态"],
    "quantity": ["商品数量", "数量", "SKU件数", "宝贝总数量"],
    "pay_time": ["支付时间", "付款时间", "订单创建时间", "支付完成时间"],
    "confirm_time": ["确认收货时间", "收货时间", "订单完成时间", "订单确认收货时间"],
    "spec": ["商品规格", "SKU规格", "商品属性", "选购商品"],
    "aftersale_status": ["售后状态", "商品售后"],
    "buyer_amount": ["用户实付金额", "买家实付", "实付金额", "用户应付金额", "订单实际支付金额", "订单应付金额"],
    "seller_amount": ["商家实收金额", "商家实收", "实收金额", "商家应收金额", "订单实际收款金额", "总金额", "商家收入金额"],
    "tracking_no": ["快递单号", "运单号", "物流单号"],
    "courier": ["快递公司", "物流公司", "承运商"],
    "province": ["省", "省份"],
    "city": ["市", "城市"],
    "district": ["区", "县", "区县"],
    "source": ["订单来源", "来源"],
    "product_name": ["商品名称", "商品标题"],
    "scene": ["推广场景", "场景"],
    "plan_name": ["推广名称", "计划名称"],
    "bid_type": ["出价方式"],
    "group_name": ["分组"],
    "period": ["时段", "统计周期", "日期范围", "周期"],
    "deal_spend": ["成交花费"],
    "deal_amount": ["交易额", "成交额", "成交金额"],
    "actual_roi": ["实际投产比", "投产比", "roi"],
    "total_spend": ["总花费", "总消耗", "花费"],
    "net_deal_count": ["净成交笔数", "成交笔数"],
    "impressions": ["曝光量", "展现量", "曝光"],
    "clicks": ["点击量", "点击"],
}


def _match_header(cell, kws) -> bool:
    h = str(cell or "").strip().lower()
    return any(kw.lower() in h for kw in kws)


def normalize_header(etype: str, header_row: list) -> dict:
    """把任意表头归一化到标准表头，返回 {标准中文表头: 列索引}。"""
    result = {}
    used = set()
    for cn, field in IMPORT_FIELDS[etype]:
        kws = IMPORT_HEADER_KEYWORDS.get(field, [cn])
        for i, h in enumerate(header_row):
            if i in used:
                continue
            if _match_header(h, kws):
                result[cn] = i
                used.add(i)
                break
    return result


def _parse_table_rows(etype: str, rows: list[list]) -> list[dict]:
    """从二维数组（首行为表头）解析，表头自动归一化。兼容拼多多/淘宝导出表头。"""
    if not rows:
        return []
    col_map = normalize_header(etype, rows[0])
    field_keys = IMPORT_FIELDS[etype]
    result = []
    for data_row in rows[1:]:
        if not data_row:
            continue
        rec = {}
        for cn, field in field_keys:
            ci = col_map.get(cn)
            v = data_row[ci] if (ci is not None and ci < len(data_row)) else ""
            v = "" if v is None else str(v).strip()
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
        result.append(rec)
    return result


def xlsx_rows_from_bytes(data: bytes) -> list[list]:
    """内存解析 xlsx（sharedStrings / inlineStr 两种格式），返回二维数组。"""
    import zipfile
    import io
    import re
    import xml.etree.ElementTree as ET
    NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

    def _col_idx(ref):
        m = re.match(r'([A-Z]+)', ref)
        n = 0
        for ch in m.group(1):
            n = n * 26 + (ord(ch) - ord('A') + 1)
        return n - 1

    with zipfile.ZipFile(io.BytesIO(data)) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            ss_root = ET.fromstring(z.read('xl/sharedStrings.xml').decode('utf-8', errors='ignore'))
            for si in ss_root.iter(NS + 'si'):
                shared.append(''.join(t.text or '' for t in si.iter(NS + 't')))
        xml = z.read('xl/worksheets/sheet1.xml').decode('utf-8', errors='ignore')
    root = ET.fromstring(xml)
    rows = []
    for row_el in root.iter(NS + 'row'):
        cells = {}
        for c in row_el.iter(NS + 'c'):
            ref = c.get('r')
            if not ref:
                continue
            t = c.get('t')
            val = None
            if t == 'inlineStr':
                is_el = c.find(NS + 'is')
                if is_el is not None:
                    val = ''.join(t_el.text or '' for t_el in is_el.iter(NS + 't'))
            elif t == 's':
                v_el = c.find(NS + 'v')
                if v_el is not None and v_el.text is not None:
                    idx = int(v_el.text)
                    if 0 <= idx < len(shared):
                        val = shared[idx]
            else:
                v_el = c.find(NS + 'v')
                if v_el is not None and v_el.text is not None:
                    val = v_el.text
            if val is not None:
                cells[_col_idx(ref)] = val
        if cells:
            maxcol = max(cells.keys())
            rows.append([cells.get(i) for i in range(maxcol + 1)])
    return rows


def import_rows(etype: str, shop_id: int, rows: list[dict]) -> dict:
    """核心分发：rows 已解析成 dict 列表，按类型写库。返回 {imported, skipped}。"""
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


def import_csv(etype: str, shop_id: int, csv_text: str) -> dict:
    """网页导入入口（CSV 文本）：解析 → 写库。返回 {imported, skipped}。"""
    if etype not in IMPORT_FIELDS:
        raise ValueError(f"未知导入类型: {etype}")
    rows = _parse_csv_rows(etype, csv_text)
    return import_rows(etype, shop_id, rows)


def import_xlsx(etype: str, shop_id: int, xlsx_b64: str) -> dict:
    """网页导入入口（xlsx base64）：解析 → 写库。返回 {imported, skipped}。"""
    import base64
    if etype not in IMPORT_FIELDS:
        raise ValueError(f"未知导入类型: {etype}")
    raw = base64.b64decode(xlsx_b64)
    rows = xlsx_rows_from_bytes(raw)
    parsed = _parse_table_rows(etype, rows)
    return import_rows(etype, shop_id, parsed)


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


# ===== 供应商商品库（采购侧，2026-09-23） =====

def _num(v):
    """数值清洗：'19.9'/'16.6'→float，空/非数字/'-'→None。"""
    import re
    if v is None:
        return None
    s = str(v).strip().replace(',', '').replace('￥', '').replace('元', '')
    if not s or s in ('-', '/', '—', '无', 'None'):
        return None
    m = re.search(r'-?\d+(\.\d+)?', s)
    if not m:
        return None
    try:
        return float(m.group(0))
    except ValueError:
        return None


def upsert_supplier(name, contact='', phone='', address='', source='', remark=''):
    """创建或更新供应商，返回 supplier_id。"""
    with closing(_conn()) as c:
        row = c.execute("SELECT id FROM suppliers WHERE name=?", (name,)).fetchone()
        if row:
            c.execute(
                "UPDATE suppliers SET contact=COALESCE(?,contact), phone=COALESCE(?,phone), "
                "address=COALESCE(?,address), source=COALESCE(?,source), remark=COALESCE(?,remark) WHERE id=?",
                (contact or None, phone or None, address or None, source or None, remark or None, row['id']))
            c.commit()
            return row['id']
        cur = c.execute(
            "INSERT INTO suppliers (name, contact, phone, address, source, remark) VALUES (?,?,?,?,?,?)",
            (name, contact, phone, address, source, remark))
        c.commit()
        return cur.lastrowid


def replace_supplier_products(supplier_id, rows):
    """全量替换某供应商的商品（先删后插）。rows = [dict]。返回导入条数。"""
    with closing(_conn()) as c:
        c.execute("DELETE FROM supplier_products WHERE supplier_id=?", (supplier_id,))
        n = 0
        for r in rows:
            c.execute(
                """INSERT INTO supplier_products
                (supplier_id, category, product_name, product_code, spec, color,
                 supply_price, retail_price, weight, box_spec, stock, source_url, image, remark, raw_json)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (supplier_id, r.get('category', ''), r.get('product_name', ''), r.get('product_code', ''),
                 r.get('spec', ''), r.get('color', ''), r.get('supply_price'), r.get('retail_price'),
                 r.get('weight'), r.get('box_spec', ''), r.get('stock', ''), r.get('source_url', ''),
                 r.get('image', ''), r.get('remark', ''), r.get('raw_json', '')))
            n += 1
        c.commit()
        return n


def import_supplier_csv(csv_text: str) -> dict:
    """网页导入供应商商品：CSV → 按供应商名分组 → upsert 供应商 + 追加商品（货号去重）。

    CSV 表头：供应商名称,分类,货号,商品名称,供货价,零售价,规格,颜色,重量(kg),箱规,库存,来源链接,备注
    返回 {imported, suppliers, skipped}。
    """
    import csv
    import io
    text = csv_text.lstrip("\ufeff")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return {"imported": 0, "suppliers": 0, "skipped": 0}
    # 列名归一（去空白）
    fieldnames = [f.strip() for f in reader.fieldnames]
    field_map = {
        "供应商名称": "supplier_name", "供应商": "supplier_name",
        "分类": "category", "货号": "product_code", "编号": "product_code",
        "商品名称": "product_name", "名称": "product_name", "品名": "product_name",
        "供货价": "supply_price", "代发价": "supply_price", "出厂价": "supply_price", "进货价": "supply_price",
        "零售价": "retail_price", "控价": "retail_price", "售价": "retail_price",
        "规格": "spec", "尺寸": "spec", "颜色": "color",
        "重量(kg)": "weight", "净重": "weight", "重量": "weight", "克重": "weight",
        "箱规": "box_spec", "装箱数": "box_spec", "库存": "stock",
        "来源链接": "source_url", "网址": "source_url", "链接": "source_url",
        "备注": "remark",
    }
    NUM = {"supply_price", "retail_price", "weight"}

    def _pick(row):
        rec = {}
        for fn in fieldnames:
            field = field_map.get(fn)
            if not field:
                continue
            v = (row.get(fn) or "").strip()
            if field in NUM:
                rec[field] = _num(v)
            else:
                rec[field] = v
        return rec

    groups = {}  # supplier_name -> [rec]
    for raw in reader:
        rec = _pick(raw)
        name = rec.get("supplier_name", "")
        if not name:
            continue
        if not rec.get("product_name") and not rec.get("product_code"):
            continue
        groups.setdefault(name, []).append(rec)

    imported = 0
    with closing(_conn()) as c:
        for name, recs in groups.items():
            sid = upsert_supplier(name)
            # 已有货号集合（去重）
            existing = {r["product_code"] for r in c.execute(
                "SELECT product_code FROM supplier_products WHERE supplier_id=?", (sid,)).fetchall()
                if r["product_code"]}
            for r in recs:
                code = r.get("product_code", "")
                if code and code in existing:
                    continue
                c.execute(
                    """INSERT INTO supplier_products
                    (supplier_id, category, product_name, product_code, spec, color,
                     supply_price, retail_price, weight, box_spec, stock, source_url, image, remark, raw_json)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (sid, r.get("category", ""), r.get("product_name", ""), r.get("product_code", ""),
                     r.get("spec", ""), r.get("color", ""), r.get("supply_price"), r.get("retail_price"),
                     r.get("weight"), r.get("box_spec", ""), r.get("stock", ""), r.get("source_url", ""),
                     "", r.get("remark", ""), ""))
                imported += 1
                if code:
                    existing.add(code)
        c.commit()
    return {"imported": imported, "suppliers": len(groups), "skipped": 0}


def list_suppliers():
    with closing(_conn()) as c:
        rows = c.execute(
            """SELECT s.*, (SELECT COUNT(*) FROM supplier_products sp WHERE sp.supplier_id=s.id) AS product_count
            FROM suppliers s ORDER BY s.id""").fetchall()
        return [dict(r) for r in rows]


def list_supplier_products(supplier_id=None, q='', limit=5000):
    with closing(_conn()) as c:
        sql = ("SELECT sp.*, s.name AS supplier_name FROM supplier_products sp "
               "LEFT JOIN suppliers s ON s.id = sp.supplier_id")
        args = []
        where = []
        if supplier_id:
            where.append("sp.supplier_id=?")
            args.append(supplier_id)
        if q:
            where.append("(sp.product_name LIKE ? OR sp.product_code LIKE ? OR sp.spec LIKE ? OR s.name LIKE ?)")
            args += [f'%{q}%', f'%{q}%', f'%{q}%', f'%{q}%']
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY sp.id LIMIT ?"
        args.append(limit)
        rows = c.execute(sql, args).fetchall()
        return [dict(r) for r in rows]
