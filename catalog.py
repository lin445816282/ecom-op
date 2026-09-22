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
                "seller_amount, tracking_no, courier) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(order_no) DO UPDATE SET status=excluded.status, "
                "buyer_amount=excluded.buyer_amount, seller_amount=excluded.seller_amount",
                (shop_id, o.get("order_no", ""), o.get("status", ""),
                 o.get("quantity", 0), o.get("pay_time", ""), o.get("confirm_time", ""),
                 pid, o.get("platform_product_id", ""), o.get("spec", ""),
                 o.get("aftersale_status", ""), o.get("buyer_amount"), o.get("seller_amount"),
                 o.get("tracking_no", ""), o.get("courier", "")),
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
        if shop_id:
            rows = c.execute(
                "SELECT * FROM orders WHERE shop_id=? ORDER BY pay_time DESC LIMIT ?",
                (shop_id, limit),
            ).fetchall()
        else:
            rows = c.execute("SELECT * FROM orders ORDER BY pay_time DESC LIMIT ?", (limit,)).fetchall()
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
                        "SELECT p.*, (SELECT COUNT(*) FROM skus s WHERE s.product_id=p.id) AS sku_count "
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
            w.writerow(["订单号", "订单状态", "商品数量", "支付时间", "确认收货时间", "商品ID",
                        "商品规格", "售后状态", "用户实付金额", "商家实收金额", "快递单号", "快递公司"])
            for r in c.execute("SELECT * FROM orders ORDER BY pay_time DESC").fetchall():
                w.writerow([r["order_no"], r["status"], r["quantity"], r["pay_time"], r["confirm_time"],
                            r["platform_product_id"], r["spec"], r["aftersale_status"],
                            _v(r["buyer_amount"]), _v(r["seller_amount"]),
                            r["tracking_no"], r["courier"]])
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
