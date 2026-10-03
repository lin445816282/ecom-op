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
import json
import time
from contextlib import closing
from datetime import datetime

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

CREATE TABLE IF NOT EXISTS promo_finance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL,
    stat_date TEXT NOT NULL,
    total_balance REAL,
    avail_balance REAL,
    general_balance REAL,
    restricted_balance REAL,
    locked_balance REAL,
    cash_balance REAL,
    red_packet_balance REAL,
    today_spend REAL,
    yesterday_spend REAL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(shop_id) REFERENCES shops(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_finance_uniq ON promo_finance(shop_id, stat_date);

CREATE TABLE IF NOT EXISTS promo_monthly_bill (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL,
    bill_period TEXT DEFAULT '',
    bill_amount REAL,
    bill_subject TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(shop_id) REFERENCES shops(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_monthly_bill_uniq ON promo_monthly_bill(shop_id, bill_period, bill_subject);

CREATE TABLE IF NOT EXISTS promo_daily_bill (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL,
    flow_time TEXT DEFAULT '',
    transaction_id TEXT DEFAULT '',
    fund_type INTEGER,
    flow_type INTEGER,
    amount REAL,
    balance REAL,
    brief TEXT DEFAULT '',
    summary TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(shop_id) REFERENCES shops(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_daily_bill_uniq ON promo_daily_bill(shop_id, flow_time, transaction_id, amount, flow_type);

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
    fixed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(shop_id, platform_product_id)
);

CREATE INDEX IF NOT EXISTS idx_title_opt_shop ON title_opt(shop_id);

CREATE TABLE IF NOT EXISTS title_opt_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL,
    platform_product_id TEXT NOT NULL,
    product_name TEXT DEFAULT '',
    old_title TEXT DEFAULT '',
    new_title TEXT DEFAULT '',
    action TEXT DEFAULT '',
    status TEXT DEFAULT '',
    note TEXT DEFAULT '',
    source TEXT DEFAULT 'ai',
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_title_opt_log_shop ON title_opt_log(shop_id);
CREATE INDEX IF NOT EXISTS idx_title_opt_log_prod ON title_opt_log(platform_product_id);

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

CREATE TABLE IF NOT EXISTS sku_weight (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform_product_id TEXT NOT NULL,
    spec TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    weight REAL,
    weight_q25 REAL,
    weight_q75 REAL,
    sample_count INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(platform_product_id, spec, quantity)
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

CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_key TEXT UNIQUE,
    name TEXT DEFAULT '',
    category TEXT DEFAULT '',
    shop_id INTEGER,
    cron_expr TEXT DEFAULT '',
    schedule_desc TEXT DEFAULT '',
    cron_job_id TEXT DEFAULT '',
    script TEXT DEFAULT '',
    enabled INTEGER DEFAULT 1,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_cat ON scheduled_tasks(category);

CREATE TABLE IF NOT EXISTS task_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_key TEXT DEFAULT '',
    status TEXT DEFAULT '',
    result TEXT DEFAULT '',
    started_at TEXT DEFAULT '',
    finished_at TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_task_runs_key ON task_runs(task_key);

CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER DEFAULT 0,
    review_id TEXT NOT NULL,
    goods_id TEXT DEFAULT '',
    order_id TEXT DEFAULT '',
    order_sn TEXT DEFAULT '',
    score INTEGER DEFAULT 0,
    desc_score INTEGER DEFAULT 0,
    logistics_score INTEGER DEFAULT 0,
    service_score INTEGER DEFAULT 0,
    comment TEXT DEFAULT '',
    append_num INTEGER DEFAULT 0,
    goods_name TEXT DEFAULT '',
    specs TEXT DEFAULT '',
    keywords TEXT DEFAULT '',
    pictures TEXT DEFAULT '',
    video TEXT DEFAULT '',
    thumb_url TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    reply TEXT DEFAULT '',
    reply_time INTEGER DEFAULT 0,
    anonymous INTEGER DEFAULT 0,
    status INTEGER DEFAULT 0,
    create_time INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(review_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_shop ON reviews(shop_id);
CREATE INDEX IF NOT EXISTS idx_reviews_goods ON reviews(goods_id);
CREATE INDEX IF NOT EXISTS idx_reviews_time ON reviews(create_time);

CREATE TABLE IF NOT EXISTS pack_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_date TEXT NOT NULL,
    entry TEXT NOT NULL,
    source TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    remark TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    created_by TEXT DEFAULT '打单员'
);

CREATE INDEX IF NOT EXISTS idx_pack_date ON pack_records(record_date);

CREATE TABLE IF NOT EXISTS pack_scatter_shops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS pack_entry_mapping (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry TEXT NOT NULL UNIQUE,
    shop_ids TEXT DEFAULT '',
    freight_account TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS competitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER,
    platform_product_id TEXT DEFAULT '',
    keyword TEXT DEFAULT '',
    comp_title TEXT DEFAULT '',
    comp_price REAL,
    comp_sales TEXT DEFAULT '',
    comp_img TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_competitors_ppid ON competitors(platform_product_id, keyword);

CREATE TABLE IF NOT EXISTS buyer_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goods_id TEXT DEFAULT '',
    goods_name TEXT DEFAULT '',
    total_count INTEGER DEFAULT 0,
    tags TEXT DEFAULT '',
    comments TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_buyer_reviews_gid ON buyer_reviews(goods_id);

CREATE TABLE IF NOT EXISTS fixed_cost_params (
    key TEXT PRIMARY KEY,
    value REAL NOT NULL,
    unit TEXT DEFAULT '',
    note TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS daily_profit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL,
    stat_date TEXT NOT NULL,
    net_income REAL DEFAULT 0,
    refund_amount REAL DEFAULT 0,
    promo_spend REAL DEFAULT 0,
    goods_cost REAL DEFAULT 0,
    freight_cost REAL DEFAULT 0,
    gross_profit REAL DEFAULT 0,
    order_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(shop_id, stat_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_profit_date ON daily_profit(stat_date);

CREATE TABLE IF NOT EXISTS error_knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    error_type TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    skill_name TEXT DEFAULT '',
    solution TEXT DEFAULT '',
    count INTEGER DEFAULT 0,
    first_seen TEXT DEFAULT '',
    last_seen TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS autopublish_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_url TEXT NOT NULL,
    shop_id INTEGER DEFAULT 5,
    status TEXT DEFAULT 'queued',
    stage TEXT DEFAULT '',
    raw_title TEXT DEFAULT '',
    ai_title TEXT DEFAULT '',
    ai_desc TEXT DEFAULT '',
    price REAL,
    skus TEXT DEFAULT '[]',
    images TEXT DEFAULT '[]',
    pdd_goods_id TEXT DEFAULT '',
    error TEXT DEFAULT '',
    operator_name TEXT DEFAULT '',
    log TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_autopublish_status ON autopublish_tasks(status);

CREATE TABLE IF NOT EXISTS published_goods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    goods_id TEXT DEFAULT '',
    main_image TEXT DEFAULT '',
    source_url TEXT DEFAULT '',
    raw_title TEXT DEFAULT '',
    ai_title TEXT DEFAULT '',
    category TEXT DEFAULT '',
    shop_id INTEGER DEFAULT 5,
    shop_name TEXT DEFAULT '',
    sku_count INTEGER DEFAULT 0,
    sku_details TEXT DEFAULT '[]',
    cost_price REAL,
    sale_price REAL,
    danmai_price REAL,
    ref_price REAL,
    profit_rate REAL,
    freight REAL,
    stock INTEGER,
    status TEXT DEFAULT 'published',
    published_at TEXT DEFAULT '',
    remark TEXT DEFAULT '',
    operator_name TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_published_goods_status ON published_goods(status);
CREATE INDEX IF NOT EXISTS idx_published_goods_shop ON published_goods(shop_id);

CREATE TABLE IF NOT EXISTS ai_boss_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    source_url TEXT DEFAULT '',
    cost REAL DEFAULT 0,
    sale_price REAL DEFAULT 0,
    status TEXT DEFAULT 'planning',
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_ai_boss_items_status ON ai_boss_items(status);

CREATE TABLE IF NOT EXISTS ai_boss_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER,
    title TEXT NOT NULL,
    qty INTEGER DEFAULT 1,
    cost REAL DEFAULT 0,
    sale_price REAL DEFAULT 0,
    freight REAL DEFAULT 0,
    profit REAL DEFAULT 0,
    tracking_no TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_ai_boss_orders_status ON ai_boss_orders(status);

CREATE TABLE IF NOT EXISTS ai_boss_goods_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goods_id TEXT DEFAULT '',
    goods_name TEXT DEFAULT '',
    stat_date TEXT DEFAULT '',
    visitor_cnt INTEGER DEFAULT 0,
    page_view_cnt INTEGER DEFAULT 0,
    pay_buyer_cnt INTEGER DEFAULT 0,
    pay_order_cnt INTEGER DEFAULT 0,
    pay_amount REAL DEFAULT 0,
    pay_rate REAL DEFAULT 0,
    collect_cnt INTEGER DEFAULT 0,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_ai_boss_daily_goods ON ai_boss_goods_daily(goods_id, stat_date);

CREATE TABLE IF NOT EXISTS ai_boss_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goods_id TEXT DEFAULT '',
    keyword TEXT NOT NULL,
    stat_date TEXT DEFAULT '',
    pay_order_cnt INTEGER DEFAULT 0,
    pay_amount REAL DEFAULT 0,
    pay_rate REAL DEFAULT 0,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_ai_boss_kw_goods ON ai_boss_keywords(goods_id, stat_date);

CREATE TABLE IF NOT EXISTS ai_boss_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goods_id TEXT DEFAULT '',
    goods_name TEXT DEFAULT '',
    action_type TEXT DEFAULT '',
    action_detail TEXT DEFAULT '',
    trigger_rule TEXT DEFAULT '',
    verify_status TEXT DEFAULT 'pending',
    verify_detail TEXT DEFAULT '',
    status TEXT DEFAULT 'proposed',
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_ai_boss_actions_goods ON ai_boss_actions(goods_id);

CREATE TABLE IF NOT EXISTS ai_boss_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_date TEXT DEFAULT '',
    trigger_type TEXT DEFAULT 'cron',
    collect_count INTEGER DEFAULT 0,
    goods_analyzed INTEGER DEFAULT 0,
    actions_triggered INTEGER DEFAULT 0,
    actions_executed INTEGER DEFAULT 0,
    actions_detail TEXT DEFAULT '[]',
    summary TEXT DEFAULT '',
    status TEXT DEFAULT 'success',
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_ai_boss_log_date ON ai_boss_log(work_date);

CREATE TABLE IF NOT EXISTS ai_boss_research (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_date TEXT DEFAULT '',
    content TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS category_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,
    category_path TEXT NOT NULL,
    category_keyword TEXT DEFAULT '',
    hit_count INTEGER DEFAULT 1,
    source TEXT DEFAULT 'learned',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(keyword, category_path)
);
CREATE TABLE IF NOT EXISTS title_banned_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'operator',
    permissions TEXT DEFAULT '["*"]',
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
"""


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def query_errors() -> list[dict]:
    """错误知识库列表，按出现次数降序。"""
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT * FROM error_knowledge ORDER BY count DESC, id DESC"
        ).fetchall()
        return [dict(r) for r in rows]


def add_error(error_type: str, description: str = "", skill_name: str = "",
              solution: str = "") -> dict:
    """新增错误类型（幂等：已存在则返回现有记录，不重复插入）。"""
    with closing(_conn()) as c:
        c.execute(
            "INSERT OR IGNORE INTO error_knowledge "
            "(error_type, description, skill_name, solution, first_seen, last_seen) "
            "VALUES (?,?,?,?,datetime('now','localtime'),datetime('now','localtime'))",
            (error_type.strip(), description, skill_name, solution),
        )
        c.commit()
        row = c.execute(
            "SELECT * FROM error_knowledge WHERE error_type=?", (error_type.strip(),)
        ).fetchone()
        return dict(row) if row else {}


def hit_error(error_id: int) -> dict:
    """记录一次错误出现：count+1，更新最近出现时间。"""
    with closing(_conn()) as c:
        c.execute(
            "UPDATE error_knowledge SET count=count+1, "
            "last_seen=datetime('now','localtime') WHERE id=?",
            (error_id,),
        )
        c.commit()
        row = c.execute(
            "SELECT * FROM error_knowledge WHERE id=?", (error_id,)
        ).fetchone()
        return dict(row) if row else {}


def hit_error_by_type(error_type: str, description: str = "") -> dict:
    """按错误类型命中（不存在则自动创建），count+1。供编排流程自动记账。

    description 非空时同步更新（覆盖为最新失败线索），保证错误知识库始终带最近的根因摘要。
    """
    with closing(_conn()) as c:
        c.execute(
            "INSERT OR IGNORE INTO error_knowledge "
            "(error_type, description, first_seen, last_seen) "
            "VALUES (?,?,datetime('now','localtime'),datetime('now','localtime'))",
            (error_type.strip(), description),
        )
        if description:
            c.execute(
                "UPDATE error_knowledge SET description=? WHERE error_type=?",
                (description, error_type.strip()),
            )
        c.execute(
            "UPDATE error_knowledge SET count=count+1, "
            "last_seen=datetime('now','localtime') WHERE error_type=?",
            (error_type.strip(),),
        )
        c.commit()
        row = c.execute(
            "SELECT * FROM error_knowledge WHERE error_type=?", (error_type.strip(),)
        ).fetchone()
        return dict(row) if row else {}


# ----------------------------- 一键上架 pipeline -----------------------------

def add_category_map(keyword: str, category_path: str, category_keyword: str = "", source: str = "learned") -> dict:
    """固化一条类目映射（自动学习/手动）。按 keyword+category_path 去重，已存在则 hit_count+1。"""
    keyword = (keyword or "").strip()
    category_path = (category_path or "").strip()
    if not keyword or not category_path:
        return {}
    category_keyword = (category_keyword or "").strip() or keyword
    with closing(_conn()) as c:
        c.execute(
            "INSERT INTO category_map(keyword, category_path, category_keyword, hit_count, source) "
            "VALUES(?,?,?,1,?) "
            "ON CONFLICT(keyword, category_path) DO UPDATE SET "
            "hit_count=hit_count+1, updated_at=datetime('now','localtime')",
            (keyword, category_path, category_keyword, source),
        )
        c.commit()
        row = c.execute(
            "SELECT * FROM category_map WHERE keyword=? AND category_path=?",
            (keyword, category_path),
        ).fetchone()
        return dict(row) if row else {}


def list_category_map_db() -> list[dict]:
    """数据库里已固化的类目映射（按命中次数降序）。"""
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT * FROM category_map ORDER BY hit_count DESC, id DESC"
        ).fetchall()
        return [dict(r) for r in rows]


# 标题禁词默认值（上架拼多多不能出现的词），表空时 seed，之后可在前端增删改
BANNED_WORDS_DEFAULT = [
    # 平台词（竞品平台名，必禁）
    "抖音", "快手", "小红书", "淘宝", "天猫", "京东", "拼多多", "拼夕夕",
    "微信", "微博", "唯品会", "1688", "阿里巴巴", "闲鱼", "得物", "美团",
    "抖店", "微店",
    # 营销违规词（拼多多常见判违规）
    "爆款", "同款", "网红", "直播", "带货", "全网", "秒杀", "清仓",
    "最低价", "亏本", "正品", "旗舰店", "官方", "专柜", "代购",
]


def list_banned_words() -> list[dict]:
    """标题禁词列表（含 id + word，按 id 升序）。"""
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT id, word FROM title_banned_words ORDER BY id ASC"
        ).fetchall()
        return [dict(r) for r in rows]


def add_banned_word(word: str) -> dict:
    """新增禁词（按 word 去重）。"""
    word = (word or "").strip()
    if not word:
        return {}
    with closing(_conn()) as c:
        c.execute("INSERT OR IGNORE INTO title_banned_words(word) VALUES(?)", (word,))
        c.commit()
        row = c.execute(
            "SELECT * FROM title_banned_words WHERE word=?", (word,)
        ).fetchone()
        return dict(row) if row else {}


def remove_banned_word(word_id: int) -> bool:
    """删除禁词（按 id），返回是否删除成功。"""
    with closing(_conn()) as c:
        c.execute("DELETE FROM title_banned_words WHERE id=?", (word_id,))
        c.commit()
        return True


def create_autopublish_task(source_url: str, shop_id: int = 5, operator_name: str = '') -> dict:
    """新建一键上架任务，初始状态 queued。"""
    with closing(_conn()) as c:
        cur = c.execute(
            "INSERT INTO autopublish_tasks(source_url, shop_id, status, operator_name) VALUES(?,?,?,?)",
            (source_url.strip(), shop_id, "queued", operator_name.strip()),
        )
        c.commit()
        row = c.execute(
            "SELECT * FROM autopublish_tasks WHERE id=?", (cur.lastrowid,)
        ).fetchone()
        return dict(row) if row else {}


def get_autopublish_task(task_id: int) -> dict:
    with closing(_conn()) as c:
        row = c.execute(
            "SELECT * FROM autopublish_tasks WHERE id=?", (task_id,)
        ).fetchone()
        return dict(row) if row else {}


def list_autopublish_tasks(limit: int = 50) -> list[dict]:
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT t.*, s.name AS shop_name FROM autopublish_tasks t "
            "LEFT JOIN shops s ON s.id = t.shop_id "
            "ORDER BY t.id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


def update_autopublish_task(task_id: int, **fields) -> dict:
    """按字段更新任务（status/stage/raw_title/ai_title/... 等），自动刷新 updated_at。"""
    if not fields:
        return get_autopublish_task(task_id)
    allowed = {
        "status", "stage", "raw_title", "ai_title", "ai_desc", "price",
        "skus", "images", "pdd_goods_id", "error", "log",
    }
    sets, vals = [], []
    for k, v in fields.items():
        if k not in allowed:
            continue
        if k in ("skus", "images", "log"):
            v = json.dumps(v, ensure_ascii=False)
        sets.append(f"{k}=?")
        vals.append(v)
    if not sets:
        return get_autopublish_task(task_id)
    sets.append("updated_at=datetime('now','localtime')")
    vals.append(task_id)
    with closing(_conn()) as c:
        c.execute(f"UPDATE autopublish_tasks SET {', '.join(sets)} WHERE id=?", vals)
        c.commit()
        row = c.execute(
            "SELECT * FROM autopublish_tasks WHERE id=?", (task_id,)
        ).fetchone()
        return dict(row) if row else {}


def append_autopublish_log(task_id: int, stage: str, status: str, msg: str) -> None:
    """追加一条阶段日志到任务 log JSON 数组，并同步更新 stage/status。"""
    with closing(_conn()) as c:
        row = c.execute(
            "SELECT log FROM autopublish_tasks WHERE id=?", (task_id,)
        ).fetchone()
        logs = []
        if row and row["log"]:
            try:
                logs = json.loads(row["log"])
            except Exception:
                logs = []
        logs.append({
            "stage": stage,
            "status": status,
            "msg": msg,
            "ts": datetime.now().strftime("%H:%M:%S"),
        })
        c.execute(
            "UPDATE autopublish_tasks SET log=?, stage=?, "
            "updated_at=datetime('now','localtime') WHERE id=?",
            (json.dumps(logs, ensure_ascii=False), stage, task_id),
        )
        c.commit()


def get_shop_name(shop_id: int) -> str:
    """查店铺名，找不到返回空串。"""
    if not shop_id:
        return ""
    with closing(_conn()) as c:
        row = c.execute("SELECT name FROM shops WHERE id=?", (shop_id,)).fetchone()
        return row["name"] if row else ""


def save_published_good(**fields) -> dict:
    """写入/更新上架商品记录（按 task_id + goods_id 幂等，已存在则更新）。"""
    allowed = {
        "task_id", "goods_id", "main_image", "source_url", "raw_title",
        "ai_title", "category", "shop_id", "shop_name", "sku_count",
        "sku_details", "cost_price", "sale_price", "danmai_price", "ref_price",
        "profit_rate", "freight", "stock", "status", "published_at", "remark",
        "operator_name",
    }
    data = {k: v for k, v in fields.items() if k in allowed}
    if not data:
        return {}
    if "sku_details" in data and not isinstance(data["sku_details"], str):
        data["sku_details"] = json.dumps(data["sku_details"], ensure_ascii=False)
    goods_id = str(data.get("goods_id") or "")
    with closing(_conn()) as c:
        row = None
        if goods_id:
            # 成功：按 goods_id 幂等（同一商品只留一条）
            row = c.execute(
                "SELECT id FROM published_goods WHERE goods_id=?", (goods_id,)
            ).fetchone()
        elif data.get("task_id"):
            # 失败（无 goods_id）：按 task_id 幂等（同一任务只留一条失败记录）
            row = c.execute(
                "SELECT id FROM published_goods WHERE task_id=? AND goods_id=''",
                (data.get("task_id"),),
            ).fetchone()
        if row:
            sets = ", ".join(f"{k}=?" for k in data)
            c.execute(
                f"UPDATE published_goods SET {sets} WHERE id=?",
                list(data.values()) + [row["id"]],
            )
            c.commit()
            return dict(c.execute("SELECT * FROM published_goods WHERE id=?", (row["id"],)).fetchone())
        cols = ", ".join(data.keys())
        phs = ", ".join("?" for _ in data)
        cur = c.execute(f"INSERT INTO published_goods({cols}) VALUES({phs})", list(data.values()))
        c.commit()
        return dict(c.execute("SELECT * FROM published_goods WHERE id=?", (cur.lastrowid,)).fetchone())


def list_published_goods(shop_id: int = None, status: str = None, category: str = None, limit: int = 300) -> list[dict]:
    """上架商品列表，可按店铺/状态/类目筛选；sku_details 解析成数组返回。"""
    sql = "SELECT * FROM published_goods WHERE 1=1"
    args = []
    if shop_id:
        sql += " AND shop_id=?"
        args.append(shop_id)
    if status:
        sql += " AND status=?"
        args.append(status)
    if category:
        sql += " AND category=?"
        args.append(category)
    sql += " ORDER BY id DESC LIMIT ?"
    args.append(limit)
    with closing(_conn()) as c:
        rows = [dict(r) for r in c.execute(sql, args).fetchall()]
    for r in rows:
        try:
            r["sku_details"] = json.loads(r.get("sku_details") or "[]")
        except Exception:
            r["sku_details"] = []
    return rows


def list_published_categories() -> list[str]:
    """已上架商品出现过的所有类目（去重、非空、排序），供前端筛选下拉使用。"""
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT DISTINCT category FROM published_goods "
            "WHERE category IS NOT NULL AND category != '' ORDER BY category"
        ).fetchall()
    return [r[0] for r in rows]


def init_db() -> None:
    with closing(_conn()) as c:
        c.executescript(SCHEMA)
        c.commit()
        _migrate(c)
        _seed_freight_rate(c)
        _seed_scatter_shops(c)
        _seed_pack_mapping(c)
        _seed_cost_params(c)
        _seed_banned_words(c)
    seed_scheduled_tasks()  # 幂等 seed 定时任务清单


def _seed_scatter_shops(conn: sqlite3.Connection) -> None:
    """散单店铺初始数据（来自桌面 2.txt），仅在表为空时导入。"""
    n = conn.execute("SELECT COUNT(*) FROM pack_scatter_shops").fetchone()[0]
    if n == 0:
        for name in ("贝之彤", "优品丫工艺", "养花花店", "轩聚园", "美世艺（林超群）"):
            conn.execute("INSERT OR IGNORE INTO pack_scatter_shops(name) VALUES(?)", (name,))
        conn.commit()


def _seed_pack_mapping(conn: sqlite3.Connection) -> None:
    """打单入口 → 店铺 / 运费账号 初始映射（仅在表为空时导入）。"""
    n = conn.execute("SELECT COUNT(*) FROM pack_entry_mapping").fetchone()[0]
    if n == 0:
        rows = [
            ("pdd_jiayu", "5,6,3", "嘉裕工艺品"),
            ("pdd_xianshi", "1", ""),
            ("taobao_jiayu", "12", ""),
            ("doudian", "8", ""),
        ]
        for entry, shop_ids, freight_account in rows:
            conn.execute(
                "INSERT OR IGNORE INTO pack_entry_mapping(entry, shop_ids, freight_account) VALUES(?,?,?)",
                (entry, shop_ids, freight_account),
            )
        conn.commit()


def _seed_cost_params(conn: sqlite3.Connection) -> None:
    """固定成本参数（挂钩类商品），幂等 seed，INSERT OR IGNORE 不覆盖已有值。"""
    rows = [
        ("hook_cost", 2.2, "元/个", "挂钩进货成本（加厚加粗款）"),
        ("hook_cost_light", 2.05, "元/个", "挂钩进货成本（加粗款/普通款，比加厚加粗少0.15）"),
        ("box_cost", 0.7, "元/个", "纸箱成本（每包裹）"),
        ("labor_cost", 0.5, "元/单", "打包人工（每包裹）"),
        ("hook_weight", 0.25, "kg/个", "挂钩重量（反推修正）"),
        ("box_weight", 0.08, "kg/个", "纸箱重量"),
    ]
    for key, value, unit, note in rows:
        conn.execute(
            "INSERT OR IGNORE INTO fixed_cost_params(key, value, unit, note) VALUES(?,?,?,?)",
            (key, value, unit, note),
        )
    conn.commit()


def _seed_banned_words(conn: sqlite3.Connection) -> None:
    """标题禁词初始数据，仅在表为空时 seed（用户后续增删改不再覆盖）。"""
    n = conn.execute("SELECT COUNT(*) FROM title_banned_words").fetchone()[0]
    if n == 0:
        for w in BANNED_WORDS_DEFAULT:
            conn.execute("INSERT OR IGNORE INTO title_banned_words(word) VALUES(?)", (w,))
        conn.commit()


def get_cost_params() -> dict:
    """读取固定成本参数（挂钩类）。"""
    with closing(_conn()) as c:
        rows = c.execute("SELECT key, value FROM fixed_cost_params").fetchall()
        return {r["key"]: r["value"] for r in rows}


def list_cost_params_full() -> list[dict]:
    """读取固定成本参数完整信息（含 unit/note），供前端展示编辑。"""
    with closing(_conn()) as c:
        return [dict(r) for r in c.execute(
            "SELECT key, value, unit, note, updated_at FROM fixed_cost_params ORDER BY key"
        ).fetchall()]


def calc_hook_cost(n_hooks: int, grade: str = "heavy") -> dict:
    """按固定参数计算挂钩类商品成本/重量/估算运费。

    n_hooks: 单件商品含挂钩数量（如 2个装 = 2）。
    grade: "heavy"=加厚加粗款(默认) / "light"=加粗款/普通款。
    返回: 商品成本、重量、按重量档估算的主要地区运费。
    """
    p = get_cost_params()
    if grade == "light":
        hook_cost = p.get("hook_cost_light", p.get("hook_cost", 0.0))
    else:
        hook_cost = p.get("hook_cost", 0.0)
    box_cost = p.get("box_cost", 0.0)
    labor_cost = p.get("labor_cost", 0.0)
    hook_weight = p.get("hook_weight", 0.0)
    box_weight = p.get("box_weight", 0.0)
    cost = hook_cost * n_hooks + box_cost + labor_cost
    weight = hook_weight * n_hooks + box_weight
    # 按重量档估算主要地区运费（福建/江浙沪粤等主发地区）
    if weight <= 0.5:
        freight = 2.5
    elif weight <= 1.0:
        freight = 3.0
    elif weight <= 2.0:
        freight = 4.2
    elif weight <= 3.0:
        freight = 5.4
    else:
        freight = None
    return {
        "n_hooks": n_hooks,
        "cost": round(cost, 2),
        "weight": round(weight, 3),
        "freight_est": freight,
    }


def _parse_hook_spec(spec: str):
    """从订单 spec 解析挂钩数量（个装数）+ 款型。

    spec 如 '经典黑,七钩 【加厚加粗】(2个装)' → (2, 'heavy')
    支持阿拉伯数字「2个装」+ 中文数字「二个装/一个装」。
    返回 (n_per, grade)；解析不出默认 (1, 'heavy')。
    """
    import re
    CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}
    n_per = 1
    grade = "heavy"
    if not spec:
        return n_per, grade
    m = re.search(r"(\d+|一|二|三|四|五|六|七|八|九|十)\s*[个件]装", spec)
    if m:
        g = m.group(1)
        n_per = int(g) if g.isdigit() else CN_NUM.get(g, 1)
    # 「X只」写法（如「1只」「2只」）
    if n_per == 1:
        m = re.search(r"(\d+|一|二|三|四|五|六|七|八|九|十)\s*只", spec)
        if m:
            g = m.group(1)
            n_per = int(g) if g.isdigit() else CN_NUM.get(g, 1)
    # 「单层/双层/三层」写法
    if n_per == 1:
        if "三层" in spec:
            n_per = 3
        elif "双层" in spec:
            n_per = 2
    if "加厚加粗" not in spec and "加粗" not in spec:
        grade = "light"
    return n_per, grade


def _is_hook_goods(name: str) -> bool:
    """判断商品名是否是挂钩类（门后挂钩/厨房挂钩等），用于挂钩数统计。

    比 spec 是否含「个装/件装」更可靠：单件/1只/双层/七钩壁挂等无「个装」字样的
    挂钩也能纳入累计，避免漏算全量挂钩数。
    """
    if not name:
        return False
    return any(k in name for k in ("挂钩", "挂衣钩", "挂衣架", "挂架", "衣帽架", "衣帽钩"))


def _hook_freight(weight: float):
    """按重量档估算运费（与 calc_hook_cost 同口径）。"""
    if weight <= 0.5:
        return 2.5
    if weight <= 1.0:
        return 3.0
    if weight <= 2.0:
        return 4.2
    if weight <= 3.0:
        return 5.4
    return 0.0


def settle_daily_profit(stat_date: str) -> dict:
    """结算某日各店盈利，写入 daily_profit 表（幂等覆盖）。

    口径：
      净收入 = 非退款单 seller_amount 合计（pay_time 当天）
      退款   = 退款成功单 seller_amount 合计
      推广   = promo_daily_bill flow_type=2 当天 amount 合计
      成本   = 门后挂钩参数模型（spec 含「个装」才计，否则暂 0，铁艺工艺品待匹配进货价）
      净利   = 净收入 - 推广 - 商品成本 - 运费
    """
    with closing(_conn()) as c:
        p = {r["key"]: r["value"] for r in c.execute("SELECT key, value FROM fixed_cost_params").fetchall()}
        hook_cost = p.get("hook_cost", 2.2)
        hook_cost_light = p.get("hook_cost_light", 2.05)
        box_cost = p.get("box_cost", 0.0)
        labor_cost = p.get("labor_cost", 0.0)
        hook_weight = p.get("hook_weight", 0.25)
        box_weight = p.get("box_weight", 0.08)

        order_rows = c.execute(
            "SELECT shop_id, aftersale_status, spec, seller_amount, quantity FROM orders "
            "WHERE pay_time LIKE ? AND seller_amount IS NOT NULL "
            "AND status NOT IN ('已取消', '待付款', '交易关闭', '已关闭')",
            (stat_date + "%",),
        ).fetchall()

        income = {}   # shop_id -> 净收入
        refund = {}   # shop_id -> 退款
        gcost = {}    # shop_id -> 商品成本
        fcost = {}    # shop_id -> 运费
        cnt = {}      # shop_id -> 订单数
        for r in order_rows:
            sid = r["shop_id"]
            amt = r["seller_amount"] or 0.0
            cnt[sid] = cnt.get(sid, 0) + 1
            if r["aftersale_status"] in ("退款成功", "退款完成"):
                refund[sid] = refund.get(sid, 0.0) + amt
                continue
            income[sid] = income.get(sid, 0.0) + amt
            spec = r["spec"] or ""
            qty = r["quantity"] or 1
            # 门后挂钩类（spec 含「个装/件装」）才按参数模型计成本
            if "个装" in spec or "件装" in spec:
                n_per, grade = _parse_hook_spec(spec)
                # 挂钩总数量 = 订单数量 × 个装数（如「数量2 的 2个装」= 2×2 = 4 个挂钩）
                n_hooks = qty * n_per
                hc = hook_cost_light if grade == "light" else hook_cost
                gcost[sid] = gcost.get(sid, 0.0) + (hc * n_hooks + box_cost + labor_cost)
                w = hook_weight * n_hooks + box_weight
                fcost[sid] = fcost.get(sid, 0.0) + _hook_freight(w)
            # 非挂钩类（铁艺工艺品等）成本暂记 0，待匹配 supplier_products 进货价

        spend = {}
        for r in c.execute(
            "SELECT shop_id, SUM(amount) s FROM promo_daily_bill "
            "WHERE flow_type=2 AND flow_time LIKE ? GROUP BY shop_id",
            (stat_date + "%",),
        ).fetchall():
            spend[r["shop_id"]] = r["s"] or 0.0

        shop_ids = set(income) | set(spend) | set(refund)
        results = []
        for sid in shop_ids:
            inc = round(income.get(sid, 0.0), 2)
            ref = round(refund.get(sid, 0.0), 2)
            spd = round(spend.get(sid, 0.0), 2)
            gc = round(gcost.get(sid, 0.0), 2)
            fc = round(fcost.get(sid, 0.0), 2)
            net = round(inc - spd - gc - fc, 2)
            c.execute(
                "INSERT INTO daily_profit(shop_id, stat_date, net_income, refund_amount, "
                "promo_spend, goods_cost, freight_cost, gross_profit, order_count) "
                "VALUES(?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(shop_id, stat_date) DO UPDATE SET "
                "net_income=excluded.net_income, refund_amount=excluded.refund_amount, "
                "promo_spend=excluded.promo_spend, goods_cost=excluded.goods_cost, "
                "freight_cost=excluded.freight_cost, gross_profit=excluded.gross_profit, "
                "order_count=excluded.order_count",
                (sid, stat_date, inc, ref, spd, gc, fc, net, cnt.get(sid, 0)),
            )
            results.append({
                "shop_id": sid, "net_income": inc, "refund": ref, "spend": spd,
                "goods_cost": gc, "freight_cost": fc, "net_profit": net,
                "order_count": cnt.get(sid, 0),
            })
        c.commit()
    return {"date": stat_date, "shops": results}


def list_daily_profit(shop_id=None, start=None, end=None, limit=90) -> list[dict]:
    """查询每日盈利，按日期倒序。"""
    sql = ("SELECT dp.*, sh.name AS shop_name FROM daily_profit dp "
           "LEFT JOIN shops sh ON sh.id=dp.shop_id WHERE 1=1")
    args = []
    if shop_id:
        sql += " AND dp.shop_id=?"
        args.append(shop_id)
    if start:
        sql += " AND dp.stat_date>=?"
        args.append(start)
    if end:
        sql += " AND dp.stat_date<=?"
        args.append(end)
    sql += " ORDER BY dp.stat_date DESC, dp.shop_id ASC LIMIT ?"
    args.append(limit)
    with closing(_conn()) as c:
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def update_cost_params(params: dict) -> dict:
    """更新固定成本参数（前端可编辑）。params: {key: value}，只允许白名单 key。"""
    allowed = {"hook_cost", "hook_cost_light", "box_cost", "labor_cost", "hook_weight", "box_weight"}
    updated = {}
    with closing(_conn()) as c:
        for k, v in (params or {}).items():
            if k not in allowed:
                continue
            try:
                val = float(v)
            except (TypeError, ValueError):
                continue
            c.execute(
                "UPDATE fixed_cost_params SET value=?, updated_at=datetime('now','localtime') WHERE key=?",
                (val, k),
            )
            updated[k] = val
        c.commit()
    return updated


def _classify_category(name: str) -> str:
    """按商品名关键词归类品类（成交商品，优先级从高到低）。"""
    if not name:
        return "未分类"
    if any(k in name for k in ("雨链", "导水链", "落水链", "雨水链")):
        return "雨链"
    if any(k in name for k in ("风铃", "门铃", "铃铛", "手摇铃")):
        return "风铃/门铃"
    if any(k in name for k in ("花架", "爬藤", "花墙", "攀爬", "花几", "花凳", "花盆", "花插", "花篮", "屏风")):
        return "铁艺花架"
    if any(k in name for k in ("壁饰", "壁挂", "背景墙", "假窗户", "五角星", "墙饰")):
        return "铁艺壁饰"
    if any(k in name for k in ("摆件", "小椅子", "树桩", "多肉", "小鸟")):
        return "摆件"
    if any(k in name for k in ("半成品", "冲压", "配件", "子母扣", "吸盘")):
        return "配件半成品"
    if any(k in name for k in ("橱柜挂钩", "厨房挂钩", "橱柜门", "五连钩", "短卡夹", "排钩")):
        return "橱柜/厨房挂钩"
    if any(k in name for k in ("收纳", "鞋柜")):
        return "收纳"
    if any(k in name for k in ("挂钩", "挂衣钩", "衣帽架", "挂架", "挂衣架", "门后")):
        return "门后挂钩"
    return "其他"


def _sale_where(start=None, end=None):
    """销售查询公共 WHERE（排除退款单 + 未成交单 + 无支付时间 + 时间范围）。

    有效成交口径：status 非 已取消/待付款/交易关闭/已关闭，
    aftersale_status 非 退款成功/退款完成，pay_time 有效日期。
    """
    sql = ("o.platform_product_id != '' "
           "AND o.status NOT IN ('已取消', '待付款', '交易关闭', '已关闭') "
           "AND o.aftersale_status NOT IN ('退款成功', '退款完成') "
           "AND o.seller_amount IS NOT NULL "
           "AND o.pay_time IS NOT NULL AND o.pay_time != '' AND o.pay_time >= '2000-01-01'")
    args = []
    if start:
        sql += " AND o.pay_time >= ?"
        args.append(start + " 00:00:00")
    if end:
        sql += " AND o.pay_time <= ?"
        args.append(end + " 23:59:59")
    return sql, args


def sale_category_summary(start=None, end=None) -> list[dict]:
    """按品类汇总销售（销量/金额/单数/商品数），按金额倒序。"""
    where, args = _sale_where(start, end)
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT o.platform_product_id, p.name, SUM(o.quantity) qty, "
            "SUM(o.seller_amount) amt, COUNT(*) cnt FROM orders o "
            "LEFT JOIN products p ON p.platform_product_id=o.platform_product_id AND p.shop_id=o.shop_id "
            f"WHERE {where} GROUP BY o.shop_id, o.platform_product_id",
            args,
        ).fetchall()
    cats = {}
    for r in rows:
        cat = _classify_category(r["name"] or "")
        d = cats.setdefault(cat, {"category": cat, "qty": 0, "amt": 0.0, "cnt": 0, "products": 0})
        d["qty"] += r["qty"] or 0
        d["amt"] += r["amt"] or 0.0
        d["cnt"] += r["cnt"] or 0
        d["products"] += 1
    for d in cats.values():
        d["qty"] = round(d["qty"])
        d["amt"] = round(d["amt"], 2)
    return sorted(cats.values(), key=lambda x: -x["amt"])


def sale_date_range() -> dict:
    """有效成交订单的日期范围（最早/最新 pay_time）。"""
    where, args = _sale_where(None, None)
    with closing(_conn()) as c:
        row = c.execute(
            "SELECT MIN(substr(o.pay_time,1,10)) mn, MAX(substr(o.pay_time,1,10)) mx FROM orders o "
            f"WHERE {where}",
            args,
        ).fetchone()
    return {"start": row["mn"], "end": row["mx"]}


def sale_daily(start=None, end=None, limit=90) -> list[dict]:
    """按 日期 × 品类 汇总销售，日期倒序。"""
    where, args = _sale_where(start, end)
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT substr(o.pay_time,1,10) d, o.platform_product_id, p.name, "
            "SUM(o.quantity) qty, SUM(o.seller_amount) amt, COUNT(*) cnt FROM orders o "
            "LEFT JOIN products p ON p.platform_product_id=o.platform_product_id AND p.shop_id=o.shop_id "
            f"WHERE {where} GROUP BY substr(o.pay_time,1,10), o.shop_id, o.platform_product_id",
            args,
        ).fetchall()
    daily = {}
    for r in rows:
        cat = _classify_category(r["name"] or "")
        d = daily.setdefault(r["d"], {})
        c2 = d.setdefault(cat, {"qty": 0, "amt": 0.0, "cnt": 0})
        c2["qty"] += r["qty"] or 0
        c2["amt"] += r["amt"] or 0.0
        c2["cnt"] += r["cnt"] or 0
    out = []
    for date in sorted(daily.keys(), reverse=True)[:limit]:
        cats = daily[date]
        total_amt = round(sum(v["amt"] for v in cats.values()), 2)
        total_qty = sum(v["qty"] for v in cats.values())
        out.append({"date": date, "qty": total_qty, "amt": total_amt, "categories": cats})
    return out


def sale_monthly(limit=24) -> list[dict]:
    """按 月份 × 品类 汇总销售，月份倒序。"""
    where, args = _sale_where(None, None)
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT substr(o.pay_time,1,7) m, o.platform_product_id, p.name, "
            "SUM(o.quantity) qty, SUM(o.seller_amount) amt, COUNT(*) cnt FROM orders o "
            "LEFT JOIN products p ON p.platform_product_id=o.platform_product_id AND p.shop_id=o.shop_id "
            f"WHERE {where} GROUP BY substr(o.pay_time,1,7), o.shop_id, o.platform_product_id",
            args,
        ).fetchall()
    monthly = {}
    for r in rows:
        cat = _classify_category(r["name"] or "")
        d = monthly.setdefault(r["m"], {})
        c2 = d.setdefault(cat, {"qty": 0, "amt": 0.0, "cnt": 0})
        c2["qty"] += r["qty"] or 0
        c2["amt"] += r["amt"] or 0.0
        c2["cnt"] += r["cnt"] or 0
    out = []
    for month in sorted(monthly.keys(), reverse=True)[:limit]:
        cats = monthly[month]
        total_amt = round(sum(v["amt"] for v in cats.values()), 2)
        total_qty = sum(v["qty"] for v in cats.values())
        out.append({"month": month, "qty": total_qty, "amt": total_amt, "categories": cats})
    return out


def sale_sku_detail(start=None, end=None, limit=500) -> list[dict]:
    """SKU 明细：商品 × spec（SKU）维度销量/金额，含品类，按金额倒序。"""
    where, args = _sale_where(start, end)
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT o.shop_id, o.platform_product_id, p.name, o.spec, "
            "SUM(o.quantity) qty, SUM(o.seller_amount) amt, COUNT(*) cnt FROM orders o "
            "LEFT JOIN products p ON p.platform_product_id=o.platform_product_id AND p.shop_id=o.shop_id "
            f"WHERE {where} GROUP BY o.shop_id, o.platform_product_id, o.spec "
            "ORDER BY amt DESC LIMIT ?",
            args + [limit],
        ).fetchall()
    out = []
    for r in rows:
        spec = r["spec"] or ""
        # 挂钩个数 = 件数 × 个装数（挂钩类商品才计；单件/1只/双层等无「个装」字样也按 1/2 计）
        hook_count = 0
        if _is_hook_goods(r["name"] or ""):
            n_per, _ = _parse_hook_spec(spec)
            hook_count = (r["qty"] or 0) * n_per
        out.append({
            "shop_id": r["shop_id"],
            "platform_product_id": r["platform_product_id"],
            "name": r["name"] or "",
            "category": _classify_category(r["name"] or ""),
            "spec": spec,
            "qty": r["qty"] or 0,
            "hook_count": hook_count,
            "amt": round(r["amt"] or 0.0, 2),
            "cnt": r["cnt"] or 0,
        })
    return out


def sale_sku_summary(start=None, end=None, limit=500) -> list[dict]:
    """SKU 明细按商品汇总：合并同一商品的不同规格（几个装），销量/挂钩数/金额/单数合计。

    同一款商品常因「1个装/2个装」等规格拆成多行，这里按 platform_product_id 合并，
    挂钩数 = Σ(件数 × 个装数)，spec 列列出各规格及销量供核对，按金额倒序。
    """
    where, args = _sale_where(start, end)
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT o.shop_id, o.platform_product_id, p.name, o.spec, "
            "SUM(o.quantity) qty, SUM(o.seller_amount) amt, COUNT(*) cnt FROM orders o "
            "LEFT JOIN products p ON p.platform_product_id=o.platform_product_id AND p.shop_id=o.shop_id "
            f"WHERE {where} GROUP BY o.shop_id, o.platform_product_id, o.spec",
            args,
        ).fetchall()
    groups = {}
    for r in rows:
        key = (r["shop_id"], r["platform_product_id"])
        g = groups.setdefault(key, {
            "shop_id": r["shop_id"], "platform_product_id": r["platform_product_id"],
            "name": r["name"] or "", "qty": 0, "amt": 0.0, "cnt": 0,
            "hook_count": 0, "specs": [],
        })
        spec = r["spec"] or ""
        qty = r["qty"] or 0
        g["qty"] += qty
        g["amt"] += r["amt"] or 0.0
        g["cnt"] += r["cnt"] or 0
        if spec:
            g["specs"].append({"spec": spec, "qty": qty})
        if _is_hook_goods(r["name"] or ""):
            n_per, _ = _parse_hook_spec(spec)
            g["hook_count"] += qty * n_per
    out = []
    for g in groups.values():
        g["specs"].sort(key=lambda s: -s["qty"])
        specs_desc = "；".join(f'{s["spec"]}(×{s["qty"]})' for s in g["specs"])
        out.append({
            "shop_id": g["shop_id"],
            "platform_product_id": g["platform_product_id"],
            "name": g["name"],
            "category": _classify_category(g["name"]),
            "spec": specs_desc,
            "spec_count": len(g["specs"]),
            "qty": g["qty"],
            "hook_count": g["hook_count"],
            "amt": round(g["amt"], 2),
            "cnt": g["cnt"],
        })
    out.sort(key=lambda x: -x["amt"])
    return out[:limit]


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
    # title_opt 表 fixed 列（失败记录「确认修复」标记，0=待处理 1=已确认）
    tocols = {r[1] for r in conn.execute("PRAGMA table_info(title_opt)").fetchall()}
    if "fixed" not in tocols:
        conn.execute("ALTER TABLE title_opt ADD COLUMN fixed INTEGER DEFAULT 0")
    # pack_records 表 scatter_shop 列（散单店铺名）
    prcols = {r[1] for r in conn.execute("PRAGMA table_info(pack_records)").fetchall()}
    if "scatter_shop" not in prcols:
        conn.execute("ALTER TABLE pack_records ADD COLUMN scatter_shop TEXT DEFAULT ''")
    # buyer_reviews 表 source 列（brief 详情页简版 / full 评论列表页全文）
    brcols = {r[1] for r in conn.execute("PRAGMA table_info(buyer_reviews)").fetchall()}
    if "source" not in brcols:
        conn.execute("ALTER TABLE buyer_reviews ADD COLUMN source TEXT DEFAULT 'brief'")
    # title_opt_log 表 source 列（ai 自动流程 / manual 人工操作）
    tlcols = {r[1] for r in conn.execute("PRAGMA table_info(title_opt_log)").fetchall()}
    if "source" not in tlcols:
        conn.execute("ALTER TABLE title_opt_log ADD COLUMN source TEXT DEFAULT 'ai'")
    # competitors 表 ai_status/ai_reason 列（AI 精准匹配：same/diff + 理由）
    compcols = {r[1] for r in conn.execute("PRAGMA table_info(competitors)").fetchall()}
    if "ai_status" not in compcols:
        conn.execute("ALTER TABLE competitors ADD COLUMN ai_status TEXT DEFAULT ''")
    if "ai_reason" not in compcols:
        conn.execute("ALTER TABLE competitors ADD COLUMN ai_reason TEXT DEFAULT ''")
    # autopublish_tasks / published_goods 表 operator_name 列（上架操作人，员工业绩标记）
    for _t in ("autopublish_tasks", "published_goods"):
        _cols = {r[1] for r in conn.execute(f"PRAGMA table_info({_t})").fetchall()}
        if "operator_name" not in _cols:
            conn.execute(f"ALTER TABLE {_t} ADD COLUMN operator_name TEXT DEFAULT ''")
    # users 表 permissions 列（模块访问权限，JSON 数组，["*"]=全权限）
    ucols = {r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "permissions" not in ucols:
        conn.execute("ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '[\"*\"]'")
        # 存量员工账号修正为员工默认权限（仅 admin 保持全权限）
        conn.execute("UPDATE users SET permissions='[\"dashboard\",\"autopublish\",\"publishedgoods\"]' WHERE role='operator'")
    conn.commit()


# ----------------------------- 用户 / 会话 -----------------------------
import hashlib as _hashlib
import secrets as _secrets


def _hash_password(password: str) -> str:
    salt = _secrets.token_hex(8)
    h = _hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
    return f"{salt}${h.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, h = stored.split('$', 1)
        calc = _hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
        return _secrets.compare_digest(calc.hex(), h)
    except Exception:
        return False


def create_user(username: str, password: str, name: str, role: str = 'operator', permissions=None) -> dict:
    if permissions is None:
        # admin 全权限；员工默认只给上架相关基础权限
        permissions = '["*"]' if role == 'admin' else '["dashboard","autopublish","publishedgoods"]'
    if isinstance(permissions, (list, tuple)):
        permissions = json.dumps(list(permissions), ensure_ascii=False)
    with closing(_conn()) as c:
        h = _hash_password(password)
        cur = c.execute(
            "INSERT INTO users(username, password_hash, name, role, permissions) VALUES(?,?,?,?,?)",
            (username.strip(), h, name.strip(), role, permissions),
        )
        c.commit()
        row = c.execute("SELECT * FROM users WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row) if row else {}


def update_user_permissions(user_id: int, permissions) -> dict:
    """更新用户模块权限（JSON 数组）。返回更新后的用户。"""
    if isinstance(permissions, (list, tuple)):
        permissions = json.dumps(list(permissions), ensure_ascii=False)
    with closing(_conn()) as c:
        c.execute("UPDATE users SET permissions=? WHERE id=?", (permissions, user_id))
        c.commit()
        row = c.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        return dict(row) if row else {}


def get_user_permissions(user_id: int) -> list:
    """解析用户权限为 list，admin 恒为全权限。"""
    with closing(_conn()) as c:
        row = c.execute("SELECT role, permissions FROM users WHERE id=?", (user_id,)).fetchone()
    if not row:
        return []
    if row["role"] == "admin":
        return ["*"]
    try:
        perms = json.loads(row["permissions"] or '["*"]')
        return perms if isinstance(perms, list) else ["*"]
    except Exception:
        return ["*"]


def verify_login(username: str, password: str) -> dict:
    with closing(_conn()) as c:
        uname = (username or "").strip()
        # 同时支持登录账号(username)和中文姓名(name)登录
        row = c.execute(
            "SELECT * FROM users WHERE username=? OR name=?",
            (uname, uname),
        ).fetchone()
        if row and _verify_password(password, row["password_hash"]):
            return dict(row)
        return {}


def create_session(user_id: int) -> str:
    token = _secrets.token_hex(32)
    with closing(_conn()) as c:
        c.execute("INSERT OR REPLACE INTO sessions(token, user_id) VALUES(?,?)", (token, user_id))
        c.commit()
    return token


def get_user_by_token(token: str) -> dict:
    with closing(_conn()) as c:
        row = c.execute(
            "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token=?",
            (token,),
        ).fetchone()
        return dict(row) if row else {}


def list_users() -> list[dict]:
    with closing(_conn()) as c:
        rows = c.execute("SELECT * FROM users ORDER BY id").fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d.pop("password_hash", None)  # 绝不泄露密码哈希
            # permissions 解析成数组，admin 恒为 ["*"]
            d["permissions"] = get_user_permissions(d["id"])
            out.append(d)
        return out


def delete_user(user_id: int) -> bool:
    with closing(_conn()) as c:
        c.execute("DELETE FROM users WHERE id=?", (user_id,))
        c.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
        c.commit()
        return True


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


def import_promo_finance(shop_id: int, data: dict) -> int:
    """导入推广账户财务快照（单连接，按 (shop_id, stat_date) 幂等覆盖）。

    data: {stat_date, total_balance, avail_balance, general_balance,
           restricted_balance, locked_balance, cash_balance, red_packet_balance,
           today_spend, yesterday_spend}
    """
    conn = _conn()
    try:
        conn.execute(
            "INSERT INTO promo_finance(shop_id, stat_date, total_balance, avail_balance, "
            "general_balance, restricted_balance, locked_balance, cash_balance, "
            "red_packet_balance, today_spend, yesterday_spend) "
            "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(shop_id, stat_date) "
            "DO UPDATE SET total_balance=excluded.total_balance, avail_balance=excluded.avail_balance, "
            "general_balance=excluded.general_balance, restricted_balance=excluded.restricted_balance, "
            "locked_balance=excluded.locked_balance, cash_balance=excluded.cash_balance, "
            "red_packet_balance=excluded.red_packet_balance, today_spend=excluded.today_spend, "
            "yesterday_spend=excluded.yesterday_spend",
            (shop_id, data.get("stat_date", ""),
             data.get("total_balance"), data.get("avail_balance"),
             data.get("general_balance"), data.get("restricted_balance"),
             data.get("locked_balance"), data.get("cash_balance"),
             data.get("red_packet_balance"), data.get("today_spend"),
             data.get("yesterday_spend")),
        )
        conn.commit()
        return 1
    finally:
        conn.close()


def query_promo_finance(shop_id: int = None, limit: int = 30) -> list[dict]:
    """查询推广账户财务快照（按日期倒序，带店铺名）。"""
    conn = _conn()
    try:
        if shop_id:
            rows = conn.execute(
                "SELECT pf.*, s.name AS shop_name FROM promo_finance pf "
                "LEFT JOIN shops s ON s.id = pf.shop_id "
                "WHERE pf.shop_id=? ORDER BY pf.stat_date DESC LIMIT ?",
                (shop_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT pf.*, s.name AS shop_name FROM promo_finance pf "
                "LEFT JOIN shops s ON s.id = pf.shop_id "
                "ORDER BY pf.stat_date DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def import_promo_monthly_bill(shop_id: int, bills: list[dict]) -> int:
    """导入月结账单（按 (shop_id, bill_period, bill_subject) 幂等覆盖）。

    bills: [{bill_period, bill_amount, bill_subject}]
    """
    conn = _conn()
    try:
        n = 0
        for b in bills:
            conn.execute(
                "INSERT INTO promo_monthly_bill(shop_id, bill_period, bill_amount, bill_subject) "
                "VALUES(?, ?, ?, ?) "
                "ON CONFLICT(shop_id, bill_period, bill_subject) "
                "DO UPDATE SET bill_amount=excluded.bill_amount",
                (shop_id, b.get("bill_period", ""), b.get("bill_amount"), b.get("bill_subject", "")),
            )
            n += 1
        conn.commit()
        return n
    finally:
        conn.close()


def query_promo_monthly_bill(shop_id: int = None, limit: int = 100) -> list[dict]:
    """查询月结账单（带店铺名，按账单日期倒序）。"""
    conn = _conn()
    try:
        if shop_id:
            rows = conn.execute(
                "SELECT pmb.*, s.name AS shop_name FROM promo_monthly_bill pmb "
                "LEFT JOIN shops s ON s.id = pmb.shop_id "
                "WHERE pmb.shop_id=? ORDER BY pmb.bill_period DESC LIMIT ?",
                (shop_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT pmb.*, s.name AS shop_name FROM promo_monthly_bill pmb "
                "LEFT JOIN shops s ON s.id = pmb.shop_id "
                "ORDER BY pmb.bill_period DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def import_promo_daily_bill(shop_id: int, rows: list[dict]) -> int:
    """导入日账单流水明细（按 (shop_id, flow_time, transaction_id, amount, flow_type) 幂等跳过）。

    rows: [{flow_time, transaction_id, fund_type, flow_type, amount, balance, brief, summary}]
    """
    def _f(v):
        try:
            return float(v) if v not in (None, "") else None
        except (ValueError, TypeError):
            return None
    conn = _conn()
    try:
        n = 0
        for r in rows:
            cur = conn.execute(
                "INSERT INTO promo_daily_bill(shop_id, flow_time, transaction_id, fund_type, flow_type, amount, balance, brief, summary) "
                "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(shop_id, flow_time, transaction_id, amount, flow_type) DO NOTHING",
                (
                    shop_id,
                    r.get("flow_time", ""),
                    r.get("transaction_id", ""),
                    r.get("fund_type"),
                    r.get("flow_type"),
                    _f(r.get("amount")),
                    _f(r.get("balance")),
                    r.get("brief", ""),
                    r.get("summary", ""),
                ),
            )
            if cur.rowcount > 0:
                n += 1
        conn.commit()
        return n
    finally:
        conn.close()


def query_promo_daily_bill(shop_id: int = None, start: str = None, end: str = None, limit: int = 500) -> list[dict]:
    """查询日账单流水（带店铺名，按流水时间倒序）。可按店铺/日期范围筛选。"""
    conn = _conn()
    try:
        sql = ("SELECT pdb.*, s.name AS shop_name FROM promo_daily_bill pdb "
               "LEFT JOIN shops s ON s.id = pdb.shop_id WHERE 1=1")
        args = []
        if shop_id:
            sql += " AND pdb.shop_id=?"
            args.append(shop_id)
        if start:
            sql += " AND pdb.flow_time >= ?"
            args.append(start)
        if end:
            sql += " AND pdb.flow_time <= ?"
            args.append(end)
        sql += " ORDER BY pdb.flow_time DESC LIMIT ?"
        args.append(limit)
        rows = conn.execute(sql, args).fetchall()
        return [dict(r) for r in rows]
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


def list_freight_by_date(date: str = None, limit: int = 1000) -> list[dict]:
    """按发货日期查运费单明细（含订单规格/店铺/推断重量），供差额记录弹框用。"""
    with closing(_conn()) as c:
        sql = ("SELECT f.tracking_no, f.account_name, f.courier, f.ship_date, "
               "f.province, f.city, f.weight, f.freight_cost, f.bill_fee, "
               "f.extra_fee, f.total, f.matched, "
               "o.spec, o.quantity, o.order_no, o.platform_product_id, "
               "s.name AS shop_name, sw.weight AS est_weight "
               "FROM freight f "
               "LEFT JOIN orders o ON o.order_no = f.matched_order_no "
               "LEFT JOIN shops s ON s.id = f.matched_shop_id "
               "LEFT JOIN sku_weight sw ON sw.platform_product_id = o.platform_product_id "
               "   AND sw.spec = o.spec AND sw.quantity = o.quantity")
        args = []
        if date:
            sql += " WHERE f.ship_date = ?"
            args.append(date)
        sql += " ORDER BY f.ship_date DESC LIMIT ?"
        args.append(limit)
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def rebuild_sku_weights() -> dict:
    """从运费账单推断每个 SKU 的真实重量（中位数法，对算错/异常值鲁棒），落地 sku_weight 表。

    返回 {groups, total_rows}。
    """
    from collections import defaultdict
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT o.platform_product_id, o.spec, o.quantity, f.weight "
            "FROM freight f JOIN orders o ON o.order_no = f.matched_order_no "
            "WHERE f.weight IS NOT NULL AND o.spec != ''"
        ).fetchall()
        groups = defaultdict(list)
        for r in rows:
            groups[(r["platform_product_id"], r["spec"], r["quantity"])].append(r["weight"])
        for (ppid, spec, qty), weights in groups.items():
            w = sorted(weights)
            n = len(w)
            median = w[n // 2] if n % 2 else (w[n // 2 - 1] + w[n // 2]) / 2
            q25 = w[int(n * 0.25)]
            q75 = w[min(int(n * 0.75), n - 1)]
            c.execute(
                "INSERT INTO sku_weight(platform_product_id, spec, quantity, weight, "
                "weight_q25, weight_q75, sample_count, updated_at) "
                "VALUES(?,?,?,?,?,?,?,datetime('now','localtime')) "
                "ON CONFLICT(platform_product_id, spec, quantity) DO UPDATE SET "
                "weight=excluded.weight, weight_q25=excluded.weight_q25, "
                "weight_q75=excluded.weight_q75, sample_count=excluded.sample_count, "
                "updated_at=excluded.updated_at",
                (ppid, spec, qty, round(median, 2), round(q25, 2), round(q75, 2), n),
            )
        c.commit()
        return {"groups": len(groups), "total_rows": len(rows)}


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
            "o.platform_product_id, o.spec, o.quantity, o.order_no, "
            "s.name AS shop_name "
            "FROM freight f JOIN orders o ON o.order_no = f.matched_order_no "
            "LEFT JOIN shops s ON s.id = f.matched_shop_id "
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
                    "shop_name": it["shop_name"],
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


def freight_order_detail(order_no: str = None, tracking_no: str = None) -> dict:
    """单个订单完整信息 + 运费信息（匹配分析列表点击订单号弹框用）。

    按 tracking_no（优先）或 order_no 定位，返回 {found, order, freight}。
    """
    with closing(_conn()) as c:
        where = "f.tracking_no = ?"
        arg = tracking_no
        if not tracking_no:
            where = "f.matched_order_no = ?"
            arg = order_no
        row = c.execute(
            "SELECT o.order_no, o.status, o.quantity, o.pay_time, o.confirm_time, "
            "o.spec, o.buyer_amount, o.seller_amount, o.district, o.platform_product_id, "
            "o.province, o.city, "
            "s.name AS shop_name, "
            "f.tracking_no, f.account_name, f.courier, f.ship_date, "
            "f.province AS f_province, f.city AS f_city, f.weight, f.freight_cost, "
            "f.bill_fee, f.extra_fee, f.total "
            "FROM freight f "
            "LEFT JOIN orders o ON o.order_no = f.matched_order_no "
            "LEFT JOIN shops s ON s.id = f.matched_shop_id "
            "WHERE " + where,
            (arg,),
        ).fetchone()
        if not row:
            return {"found": False}
        std = calc_freight(row["f_province"], row["f_city"], row["weight"])
        return {
            "found": True,
            "order": {
                "order_no": row["order_no"],
                "shop_name": row["shop_name"] or "",
                "status": row["status"] or "",
                "quantity": row["quantity"],
                "spec": row["spec"] or "",
                "platform_product_id": row["platform_product_id"] or "",
                "buyer_amount": row["buyer_amount"],
                "seller_amount": row["seller_amount"],
                "pay_time": row["pay_time"] or "",
                "confirm_time": row["confirm_time"] or "",
                "province": row["province"] or "",
                "city": row["city"] or "",
                "district": row["district"] or "",
                "courier": row["courier"] or "",
            },
            "freight": {
                "tracking_no": row["tracking_no"],
                "account_name": row["account_name"] or "",
                "courier": row["courier"] or "",
                "ship_date": row["ship_date"] or "",
                "province": row["f_province"] or "",
                "city": row["f_city"] or "",
                "weight": row["weight"],
                "freight_cost": row["freight_cost"],
                "bill_fee": row["bill_fee"],
                "extra_fee": row["extra_fee"],
                "total": row["total"],
                "standard": std["total"] if std else None,
                "diff": round((row["total"] or 0) - std["total"], 2) if std else None,
            },
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


def freight_compare(month: str = None) -> dict:
    """自动对账：实际运费 vs 报价单标准，标多收/少收/相符，大误差单独标记。

    month: 可选，按月份（substr(ship_date,1,7)）筛选。
    返回 {total_compared, match, over, under, over_amount, big_count, big_diff,
          months, items}；items 每项含 big 标记（|diff| >= big_diff）。
    """
    BIG_DIFF = 1.0  # 大误差阈值：实际与标准相差 ≥1 元
    with closing(_conn()) as c:
        rates = list_freight_rate()
        where = "WHERE f.matched = 1 AND f.weight IS NOT NULL"
        args = []
        if month:
            where += " AND substr(f.ship_date,1,7) = ?"
            args.append(month)
        months = [r["ym"] for r in c.execute(
            "SELECT DISTINCT substr(f.ship_date,1,7) AS ym FROM freight f "
            "WHERE f.matched = 1 AND f.weight IS NOT NULL ORDER BY ym"
        ).fetchall()]
        rows = c.execute(
            "SELECT f.tracking_no, f.total AS actual, f.weight, f.province, f.city, "
            "f.ship_date, o.order_no, o.spec, o.platform_product_id, "
            "sw.weight AS est_weight "
            "FROM freight f "
            "JOIN orders o ON o.order_no = f.matched_order_no "
            "LEFT JOIN sku_weight sw ON sw.platform_product_id = o.platform_product_id "
            "   AND sw.spec = o.spec AND sw.quantity = o.quantity "
            + where, args
        ).fetchall()
        items = []
        match = over = under = big_count = weight_wrong_count = 0
        for r in rows:
            # 优先用推断重量（真实重量），无推断则回退账单重量
            w = r["est_weight"] if r["est_weight"] is not None else r["weight"]
            calc = calc_freight(r["province"], r["city"], w, rates)
            if calc is None:
                continue
            actual = r["actual"] or 0
            diff = round(actual - calc["total"], 2)
            status = "相符" if abs(diff) < 0.005 else ("多收" if diff > 0 else "少收")
            big = abs(diff) >= BIG_DIFF
            weight_wrong = (r["est_weight"] is not None and r["weight"] is not None
                            and abs(r["weight"] - r["est_weight"]) > 0.3)
            if status == "相符":
                match += 1
            elif status == "多收":
                over += 1
            else:
                under += 1
            if big:
                big_count += 1
            if weight_wrong:
                weight_wrong_count += 1
            items.append({
                "tracking_no": r["tracking_no"], "order_no": r["order_no"],
                "spec": r["spec"], "province": r["province"], "city": r["city"],
                "ship_date": r["ship_date"], "weight": r["weight"],
                "est_weight": r["est_weight"], "weight_wrong": weight_wrong,
                "region_group": calc["region_group"],
                "standard": calc["total"], "actual": actual, "diff": diff,
                "status": status, "big": big,
            })
        items.sort(key=lambda x: -abs(x["diff"]))
        over_amount = round(sum(x["diff"] for x in items if x["status"] == "多收"), 2)
        return {
            "total_compared": len(items),
            "match": match, "over": over, "under": under,
            "over_amount": over_amount,
            "big_count": big_count, "big_diff": BIG_DIFF,
            "weight_wrong_count": weight_wrong_count,
            "months": months,
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


def platform_overview(start: str = None, end: str = None) -> dict:
    """按平台聚合真实经营数据：商品数/SKU数/订单数/GMV，供运营总览展示。

    订单数/GMV 只统计「有效成交」订单：排除退款（含「退款」）、取消（含「取消」）、
    关闭（含「关闭」）、待付款、待发货；保留已收货/已发货待收货/交易成功/已完成等。
    支持按付款时间 pay_time 过滤日期段（start/end，格式 YYYY-MM-DD）。
    """
    # 有效成交状态过滤：排除退款/取消/关闭/待定；
    # status 为空但有快递单号（抖音等无状态列平台，已发货）也算有效
    VALID = ("((status != '' AND status NOT LIKE '%退款%' AND status NOT LIKE '%取消%' "
             "AND status NOT LIKE '%关闭%' AND status NOT IN ('待付款','待发货')) "
             "OR (status = '' AND tracking_no != ''))")
    # 日期段过滤（按付款时间）
    date_cond = ""
    date_params = []
    if start:
        date_cond += " AND pay_time >= ?"
        date_params.append(start)
    if end:
        date_cond += " AND pay_time <= ?"
        date_params.append(end + " 23:59:59")
    with closing(_conn()) as c:
        items = []
        for pl in c.execute("SELECT * FROM platforms ORDER BY id").fetchall():
            pid = pl["id"]
            shop_in = "SELECT id FROM shops WHERE platform_id=?"
            prod_in = "SELECT id FROM products WHERE shop_id IN (%s)" % shop_in
            products = c.execute(
                "SELECT COUNT(*) AS n FROM products WHERE shop_id IN (%s)" % shop_in,
                (pid,)).fetchone()["n"]
            skus = c.execute(
                "SELECT COUNT(*) AS n FROM skus WHERE product_id IN (%s)" % prod_in,
                (pid,)).fetchone()["n"]
            orders = c.execute(
                "SELECT COUNT(*) AS n FROM orders WHERE shop_id IN (%s) AND %s%s" % (shop_in, VALID, date_cond),
                (pid, *date_params)).fetchone()["n"]
            gmv = c.execute(
                "SELECT ROUND(COALESCE(SUM(buyer_amount),0),2) AS n FROM orders "
                "WHERE shop_id IN (%s) AND %s%s" % (shop_in, VALID, date_cond),
                (pid, *date_params)).fetchone()["n"]
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
            "(SELECT name FROM shops WHERE id=p.shop_id) AS shop_name, "
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


def add_title_opt(shop_id: int, platform_product_id: str, source: str = "ai") -> int:
    """挑选商品进标题优化，快照旧标题，状态 selected。返回 id；有订单返回 -1；不存在返回 None。

    source: ai=自动流程(定时任务) / manual=人工在页面挑。
    """
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
        cur = c.execute(
            "INSERT INTO title_opt(shop_id, platform_product_id, product_name, product_code, old_title, status) "
            "VALUES(?,?,?,?,?,'selected') "
            "ON CONFLICT(shop_id, platform_product_id) DO NOTHING",
            (shop_id, platform_product_id, prod["name"], prod["code"] or "", prod["name"] or ""),
        )
        if cur.rowcount > 0:
            c.execute(
                "INSERT INTO title_opt_log(shop_id, platform_product_id, product_name, old_title, new_title, action, status, note, source) "
                "VALUES(?,?,?,?,?,'pick','success','',?)",
                (shop_id, platform_product_id, prod["name"] or "", prod["name"] or "", "", source),
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
            "(SELECT name FROM shops WHERE id=t.shop_id) AS shop_name, "
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


def title_opt_stats(conn: sqlite3.Connection = None) -> dict:
    """标题优化闭环统计：总数 / 已改后台 / 待处理 / 待确认修复。"""
    own = conn is None
    if own:
        conn = _conn()
    try:
        total = conn.execute("SELECT COUNT(*) AS n FROM title_opt").fetchone()["n"]
        done = conn.execute("SELECT COUNT(*) AS n FROM title_opt WHERE status='done'").fetchone()["n"]
        optimized = conn.execute("SELECT COUNT(*) AS n FROM title_opt WHERE status='optimized'").fetchone()["n"]
        fixed = conn.execute("SELECT COUNT(*) AS n FROM title_opt WHERE status='optimized' AND fixed=1").fetchone()["n"]
        logs = conn.execute("SELECT COUNT(*) AS n FROM title_opt_log").fetchone()["n"]
        return {"total": total, "done": done, "optimized": optimized,
                "pending_fixed": optimized - fixed, "fixed": fixed, "logs": logs}
    finally:
        if own:
            conn.close()


def flow_stats() -> dict:
    """运营闭环全景：各环节关键计数（选品 → 上架 → 测款 → 采集 → 复盘）。"""
    with closing(_conn()) as c:
        def n(sql):
            return c.execute(sql).fetchone()[0]
        return {
            "suppliers": n("SELECT COUNT(*) FROM suppliers"),
            "supplier_products": n("SELECT COUNT(*) FROM supplier_products"),
            "platforms": n("SELECT COUNT(*) FROM platforms"),
            "shops": n("SELECT COUNT(*) FROM shops"),
            "products": n("SELECT COUNT(*) FROM products"),
            "skus": n("SELECT COUNT(*) FROM skus"),
            "orders": n("SELECT COUNT(*) FROM orders"),
            "promotions": n("SELECT COUNT(*) FROM promotions"),
            "competitors": n("SELECT COUNT(*) FROM competitors"),
            "reviews": n("SELECT COUNT(*) FROM reviews"),
            "buyer_reviews": n("SELECT COUNT(*) FROM buyer_reviews"),
            "scheduled_tasks": n("SELECT COUNT(*) FROM scheduled_tasks"),
            "task_runs": n("SELECT COUNT(*) FROM task_runs"),
            "freight": n("SELECT COUNT(*) FROM freight"),
            "pack_records": n("SELECT COUNT(*) FROM pack_records"),
            "goods_effect": n("SELECT COUNT(*) FROM goods_effect"),
            "title_opt": title_opt_stats(c),
        }


def update_title_opt(opt_id: int, new_title: str = None, status: str = None, note: str = None, source: str = "ai") -> bool:
    """更新标题优化记录，new_title 变更时写 optimize 日志。source: ai/manual。"""
    with closing(_conn()) as c:
        prev = None
        if new_title is not None:
            prev = c.execute(
                "SELECT shop_id, platform_product_id, product_name, old_title, new_title FROM title_opt WHERE id=?",
                (opt_id,),
            ).fetchone()
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
        if new_title is not None and prev and (prev["new_title"] or "") != new_title:
            c.execute(
                "INSERT INTO title_opt_log(shop_id, platform_product_id, product_name, old_title, new_title, action, status, note, source) "
                "VALUES(?,?,?,?,?,'optimize','success','',?)",
                (prev["shop_id"], prev["platform_product_id"], prev["product_name"] or "",
                 prev["new_title"] or prev["old_title"] or "", new_title, source),
            )
        c.commit()
        return True


def delete_title_opt(opt_id: int) -> bool:
    with closing(_conn()) as c:
        c.execute("DELETE FROM title_opt WHERE id=?", (opt_id,))
        c.commit()
        return True


def mark_title_opt_fixed(opt_id: int) -> bool:
    """标记失败记录为「已确认修复」（fixed=1），从失败清单移除。"""
    with closing(_conn()) as c:
        row = c.execute("SELECT shop_id, platform_product_id, product_name, old_title, new_title, note FROM title_opt WHERE id=?", (opt_id,)).fetchone()
        if not row:
            return False
        c.execute("UPDATE title_opt SET fixed=1 WHERE id=?", (opt_id,))
        c.execute(
            "INSERT INTO title_opt_log(shop_id, platform_product_id, product_name, old_title, new_title, action, status, note, source) "
            "VALUES(?,?,?,?,?,?,?,?,'manual')",
            (row["shop_id"], row["platform_product_id"], row["product_name"] or "", row["old_title"] or "", row["new_title"] or "", "fix", "success", row["note"] or "确认修复"),
        )
        c.commit()
        return True


def mark_title_opt_fixed_batch(ids: list) -> int:
    """批量标记失败记录为「已确认修复」（fixed=1）。返回更新数量。"""
    if not ids:
        return 0
    with closing(_conn()) as c:
        ph = ",".join("?" * len(ids))
        rows = c.execute(
            f"SELECT id, shop_id, platform_product_id, product_name, old_title, new_title, note FROM title_opt WHERE id IN ({ph})",
            ids).fetchall()
        c.execute(f"UPDATE title_opt SET fixed=1 WHERE id IN ({ph})", ids)
        for row in rows:
            c.execute(
                "INSERT INTO title_opt_log(shop_id, platform_product_id, product_name, old_title, new_title, action, status, note, source) "
                "VALUES(?,?,?,?,?,?,?,?,'manual')",
                (row["shop_id"], row["platform_product_id"], row["product_name"] or "", row["old_title"] or "", row["new_title"] or "", "fix", "success", row["note"] or "确认修复"),
            )
        c.commit()
        return len(rows)


def get_title_opt_by_ids(ids: list) -> list[dict]:
    """按 id 批量查标题优化记录（执行更新用）。"""
    if not ids:
        return []
    with closing(_conn()) as c:
        ph = ",".join("?" * len(ids))
        rows = c.execute(f"SELECT * FROM title_opt WHERE id IN ({ph})", ids).fetchall()
        return [dict(r) for r in rows]


def log_title_opt(shop_id, platform_product_id, product_name, old_title, new_title, action, status="", note="", source="ai"):
    """记录标题优化操作日志（pick/optimize/apply）。source: ai=自动流程 / manual=人工操作。"""
    with closing(_conn()) as c:
        c.execute(
            "INSERT INTO title_opt_log(shop_id, platform_product_id, product_name, old_title, new_title, action, status, note, source) "
            "VALUES(?,?,?,?,?,?,?,?,?)",
            (shop_id, platform_product_id, product_name or "", old_title or "", new_title or "", action, status, note or "", source),
        )
        c.commit()


def has_order(shop_id, platform_product_id) -> bool:
    """判断商品是否有订单（有出单不改标题）。"""
    with closing(_conn()) as c:
        n = c.execute(
            "SELECT COUNT(*) FROM orders WHERE shop_id=? AND platform_product_id=?",
            (shop_id, platform_product_id),
        ).fetchone()[0]
        return n > 0


def list_title_opt_log(shop_id=None, limit=200) -> list[dict]:
    """查询标题优化日志（倒序）。"""
    with closing(_conn()) as c:
        if shop_id:
            rows = c.execute("SELECT * FROM title_opt_log WHERE shop_id=? ORDER BY id DESC LIMIT ?", (shop_id, limit)).fetchall()
        else:
            rows = c.execute("SELECT * FROM title_opt_log ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
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


def product_real_roi(period: str = None) -> dict:
    """逐商品真实 ROI：推广花费 × 订单成交打通。

    按 (shop_id, platform_product_id) 聚合推广数据，关联 orders 表真实成交额，
    对比「推广平台口径 ROI」与「真实订单口径 ROI」，识别纯烧钱商品。
    周期对齐：orders 按 pay_time 落在 promotions.period 对应区间内聚合（若 period 为空则全量）。
    """
    cost_map = {}
    try:
        import data as _data
        for p in _data.load_products():
            pid = p.get("platform_product_id")
            if pid:
                be_roi = None
                try:
                    _pr = _data.Product.from_dict(p)
                    _be = _pr.break_even_roi
                    be_roi = _be if _be != float("inf") else None
                except Exception:
                    pass
                cost_map[pid] = {
                    "cost": p.get("cost") or 0.0,
                    "shipping": p.get("shipping") or 0.0,
                    "break_even_roi": be_roi,
                }
    except Exception:
        pass
    with closing(_conn()) as c:
        # 1. 聚合推广数据（按商品），带 period 范围
        where = ""
        args = []
        if period:
            where = "WHERE period = ?"
            args = [period]
        promo_rows = c.execute(
            f"SELECT p.shop_id, sh.name AS shop_name, p.platform_product_id, "
            f"MAX(p.product_name) AS product_name, "
            f"GROUP_CONCAT(DISTINCT p.period) AS periods, "
            f"ROUND(SUM(p.total_spend),2) AS total_spend, ROUND(SUM(p.deal_amount),2) AS deal_amount, "
            f"SUM(p.net_deal_count) AS promo_deals, SUM(p.impressions) AS impressions, SUM(p.clicks) AS clicks "
            f"FROM promotions p LEFT JOIN shops sh ON sh.id = p.shop_id "
            f"{where} WHERE p.platform_product_id != '' "
            f"GROUP BY p.shop_id, p.platform_product_id "
            f"ORDER BY total_spend DESC",
            args,
        ).fetchall()
        result = []
        for r in promo_rows:
            shop_id = r["shop_id"]
            pid = r["platform_product_id"]
            total_spend = r["total_spend"] or 0.0
            deal_amount = r["deal_amount"] or 0.0
            # 2. 关联 orders：按 pay_time 落在该商品的推广周期区间内聚合
            periods = (r["periods"] or "").split(",")
            real_amount = 0.0
            real_count = 0
            real_qty = 0
            for per in periods:
                if "~" not in per:
                    continue
                start, end = per.split("~", 1)
                o = c.execute(
                    "SELECT COALESCE(SUM(seller_amount),0) AS amt, COUNT(*) AS cnt, COALESCE(SUM(quantity),0) AS qty FROM orders "
                    "WHERE shop_id=? AND platform_product_id=? AND pay_time >= ? AND pay_time < ?",
                    (shop_id, pid, start + " 00:00:00", end + " 23:59:59"),
                ).fetchone()
                real_amount += o["amt"] or 0.0
                real_count += o["cnt"] or 0
                real_qty += o["qty"] or 0
            promo_roi = round(deal_amount / total_spend, 2) if total_spend else None
            real_roi = round(real_amount / total_spend, 2) if total_spend else None
            # 关联成本算真实利润：利润 = 实收 - 商品成本×件数 - 运费×单数 - 推广费
            cinfo = cost_map.get(pid)
            profit = None
            profit_margin = None
            cost_unit = None
            ship_unit = None
            action_level = None
            action_text = ""
            if cinfo:
                cost_unit = cinfo["cost"]
                ship_unit = cinfo["shipping"]
                profit = round(real_amount - cost_unit * real_qty - ship_unit * real_count - total_spend, 2)
                profit_margin = round(profit / real_amount, 4) if real_amount else None
                be_roi = cinfo.get("break_even_roi")
                if profit < 0:
                    action_level = "red"
                    action_text = "停推：亏钱，暂停推广并查成本/定价"
                elif profit_margin is not None and profit_margin < 0.1:
                    action_level = "yellow"
                    action_text = "拖价：利润薄，降低出价或优化转化"
                elif be_roi is not None and real_roi is not None and real_roi < be_roi:
                    action_level = "yellow"
                    action_text = f"优化：ROI {real_roi} 低于保本 {be_roi}，先优化再放量"
                else:
                    action_level = "green"
                    action_text = "加预算：盈利且ROI达标，可递增放量"
            result.append({
                "shop_id": shop_id, "shop_name": r["shop_name"], "platform_product_id": pid,
                "product_name": r["product_name"] or "", "periods": r["periods"] or "",
                "total_spend": total_spend, "deal_amount": deal_amount, "promo_roi": promo_roi,
                "real_amount": round(real_amount, 2), "real_count": real_count, "real_roi": real_roi,
                "real_qty": real_qty, "cost": cost_unit, "shipping": ship_unit,
                "profit": profit, "profit_margin": profit_margin,
                "action_level": action_level, "action_text": action_text,
                "promo_deals": r["promo_deals"] or 0, "impressions": r["impressions"] or 0,
                "clicks": r["clicks"] or 0,
            })
        # 汇总
        total_spend = sum(x["total_spend"] for x in result)
        real_amount = sum(x["real_amount"] for x in result)
        total_profit = sum(x["profit"] for x in result if x["profit"] is not None)
        return {
            "items": result,
            "summary": {
                "count": len(result),
                "total_spend": round(total_spend, 2),
                "real_amount": round(real_amount, 2),
                "real_roi": round(real_amount / total_spend, 2) if total_spend else None,
                "total_profit": round(total_profit, 2),
            },
        }


def _time_tier(count: int, avg: float) -> dict:
    """按小时订单数相对均值分档，给出分时折扣建议。"""
    if avg <= 0:
        return {"tier": "normal", "discount": 100, "label": "常规", "advice": "正常投放"}
    ratio = count / avg
    if ratio >= 1.4:
        return {"tier": "gold", "discount": 150, "label": "黄金", "advice": "加预算抢量"}
    if ratio >= 1.0:
        return {"tier": "good", "discount": 120, "label": "较好", "advice": "略加预算"}
    if ratio >= 0.6:
        return {"tier": "normal", "discount": 100, "label": "常规", "advice": "正常投放"}
    if ratio >= 0.3:
        return {"tier": "low", "discount": 60, "label": "低谷", "advice": "降预算"}
    return {"tier": "freeze", "discount": 30, "label": "冰点", "advice": "暂停投放"}


def order_time_analysis(shop_id: int = None, days: int = None) -> dict:
    """订单时间维度分析 + 分时投放建议（动态演算）。

    基于订单 pay_time 的小时/星期分布，实时计算分时投放方案。
    新订单导入后重新调用即自动更新（动态演算）。
    仅统计有效成交（排除退款/取消/关闭/待付款/待发货）。
    """
    VALID = ("((status != '' AND status NOT LIKE '%退款%' AND status NOT LIKE '%取消%' "
             "AND status NOT LIKE '%关闭%' AND status NOT IN ('待付款','待发货')) "
             "OR (status = '' AND tracking_no != ''))")
    with closing(_conn()) as c:
        cond = f"WHERE length(pay_time) >= 13 AND {VALID}"
        args = []
        if shop_id:
            cond += " AND shop_id = ?"
            args.append(shop_id)
        if days:
            cond += " AND date(pay_time) >= date('now', ?)"
            args.append(f"-{days} days")

        hour_rows = c.execute(
            f"SELECT substr(pay_time,12,2) AS h, COUNT(*) AS n, COALESCE(SUM(seller_amount),0) AS gmv "
            f"FROM orders {cond} GROUP BY h", args).fetchall()
        week_rows = c.execute(
            f"SELECT CAST(strftime('%w', substr(pay_time,1,10)) AS INT) AS w, COUNT(*) AS n, COALESCE(SUM(seller_amount),0) AS gmv "
            f"FROM orders {cond} GROUP BY w", args).fetchall()

        hour_map = {int(r["h"]): r for r in hour_rows}
        total = sum(r["n"] for r in hour_rows)
        avg = total / 24.0 if total else 0.0
        hours = []
        for h in range(24):
            r = hour_map.get(h)
            n = r["n"] if r else 0
            gmv = r["gmv"] if r else 0.0
            tier = _time_tier(n, avg)
            hours.append({"hour": h, "count": n, "gmv": round(gmv, 2), **tier})

        return {
            "hours": hours,
            "weeks": [{"week": r["w"], "count": r["n"], "gmv": round(r["gmv"], 2)} for r in week_rows],
            "summary": {
                "total_orders": total,
                "avg_per_hour": round(avg, 1),
                "peak_hours": [h["hour"] for h in hours if h["tier"] in ("gold", "good")],
                "freeze_hours": [h["hour"] for h in hours if h["tier"] == "freeze"],
            },
        }


def weekday_time_vote(shop_id: int = None, days: int = None) -> dict:
    """按星期分组，多指标投票选出每天最佳投放 top3（动态演算）。

    3 个投票维度（评委）：订单数(0.5) / GMV成交额(0.3) / 客单价(0.2)。
    每个维度 min-max 归一化后加权求和，每个星期取 top3 时段。
    新订单导入后重新调用即自动更新。
    """
    VALID = ("((status != '' AND status NOT LIKE '%退款%' AND status NOT LIKE '%取消%' "
             "AND status NOT LIKE '%关闭%' AND status NOT IN ('待付款','待发货')) "
             "OR (status = '' AND tracking_no != ''))")
    WK_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
    WEIGHTS = {"count": 0.5, "gmv": 0.3, "atv": 0.2}
    with closing(_conn()) as c:
        cond = f"WHERE length(pay_time) >= 13 AND {VALID}"
        args = []
        if shop_id:
            cond += " AND shop_id = ?"
            args.append(shop_id)
        if days:
            cond += " AND date(pay_time) >= date('now', ?)"
            args.append(f"-{days} days")

        rows = c.execute(
            f"SELECT CAST(strftime('%w', substr(pay_time,1,10)) AS INT) AS w, "
            f"substr(pay_time,12,2) AS h, COUNT(*) AS n, "
            f"COALESCE(SUM(seller_amount),0) AS gmv "
            f"FROM orders {cond} GROUP BY w, h", args).fetchall()

        by_week = {}
        for r in rows:
            w = r["w"] if r["w"] is not None else 0
            by_week.setdefault(w, []).append(r)

        def _norm(vals):
            mx, mn = max(vals), min(vals)
            if mx == mn:
                return [0.5] * len(vals)
            return [(v - mn) / (mx - mn) for v in vals]

        items = []
        for w in range(7):
            hour_map = {int(r["h"]): r for r in by_week.get(w, [])}
            data = []
            for h in range(24):
                r = hour_map.get(h)
                n = r["n"] if r else 0
                gmv = r["gmv"] if r else 0.0
                atv = round(gmv / n, 2) if n else 0.0
                data.append({"hour": h, "count": n, "gmv": round(gmv, 2), "atv": atv})

            n_counts = _norm([d["count"] for d in data])
            n_gmvs = _norm([d["gmv"] for d in data])
            n_atvs = _norm([d["atv"] for d in data])
            for i, d in enumerate(data):
                d["score"] = round(
                    WEIGHTS["count"] * n_counts[i]
                    + WEIGHTS["gmv"] * n_gmvs[i]
                    + WEIGHTS["atv"] * n_atvs[i], 4)

            ranked = sorted(data, key=lambda x: -x["score"])
            top3 = [{"hour": d["hour"], "count": d["count"], "gmv": d["gmv"],
                     "atv": d["atv"], "score": d["score"], "rank": i + 1}
                    for i, d in enumerate(ranked[:3])]
            items.append({
                "weekday": w,
                "weekday_name": WK_NAMES[w],
                "orders": sum(d["count"] for d in data),
                "top3": top3,
            })

        return {"items": items, "weights": WEIGHTS}


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


# ----------------------------- 任务调度中心 -----------------------------

_SEED_TASKS = [
    # (task_key, name, category, shop_id, cron_expr, schedule_desc, cron_job_id, script, enabled)
    # 订单类
    ("order_export_shop3", "如若月下·月度订单导出", "订单", 3, "0 18 2 * *", "每月 2 日 18:00", "e446584ef4b9", "pdd_monthly_export.py 3", 1),
    ("order_export_shop5", "嘉裕工艺品·月度订单导出", "订单", 5, "10 18 2 * *", "每月 2 日 18:10", "9c397fff3e20", "pdd_monthly_export.py 5", 1),
    ("order_export_shop1", "闲时来工艺·月度订单导出", "订单", 1, "20 18 2 * *", "每月 2 日 18:20", "a958a9a91ff1", "pdd_monthly_export.py 1", 1),
    ("order_export_shop6", "欧世艺旗舰店·月度订单导出", "订单", 6, "30 18 2 * *", "每月 2 日 18:30", "84a8de47609c", "pdd_monthly_export.py 6", 1),
    # 推广类
    ("promo_daily", "推广数据录入（近7日）", "推广", None, "0 9 * * *", "每天 09:00", "4c9b77f4e820", "pdd_weekly_promo.py", 1),
    ("promo_track", "推广跟踪落地", "推广", None, "0 12,20 * * *", "每天 12:00 / 20:00", "68a919222821", "pdd_promotion_track.py", 1),
    ("promo_audit", "运营主管每日审计", "推广", None, "0 9 * * *", "每天 09:00", "87332e04812d", "pdd 审计", 1),
    # 商品类
    ("goods_effect", "商品访问明细采集", "商品", None, "0 23 * * *", "每天 23:00", "51ef27356897", "collect_goods_effect.py", 1),
    ("title_opt_shop5", "标题优化批量·嘉裕", "商品", 5, "0 9 * * *", "每天 09:00", "466412194529", "pdd_title_batch.py 40 --shop 5", 1),
    ("title_opt_shop1", "标题优化批量·闲时来", "商品", 1, "10 9 * * *", "每天 09:10", "d843898d279e", "pdd_title_batch.py --shop 1", 1),
    ("title_opt_shop6", "标题优化批量·欧世艺", "商品", 6, "20 9 * * *", "每天 09:20", "fa056bcee006", "pdd_title_batch.py --shop 6", 1),
    ("title_opt_shop3", "标题优化批量·如若月下", "商品", 3, "30 9 * * *", "每天 09:30", "3d797b863695", "pdd_title_batch.py --shop 3", 1),
    ("title_review", "标题优化复盘", "商品", None, "0 8 * * 1", "每周一 08:00", "4d6d161d6fe3", "pdd_title_review.py --apply", 1),
    # AI老板
    ("aiboss_daily", "AI老板每日工作流·中午班", "AI老板", 5, "0 12 * * *", "每天 12:00", "1efd70d41ac5", "ai_boss_daily.py", 1),
    ("aiboss_daily_eve", "AI老板每日工作流·晚班", "AI老板", 5, "30 19 * * *", "每天 19:30", "83f2cdcb6532", "ai_boss_daily.py", 1),
    # 竞品/评价（待建设）
    ("competitor_monitor", "竞品监控", "竞品", None, "", "待建设", "", "", 0),
    ("review_monitor", "商品评价监控", "评价", None, "0 10 * * *", "每天 10:00", "901cd9406962", "collect_reviews.py", 1),
]


def seed_scheduled_tasks() -> int:
    """幂等 seed 定时采集任务清单（与 Hermes cron 对应的任务登记）。返回新增数。"""
    with closing(_conn()) as c:
        n = 0
        for t in _SEED_TASKS:
            task_key, name, cat, shop_id, cron, desc, job_id, script, enabled = t
            cur = c.execute("SELECT id FROM scheduled_tasks WHERE task_key=?", (task_key,)).fetchone()
            if cur:
                c.execute(
                    "UPDATE scheduled_tasks SET name=?, category=?, shop_id=?, cron_expr=?, schedule_desc=?, cron_job_id=?, script=?, enabled=? WHERE task_key=?",
                    (name, cat, shop_id, cron, desc, job_id, script, enabled, task_key),
                )
            else:
                c.execute(
                    "INSERT INTO scheduled_tasks(task_key, name, category, shop_id, cron_expr, schedule_desc, cron_job_id, script, enabled, note) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (task_key, name, cat, shop_id, cron, desc, job_id, script, enabled, ""),
                )
                n += 1
        c.commit()
        return n


def list_scheduled_tasks() -> list[dict]:
    """列出任务清单，附带每个任务最近一次运行状态。"""
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT t.*, sh.name AS shop_name, "
            "(SELECT status FROM task_runs r WHERE r.task_key=t.task_key ORDER BY r.id DESC LIMIT 1) AS last_status, "
            "(SELECT result FROM task_runs r WHERE r.task_key=t.task_key ORDER BY r.id DESC LIMIT 1) AS last_result, "
            "(SELECT finished_at FROM task_runs r WHERE r.task_key=t.task_key ORDER BY r.id DESC LIMIT 1) AS last_run_at, "
            "(SELECT COUNT(*) FROM task_runs r WHERE r.task_key=t.task_key) AS run_count "
            "FROM scheduled_tasks t LEFT JOIN shops sh ON sh.id=t.shop_id "
            "ORDER BY CASE t.category WHEN '订单' THEN 1 WHEN '推广' THEN 2 WHEN '商品' THEN 3 WHEN '竞品' THEN 4 WHEN '评价' THEN 5 ELSE 9 END, t.id"
        ).fetchall()
        return [dict(r) for r in rows]


def toggle_scheduled_task(task_key: str, enabled: int) -> bool:
    """切换任务启用状态。"""
    with closing(_conn()) as c:
        c.execute("UPDATE scheduled_tasks SET enabled=? WHERE task_key=?", (1 if enabled else 0, task_key))
        c.commit()
        return c.execute("SELECT changes()").fetchone()[0] > 0


def list_task_runs(task_key: str = None, limit: int = 100) -> list[dict]:
    """列出运行日志（倒序，可按 task_key 过滤）。"""
    with closing(_conn()) as c:
        if task_key:
            rows = c.execute("SELECT * FROM task_runs WHERE task_key=? ORDER BY id DESC LIMIT ?", (task_key, limit)).fetchall()
        else:
            rows = c.execute("SELECT * FROM task_runs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]


def log_task_run(task_key: str, status: str, result: str = "", started_at: str = "", finished_at: str = "") -> bool:
    """记录一次任务运行。"""
    with closing(_conn()) as c:
        c.execute(
            "INSERT INTO task_runs(task_key, status, result, started_at, finished_at) VALUES(?,?,?,?,?)",
            (task_key, status, result, started_at, finished_at),
        )
        c.commit()
        return True


# ----------------------------- 商品评价监控 -----------------------------

def save_reviews(shop_id: int, records: list[dict]) -> int:
    """批量 upsert 商品评价（拼多多评价管理 saturn/reviews/list）。

    records 字段：review_id, goods_id, order_id, order_sn, score, desc_score,
    logistics_score, service_score, comment, append_num, goods_name, specs,
    keywords, pictures, video, thumb_url, avatar, reply, reply_time, anonymous,
    status, create_time。
    """
    with closing(_conn()) as c:
        n = 0
        for r in records:
            c.execute(
                "INSERT INTO reviews(shop_id, review_id, goods_id, order_id, order_sn, score, "
                "desc_score, logistics_score, service_score, comment, append_num, goods_name, "
                "specs, keywords, pictures, video, thumb_url, avatar, reply, reply_time, "
                "anonymous, status, create_time) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(review_id) DO UPDATE SET "
                "shop_id=excluded.shop_id, goods_id=excluded.goods_id, order_id=excluded.order_id, "
                "order_sn=excluded.order_sn, score=excluded.score, desc_score=excluded.desc_score, "
                "logistics_score=excluded.logistics_score, service_score=excluded.service_score, "
                "comment=excluded.comment, append_num=excluded.append_num, goods_name=excluded.goods_name, "
                "specs=excluded.specs, keywords=excluded.keywords, pictures=excluded.pictures, "
                "video=excluded.video, thumb_url=excluded.thumb_url, avatar=excluded.avatar, "
                "reply=excluded.reply, reply_time=excluded.reply_time, anonymous=excluded.anonymous, "
                "status=excluded.status, create_time=excluded.create_time",
                (shop_id, r.get("review_id", ""), r.get("goods_id", ""), r.get("order_id", ""),
                 r.get("order_sn", ""), r.get("score", 0), r.get("desc_score", 0),
                 r.get("logistics_score", 0), r.get("service_score", 0), r.get("comment", ""),
                 r.get("append_num", 0), r.get("goods_name", ""), r.get("specs", ""),
                 r.get("keywords", ""), r.get("pictures", ""), r.get("video", ""),
                 r.get("thumb_url", ""), r.get("avatar", ""), r.get("reply", ""),
                 r.get("reply_time", 0), r.get("anonymous", 0), r.get("status", 0),
                 r.get("create_time", 0)),
            )
            n += 1
        c.commit()
        return n


def list_reviews(shop_id: int = None, goods_id: str = None, star: int = None,
                 has_picture: bool = False, has_video: bool = False,
                 keyword: str = "", limit: int = 200, offset: int = 0) -> list[dict]:
    """查询评价（倒序），支持店铺/商品/星级/有图/有视频/关键词筛选。"""
    with closing(_conn()) as c:
        where = []
        args = []
        if shop_id:
            where.append("r.shop_id=?")
            args.append(shop_id)
        if goods_id:
            where.append("r.goods_id=?")
            args.append(goods_id)
        if star:
            where.append("r.desc_score=?")
            args.append(star)
        if has_picture:
            where.append("r.pictures != ''")
        if has_video:
            where.append("r.video != ''")
        if keyword:
            where.append("(r.comment LIKE ? OR r.goods_name LIKE ? OR r.order_sn LIKE ?)")
            args += [f"%{keyword}%", f"%{keyword}%", f"%{keyword}%"]
        sql = "SELECT r.*, s.name AS shop_name FROM reviews r LEFT JOIN shops s ON s.id=r.shop_id"
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY r.create_time DESC LIMIT ? OFFSET ?"
        args += [limit, offset]
        rows = c.execute(sql, args).fetchall()
        return [dict(r) for r in rows]


def review_stats() -> dict:
    """评价概览统计：各店评价数、带图/带视频数、差评数、近7天新增。"""
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT r.shop_id, s.name AS shop_name, COUNT(*) AS total, "
            "SUM(CASE WHEN r.pictures != '' THEN 1 ELSE 0 END) AS with_pic, "
            "SUM(CASE WHEN r.video != '' THEN 1 ELSE 0 END) AS with_video, "
            "SUM(CASE WHEN r.desc_score <= 3 THEN 1 ELSE 0 END) AS neg "
            "FROM reviews r LEFT JOIN shops s ON s.id=r.shop_id "
            "GROUP BY r.shop_id ORDER BY r.shop_id"
        ).fetchall()
        shops = [dict(r) for r in rows]
        total = c.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]
        neg_total = c.execute("SELECT COUNT(*) FROM reviews WHERE desc_score <= 3").fetchone()[0]
        week_ago = int(time.time()) - 7 * 86400
        week_new = c.execute("SELECT COUNT(*) FROM reviews WHERE create_time >= ?", (week_ago,)).fetchone()[0]
        return {"total": total, "neg_total": neg_total, "week_new": week_new, "shops": shops}


# ----------------------------- 评论分析报表 -----------------------------

_POS_KEYWORDS = {
    "实用性": ["方便", "好用", "实用", "便捷", "顺手"],
    "承重/牢固": ["承重", "承载", "结实", "牢固", "挂", "重"],
    "质量/做工": ["质量", "做工", "耐用", "材质", "坚硬", "扎实"],
    "安装体验": ["安装", "免打孔", "免钉", "简单", "贴合"],
    "性价比": ["便宜", "实惠", "性价比", "超值", "值得", "划算"],
    "外观设计": ["漂亮", "好看", "美观", "大气", "颜值", "精致"],
    "物流服务": ["物流", "快递", "发货", "送货"],
}
_NEG_KEYWORDS = {
    "做工/质量差": ["粗糙", "太细", "质感", "质量差", "做工差", "劣质", "不值"],
    "不牢固/承重": ["不牢固", "不结实", "大门不能", "不能放", "松", "掉"],
    "物流问题": ["没送", "地址", "慢", "破损", "压坏", "漏发"],
    "尺寸/规格不符": ["尺寸", "规格", "不符", "短"],
}
_PRAISE_WORDS = ["质量好", "漂亮", "方便", "喜欢", "满意", "推荐", "不错", "结实", "好用", "超级"]


def _review_has_text(r: dict) -> bool:
    cm = (r.get("comment") or "").strip()
    if not cm:
        return False
    if "该用户觉得商品很好" in cm or "未填写文字评价" in cm:
        return False
    return True


def review_analysis() -> dict:
    """评论分析报表（结构化数据），供前端「评论分析」区块渲染。"""
    with closing(_conn()) as c:
        rows = [dict(r) for r in c.execute(
            "SELECT r.*, s.name AS shop_name FROM reviews r LEFT JOIN shops s ON s.id=r.shop_id")]

    total = len(rows)
    star_dist = {}
    for r in rows:
        star_dist[r["desc_score"]] = star_dist.get(r["desc_score"], 0) + 1

    good = sum(1 for r in rows if r["desc_score"] >= 4)
    neg_rows = [r for r in rows if r["desc_score"] <= 3]
    neg = len(neg_rows)

    # 各店
    shops_map = {}
    for r in rows:
        sid = r["shop_id"]
        s = shops_map.setdefault(sid, {"shop_id": sid, "name": r["shop_name"], "n": 0,
                                       "good": 0, "neg": 0, "pic": 0, "vid": 0, "replied": 0})
        s["n"] += 1
        if r["desc_score"] >= 4:
            s["good"] += 1
        if r["desc_score"] <= 3:
            s["neg"] += 1
        if (r.get("pictures") or "").strip():
            s["pic"] += 1
        if (r.get("video") or "").strip():
            s["vid"] += 1
        if (r.get("reply") or "").strip():
            s["replied"] += 1
    shops = sorted(shops_map.values(), key=lambda x: -x["n"])

    # 差评归类
    neg_text = [r for r in neg_rows if _review_has_text(r)]
    neg_cats = {}
    contradict = []
    neg_items = []
    for r in neg_text:
        cm = r.get("comment") or ""
        hit = False
        for cat, words in _NEG_KEYWORDS.items():
            if any(w in cm for w in words):
                neg_cats[cat] = neg_cats.get(cat, 0) + 1
                hit = True
                break
        if not hit and any(w in cm for w in _PRAISE_WORDS):
            contradict.append(r)
        neg_items.append({
            "star": r["desc_score"], "create_time": r.get("create_time", 0),
            "shop_name": r.get("shop_name", ""), "comment": cm,
            "goods_name": (r.get("goods_name") or "")[:40], "goods_id": r.get("goods_id", ""),
        })
    neg_items.sort(key=lambda x: -(x["create_time"] or 0))

    # 好评关键词
    pos_cats = {}
    for r in rows:
        if r["desc_score"] >= 4 and _review_has_text(r):
            cm = r.get("comment") or ""
            for cat, words in _POS_KEYWORDS.items():
                if any(w in cm for w in words):
                    pos_cats[cat] = pos_cats.get(cat, 0) + 1
                    break
    pos_list = sorted([{"dim": k, "count": v} for k, v in pos_cats.items()], key=lambda x: -x["count"])

    # 差评集中商品
    neg_goods_map = {}
    for r in neg_rows:
        gid = r["goods_id"]
        g = neg_goods_map.setdefault(gid, {"goods_id": gid, "goods_name": (r.get("goods_name") or "")[:36], "count": 0})
        g["count"] += 1
    neg_goods = sorted(neg_goods_map.values(), key=lambda x: -x["count"])[:10]

    # 可操作建议
    suggestions = []
    if neg > 0:
        replied = sum(1 for r in neg_rows if (r.get("reply") or "").strip())
        if replied == 0:
            suggestions.append(f"差评 {neg} 条全部未回复——立即回复，尤其 {len(neg_text)} 条有文字的差评，避免拖 DSR 和转化。")
    if neg_goods and neg_goods[0]["count"] >= 3:
        g = neg_goods[0]
        suggestions.append(f"差评集中在商品 {g['goods_id']}（{g['count']} 条）——核查详情页是否标注适用门型/承重，避免买家预期错位。")
    if pos_list:
        top2 = [p["dim"] for p in pos_list[:2]]
        suggestions.append(f"好评核心卖点「{'、'.join(top2)}」——标题和详情页前置强化，并如实标注承重上限。")

    return {
        "total": total,
        "good_rate": round(good / total * 100, 1) if total else 0,
        "star_dist": star_dist,
        "shops": shops,
        "neg": {
            "total": neg,
            "with_text": len(neg_text),
            "no_text": neg - len(neg_text),
            "contradict": len(contradict),
            "cats": [{"type": k, "count": v} for k, v in sorted(neg_cats.items(), key=lambda x: -x[1])],
            "items": neg_items,
        },
        "pos_keywords": pos_list,
        "neg_goods": neg_goods,
        "suggestions": suggestions,
    }


# ----------------------------- 打单登记 -----------------------------

PACK_ENTRIES = {
    "pdd_jiayu": "拼多多·嘉裕工艺品",
    "pdd_xianshi": "拼多多·闲时来工艺",
    "taobao_jiayu": "淘宝·嘉裕工艺品",
    "doudian": "抖店",
}
PACK_SOURCES = {
    "platform": "平台订单",
    "alijiayu": "阿里.嘉裕工艺品有限公司",
    "sandan": "散单",
}


def save_pack_record(entry: str, source: str, count: int, remark: str = "", record_date: str = None, scatter_shop: str = "") -> dict:
    """新增一条打单登记。record_date 缺省今天。scatter_shop 为散单店铺名（source=sandan 时用）。"""
    if record_date is None:
        record_date = time.strftime("%Y-%m-%d")
    with closing(_conn()) as c:
        cur = c.execute(
            "INSERT INTO pack_records(record_date, entry, source, count, remark, scatter_shop) VALUES(?,?,?,?,?,?)",
            (record_date, entry, source, int(count), remark or "", scatter_shop or ""),
        )
        c.commit()
        return {
            "id": cur.lastrowid,
            "record_date": record_date,
            "entry": entry,
            "source": source,
            "count": int(count),
            "remark": remark or "",
            "scatter_shop": scatter_shop or "",
        }


def list_pack_records(record_date: str = None, limit: int = 500) -> list[dict]:
    """查询打单记录（指定日期查当天，不传查全部，倒序）。"""
    with closing(_conn()) as c:
        if record_date:
            rows = c.execute(
                "SELECT * FROM pack_records WHERE record_date=? ORDER BY id DESC LIMIT ?",
                (record_date, limit),
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT * FROM pack_records ORDER BY record_date DESC, id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]


def pack_summary(record_date: str = None) -> dict:
    """某天打单汇总：各入口 × 各来源的数量矩阵 + 行/列/总计。"""
    if record_date is None:
        record_date = time.strftime("%Y-%m-%d")
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT entry, source, SUM(count) AS total FROM pack_records "
            "WHERE record_date=? GROUP BY entry, source",
            (record_date,),
        ).fetchall()
    agg = {}
    for r in rows:
        agg.setdefault(r["entry"], {})[r["source"]] = r["total"] or 0
    matrix = {}
    entry_totals = {}
    source_totals = {sk: 0 for sk in PACK_SOURCES}
    grand = 0
    for ek in PACK_ENTRIES:
        row = {}
        row_total = 0
        for sk in PACK_SOURCES:
            v = agg.get(ek, {}).get(sk, 0)
            row[sk] = v
            row_total += v
            source_totals[sk] += v
        row["total"] = row_total
        matrix[ek] = row
        entry_totals[ek] = row_total
        grand += row_total
    return {
        "record_date": record_date,
        "entries": PACK_ENTRIES,
        "sources": PACK_SOURCES,
        "matrix": matrix,
        "entry_totals": entry_totals,
        "source_totals": source_totals,
        "grand": grand,
    }


def delete_pack_record(rid: int) -> bool:
    """删除一条打单记录（打错撤销）。"""
    with closing(_conn()) as c:
        cur = c.execute("DELETE FROM pack_records WHERE id=?", (rid,))
        c.commit()
        return cur.rowcount > 0


def update_pack_record(rid: int, entry: str = None, source: str = None, count=None, remark: str = None, record_date: str = None) -> bool:
    """修改一条打单记录（只更新传入的字段，未传保持不变）。"""
    fields, vals = [], []
    if entry is not None:
        fields.append("entry=?"); vals.append(entry)
    if source is not None:
        fields.append("source=?"); vals.append(source)
    if count is not None:
        fields.append("count=?"); vals.append(int(count))
    if remark is not None:
        fields.append("remark=?"); vals.append(remark or "")
    if record_date is not None:
        fields.append("record_date=?"); vals.append(record_date)
    if not fields:
        return False
    vals.append(rid)
    with closing(_conn()) as c:
        cur = c.execute(f"UPDATE pack_records SET {', '.join(fields)} WHERE id=?", vals)
        c.commit()
        return cur.rowcount > 0


def list_scatter_shops() -> list[dict]:
    """列出散单店铺（下拉框选项）。"""
    with closing(_conn()) as c:
        rows = c.execute("SELECT * FROM pack_scatter_shops ORDER BY id ASC").fetchall()
        return [dict(r) for r in rows]


def add_scatter_shop(name: str) -> dict:
    """新增散单店铺（重名则返回已有记录）。"""
    name = (name or "").strip()
    if not name:
        return {}
    with closing(_conn()) as c:
        try:
            cur = c.execute("INSERT INTO pack_scatter_shops(name) VALUES(?)", (name,))
            c.commit()
            return {"id": cur.lastrowid, "name": name}
        except sqlite3.IntegrityError:
            row = c.execute("SELECT * FROM pack_scatter_shops WHERE name=?", (name,)).fetchone()
            return dict(row) if row else {"name": name}


def delete_scatter_shop(sid: int) -> bool:
    """删除散单店铺。"""
    with closing(_conn()) as c:
        cur = c.execute("DELETE FROM pack_scatter_shops WHERE id=?", (sid,))
        c.commit()
        return cur.rowcount > 0


def pack_monthly_summary(entry: str = None, ym: str = None) -> dict:
    """按月 × 平台 汇总打单数。entry=平台入口(可选)，ym=YYYY-MM(可选)。"""
    sql = "SELECT substr(record_date,1,7) AS ym, entry, SUM(count) AS total FROM pack_records"
    where, args = [], []
    if entry:
        where.append("entry=?"); args.append(entry)
    if ym:
        where.append("substr(record_date,1,7)=?"); args.append(ym)
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " GROUP BY ym, entry ORDER BY ym DESC, entry ASC"
    with closing(_conn()) as c:
        rows = [dict(r) for r in c.execute(sql, args).fetchall()]
        months = [r["ym"] for r in c.execute(
            "SELECT DISTINCT substr(record_date,1,7) AS ym FROM pack_records ORDER BY ym DESC"
        ).fetchall()]
    total = sum(r["total"] or 0 for r in rows)
    return {"months": months, "rows": rows, "total": total}


# ----------------------------- 三方比对（打单 / 订单 / 运费） -----------------------------

ENTRY_NAMES = {
    "pdd_jiayu": "拼多多·嘉裕",
    "pdd_xianshi": "拼多多·闲时来",
    "taobao_jiayu": "淘宝·嘉裕",
    "doudian": "抖店",
}


def list_pack_mapping() -> list[dict]:
    """列出打单入口映射（含店铺名解析）。"""
    with closing(_conn()) as c:
        rows = [dict(r) for r in c.execute("SELECT * FROM pack_entry_mapping ORDER BY id")]
        shop_names = {r["id"]: r["name"] for r in c.execute("SELECT id, name FROM shops")}
    for m in rows:
        sids = [int(x) for x in (m["shop_ids"] or "").split(",") if x.strip().isdigit()]
        m["shop_names"] = "、".join(shop_names[sid] for sid in sids if sid in shop_names)
        m["entry_name"] = ENTRY_NAMES.get(m["entry"], m["entry"])
    return rows


def save_pack_mapping(entry: str, shop_ids: str = "", freight_account: str = "") -> dict:
    """保存/更新打单入口映射。"""
    with closing(_conn()) as c:
        c.execute(
            "INSERT INTO pack_entry_mapping(entry, shop_ids, freight_account) VALUES(?,?,?) "
            "ON CONFLICT(entry) DO UPDATE SET shop_ids=excluded.shop_ids, freight_account=excluded.freight_account",
            (entry, shop_ids or "", freight_account or ""),
        )
        c.commit()
        row = c.execute("SELECT * FROM pack_entry_mapping WHERE entry=?", (entry,)).fetchone()
        return dict(row) if row else {}


def freight_three_way(month: str = None) -> dict:
    """三方比对：按月 × 入口，对齐 订单数 / 打单数 / 运费票数+总额。"""
    with closing(_conn()) as c:
        mappings = [dict(r) for r in c.execute("SELECT * FROM pack_entry_mapping ORDER BY id")]
        shop_names = {r["id"]: r["name"] for r in c.execute("SELECT id, name FROM shops")}

        all_months = set()
        entries = []
        for m in mappings:
            entry = m["entry"]
            shop_ids = [int(x) for x in (m["shop_ids"] or "").split(",") if x.strip().isdigit()]
            account = (m["freight_account"] or "").strip()

            order_by_ym, pack_by_ym, freight_by_ym = {}, {}, {}
            if shop_ids:
                ph = ",".join("?" * len(shop_ids))
                for r in c.execute(
                    f"SELECT substr(pay_time,1,7) ym, COUNT(*) n FROM orders "
                    f"WHERE shop_id IN ({ph}) AND pay_time LIKE '____-__%' GROUP BY ym",
                    shop_ids,
                ):
                    order_by_ym[r["ym"]] = r["n"]
            for r in c.execute(
                "SELECT substr(record_date,1,7) ym, SUM(count) n FROM pack_records WHERE entry=? GROUP BY ym",
                (entry,),
            ):
                pack_by_ym[r["ym"]] = r["n"]
            if account:
                for r in c.execute(
                    "SELECT substr(ship_date,1,7) ym, COUNT(*) n, COALESCE(SUM(freight_cost),0) fee "
                    "FROM freight WHERE account_name=? AND ship_date LIKE '____-__%' GROUP BY ym",
                    (account,),
                ):
                    freight_by_ym[r["ym"]] = (r["n"], r["fee"])

            ym_set = set(order_by_ym) | set(pack_by_ym) | set(freight_by_ym)
            all_months |= ym_set
            rows = []
            for ym in sorted(ym_set, reverse=True):
                if month and ym != month:
                    continue
                fc, ff = freight_by_ym.get(ym, (0, 0.0))
                avg = round(ff / fc, 2) if fc else None
                rows.append({
                    "ym": ym,
                    "order_count": order_by_ym.get(ym, 0),
                    "pack_count": pack_by_ym.get(ym, 0),
                    "freight_count": fc,
                    "freight_fee": round(ff, 2),
                    "avg_fee": avg,
                })

            sids = [int(x) for x in (m["shop_ids"] or "").split(",") if x.strip().isdigit()]
            entries.append({
                "entry": entry,
                "name": ENTRY_NAMES.get(entry, entry),
                "shop_ids": m["shop_ids"],
                "shop_names": "、".join(shop_names[sid] for sid in sids if sid in shop_names),
                "freight_account": account,
                "months": rows,
            })

    return {
        "mappings": mappings,
        "months": sorted(all_months, reverse=True),
        "entries": entries,
    }


# ----------------------------- 竞品监控 -----------------------------

def save_competitors(shop_id: int, platform_product_id: str, keyword: str, items: list[dict]) -> int:
    """保存一批竞品（先清掉该商品+关键词的旧记录，再插入）。

    items 每条可带 AI 精准匹配结果：{is_comp, ai_reason}。
    - is_comp=False → status='no'（AI 判定非竞品，自动排除）+ ai_status='diff'
    - is_comp=True  → status='pending'（待人工确认）+ ai_status='same'
    - 未带 is_comp  → status='pending'（AI 未判定，回退为待确认）
    """
    with closing(_conn()) as c:
        c.execute(
            "DELETE FROM competitors WHERE platform_product_id=? AND keyword=?",
            (platform_product_id, keyword),
        )
        for it in items:
            is_comp = it.get("is_comp")
            ai_reason = (it.get("ai_reason") or "").strip()
            if is_comp is False:
                status, ai_status = "no", "diff"
            elif is_comp is True:
                status, ai_status = "pending", "same"
            else:
                status, ai_status = "pending", ""
            c.execute(
                "INSERT INTO competitors(shop_id, platform_product_id, keyword, comp_title, comp_price, comp_sales, comp_img, status, ai_status, ai_reason) "
                "VALUES(?,?,?,?,?,?,?,?,?,?)",
                (shop_id, platform_product_id, keyword,
                 it.get("title") or "", it.get("price"), it.get("sales") or "", it.get("img") or "",
                 status, ai_status, ai_reason),
            )
        c.commit()
    return len(items)


def get_product_title(shop_id: int, platform_product_id: str) -> str:
    """查商品标题（竞品 AI 精准匹配的锚点用）。"""
    with closing(_conn()) as c:
        row = c.execute(
            "SELECT name FROM products WHERE shop_id=? AND platform_product_id=?",
            (shop_id, platform_product_id),
        ).fetchone()
        return row["name"] if row else ""


def list_competitors(platform_product_id: str = None, keyword: str = None) -> list[dict]:
    """查询竞品列表。"""
    with closing(_conn()) as c:
        sql = "SELECT * FROM competitors"
        where, args = [], []
        if platform_product_id:
            where.append("platform_product_id=?"); args.append(platform_product_id)
        if keyword:
            where.append("keyword=?"); args.append(keyword)
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY comp_price IS NULL, comp_price ASC, id ASC"
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def confirm_competitor(cid: int, status: str) -> bool:
    """人工确认竞品：status = ok（是竞品）/ no（排除）。"""
    with closing(_conn()) as c:
        c.execute("UPDATE competitors SET status=? WHERE id=?", (status, cid))
        c.commit()
        return c.total_changes > 0


def save_buyer_review(data: dict, source: str = "brief") -> int:
    """保存买家端提取的评论（独立表 buyer_reviews，不混 reviews）。
    同 goods_id + source 先删旧再插，保持每个商品每类采集只保留最新一次。"""
    goods_id = str(data.get("goods_id") or "").strip()
    if not goods_id:
        return 0
    with closing(_conn()) as c:
        c.execute("DELETE FROM buyer_reviews WHERE goods_id=? AND source=?", (goods_id, source))
        c.execute(
            "INSERT INTO buyer_reviews(goods_id, goods_name, total_count, tags, comments, source) "
            "VALUES(?,?,?,?,?,?)",
            (
                goods_id,
                data.get("goods_name") or "",
                int(data.get("total") or 0),
                json.dumps(data.get("tags") or [], ensure_ascii=False),
                json.dumps(data.get("comments") or [], ensure_ascii=False),
                source,
            ),
        )
        c.commit()
    return 1


def _parse_total(s) -> int:
    """'4.4万+' -> 44000, '554万' -> 5540000, '5000' -> 5000"""
    import re
    if s is None:
        return 0
    s = str(s).strip().replace("+", "").replace(",", "")
    m = re.match(r"^([\d.]+)(万)?", s)
    if not m:
        return 0
    n = float(m.group(1))
    if m.group(2):
        n *= 10000
    return int(n)


def save_buyer_review_full(data: dict) -> int:
    """保存评论列表页翻页采集的全文评论（source='full'）。"""
    goods_id = str(data.get("goods_id") or "").strip()
    if not goods_id:
        return 0
    with closing(_conn()) as c:
        c.execute("DELETE FROM buyer_reviews WHERE goods_id=? AND source='full'", (goods_id,))
        c.execute(
            "INSERT INTO buyer_reviews(goods_id, goods_name, total_count, tags, comments, source) "
            "VALUES(?,?,?,?,?,?)",
            (
                goods_id,
                "",
                _parse_total(data.get("total")),
                "[]",
                json.dumps(data.get("comments") or [], ensure_ascii=False),
                "full",
            ),
        )
        c.commit()
    return 1


def list_buyer_reviews(goods_id: str = None) -> list[dict]:
    """查询买家端评论提取记录，tags/comments 反序列化为 list。"""
    with closing(_conn()) as c:
        if goods_id:
            rows = c.execute(
                "SELECT * FROM buyer_reviews WHERE goods_id=? ORDER BY id DESC", (goods_id,)
            ).fetchall()
        else:
            rows = c.execute("SELECT * FROM buyer_reviews ORDER BY id DESC").fetchall()
        out = []
        for r in rows:
            d = dict(r)
            for k in ("tags", "comments"):
                try:
                    d[k] = json.loads(d.get(k) or "[]")
                except Exception:
                    d[k] = []
            out.append(d)
        return out


# ===================== AI老板经营台账（独立记账，不混现有系统） =====================

def list_ai_boss_items(status: str = None) -> list[dict]:
    with closing(_conn()) as c:
        if status:
            rows = c.execute("SELECT * FROM ai_boss_items WHERE status=? ORDER BY id DESC", (status,)).fetchall()
        else:
            rows = c.execute("SELECT * FROM ai_boss_items ORDER BY id DESC").fetchall()
        return [dict(r) for r in rows]


def add_ai_boss_item(title: str, source_url: str = "", cost: float = 0, sale_price: float = 0, note: str = "") -> dict:
    with closing(_conn()) as c:
        cur = c.execute(
            "INSERT INTO ai_boss_items(title, source_url, cost, sale_price, note) VALUES(?,?,?,?,?)",
            (title, source_url, cost, sale_price, note),
        )
        c.commit()
        row = c.execute("SELECT * FROM ai_boss_items WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row) if row else {}


def update_ai_boss_item(item_id: int, **fields) -> dict:
    allowed = {"title", "source_url", "cost", "sale_price", "status", "note"}
    sets, vals = [], []
    for k, v in fields.items():
        if k in allowed:
            sets.append(f"{k}=?")
            vals.append(v)
    if not sets:
        return {}
    with closing(_conn()) as c:
        c.execute(f"UPDATE ai_boss_items SET {', '.join(sets)} WHERE id=?", vals + [item_id])
        c.commit()
        row = c.execute("SELECT * FROM ai_boss_items WHERE id=?", (item_id,)).fetchone()
        return dict(row) if row else {}


def delete_ai_boss_item(item_id: int) -> int:
    with closing(_conn()) as c:
        c.execute("DELETE FROM ai_boss_items WHERE id=?", (item_id,))
        c.commit()
    return 1


def list_ai_boss_orders(status: str = None) -> list[dict]:
    with closing(_conn()) as c:
        if status:
            rows = c.execute("SELECT * FROM ai_boss_orders WHERE status=? ORDER BY id DESC", (status,)).fetchall()
        else:
            rows = c.execute("SELECT * FROM ai_boss_orders ORDER BY id DESC").fetchall()
        return [dict(r) for r in rows]


def add_ai_boss_order(item_id, title, qty=1, cost=0, sale_price=0, freight=0, note="") -> dict:
    """出单：profit 单件利润 = sale - cost - freight，由后端如实计算，禁止前端/调用方虚报。"""
    profit = round(sale_price - cost - freight, 2)
    with closing(_conn()) as c:
        cur = c.execute(
            "INSERT INTO ai_boss_orders(item_id, title, qty, cost, sale_price, freight, profit, note) "
            "VALUES(?,?,?,?,?,?,?,?)",
            (item_id, title, qty, cost, sale_price, freight, profit, note),
        )
        c.commit()
        row = c.execute("SELECT * FROM ai_boss_orders WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row) if row else {}


def fill_ai_boss_tracking(order_id: int, tracking_no: str) -> dict:
    """填单号 = 真实发货，status → shipped；利润只在 shipped 后计入汇总。"""
    with closing(_conn()) as c:
        c.execute(
            "UPDATE ai_boss_orders SET tracking_no=?, status='shipped' WHERE id=?",
            (tracking_no, order_id),
        )
        c.commit()
        row = c.execute("SELECT * FROM ai_boss_orders WHERE id=?", (order_id,)).fetchone()
        return dict(row) if row else {}


def ai_boss_summary() -> dict:
    """经营总览：利润只统计已发货(shipped)订单，从 0 起算，不虚报。"""
    with closing(_conn()) as c:
        item_count = c.execute("SELECT COUNT(*) FROM ai_boss_items").fetchone()[0]
        order_count = c.execute("SELECT COUNT(*) FROM ai_boss_orders").fetchone()[0]
        shipped_count = c.execute("SELECT COUNT(*) FROM ai_boss_orders WHERE status='shipped'").fetchone()[0]
        pending_count = c.execute("SELECT COUNT(*) FROM ai_boss_orders WHERE status='pending'").fetchone()[0]
        shipped_profit = c.execute(
            "SELECT COALESCE(SUM(profit*qty), 0) FROM ai_boss_orders WHERE status='shipped'"
        ).fetchone()[0]
        pending_profit = c.execute(
            "SELECT COALESCE(SUM(profit*qty), 0) FROM ai_boss_orders WHERE status='pending'"
        ).fetchone()[0]
        shipped_qty = c.execute(
            "SELECT COALESCE(SUM(qty), 0) FROM ai_boss_orders WHERE status='shipped'"
        ).fetchone()[0]
        return {
            "item_count": item_count,
            "order_count": order_count,
            "shipped_count": shipped_count,
            "pending_count": pending_count,
            "shipped_profit": round(shipped_profit, 2),
            "pending_profit": round(pending_profit, 2),
            "shipped_qty": shipped_qty,
        }


# ===================== AI老板数据闭环（经营数据 + 成交词 + 动作审计） =====================

def upsert_ai_boss_daily(goods_id, goods_name="", stat_date="", visitor_cnt=0, page_view_cnt=0,
                         pay_buyer_cnt=0, pay_order_cnt=0, pay_amount=0, pay_rate=0,
                         collect_cnt=0, note="") -> dict:
    """导入/更新单品日粒度经营数据（按 goods_id+stat_date 去重 upsert）。"""
    with closing(_conn()) as c:
        row = c.execute(
            "SELECT id FROM ai_boss_goods_daily WHERE goods_id=? AND stat_date=?",
            (goods_id, stat_date)).fetchone()
        if row:
            c.execute(
                "UPDATE ai_boss_goods_daily SET goods_name=?, visitor_cnt=?, page_view_cnt=?, "
                "pay_buyer_cnt=?, pay_order_cnt=?, pay_amount=?, pay_rate=?, collect_cnt=?, note=? WHERE id=?",
                (goods_name, visitor_cnt, page_view_cnt, pay_buyer_cnt, pay_order_cnt,
                 pay_amount, pay_rate, collect_cnt, note, row["id"]))
            rid = row["id"]
        else:
            cur = c.execute(
                "INSERT INTO ai_boss_goods_daily(goods_id, goods_name, stat_date, visitor_cnt, page_view_cnt, "
                "pay_buyer_cnt, pay_order_cnt, pay_amount, pay_rate, collect_cnt, note) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (goods_id, goods_name, stat_date, visitor_cnt, page_view_cnt, pay_buyer_cnt,
                 pay_order_cnt, pay_amount, pay_rate, collect_cnt, note))
            rid = cur.lastrowid
        c.commit()
        r = c.execute("SELECT * FROM ai_boss_goods_daily WHERE id=?", (rid,)).fetchone()
        return dict(r) if r else {}


def list_ai_boss_daily(goods_id=None, days=None) -> list[dict]:
    """查询经营日粒度数据。days=N 只取最近 N 天。"""
    with closing(_conn()) as c:
        q = "SELECT * FROM ai_boss_goods_daily"
        args = []
        if goods_id:
            q += " WHERE goods_id=?"
            args.append(goods_id)
        if days:
            q += (" WHERE" if " WHERE" not in q else " AND") + " stat_date >= date('now','localtime','-%d day')" % days
        q += " ORDER BY stat_date DESC, id DESC"
        return [dict(r) for r in c.execute(q, args).fetchall()]


def upsert_ai_boss_keyword(goods_id, keyword, stat_date="", pay_order_cnt=0, pay_amount=0, pay_rate=0, note="") -> dict:
    """导入成交词（按 goods_id+keyword+stat_date 去重 upsert）。"""
    with closing(_conn()) as c:
        row = c.execute(
            "SELECT id FROM ai_boss_keywords WHERE goods_id=? AND keyword=? AND stat_date=?",
            (goods_id, keyword, stat_date)).fetchone()
        if row:
            c.execute(
                "UPDATE ai_boss_keywords SET pay_order_cnt=?, pay_amount=?, pay_rate=?, note=? WHERE id=?",
                (pay_order_cnt, pay_amount, pay_rate, note, row["id"]))
            rid = row["id"]
        else:
            cur = c.execute(
                "INSERT INTO ai_boss_keywords(goods_id, keyword, stat_date, pay_order_cnt, pay_amount, pay_rate, note) "
                "VALUES(?,?,?,?,?,?,?)",
                (goods_id, keyword, stat_date, pay_order_cnt, pay_amount, pay_rate, note))
            rid = cur.lastrowid
        c.commit()
        r = c.execute("SELECT * FROM ai_boss_keywords WHERE id=?", (rid,)).fetchone()
        return dict(r) if r else {}


def list_ai_boss_keywords(goods_id=None, days=None) -> list[dict]:
    """查询成交词。days=N 只取最近 N 天。"""
    with closing(_conn()) as c:
        q = "SELECT * FROM ai_boss_keywords"
        args = []
        if goods_id:
            q += " WHERE goods_id=?"
            args.append(goods_id)
        if days:
            q += (" WHERE" if " WHERE" not in q else " AND") + " stat_date >= date('now','localtime','-%d day')" % days
        q += " ORDER BY pay_order_cnt DESC, stat_date DESC"
        return [dict(r) for r in c.execute(q, args).fetchall()]


def add_ai_boss_action(goods_id="", goods_name="", action_type="", action_detail="", trigger_rule="",
                       status="proposed", verify_status="pending", verify_detail="") -> dict:
    """记录 AI 的一次决策动作（审计追溯用）。"""
    with closing(_conn()) as c:
        cur = c.execute(
            "INSERT INTO ai_boss_actions(goods_id, goods_name, action_type, action_detail, trigger_rule, "
            "status, verify_status, verify_detail) VALUES(?,?,?,?,?,?,?,?)",
            (goods_id, goods_name, action_type, action_detail, trigger_rule, status, verify_status, verify_detail))
        c.commit()
        r = c.execute("SELECT * FROM ai_boss_actions WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(r) if r else {}


def list_ai_boss_actions(goods_id=None, limit=100) -> list[dict]:
    """查询动作审计。"""
    with closing(_conn()) as c:
        if goods_id:
            rows = c.execute("SELECT * FROM ai_boss_actions WHERE goods_id=? ORDER BY id DESC LIMIT ?",
                             (goods_id, limit)).fetchall()
        else:
            rows = c.execute("SELECT * FROM ai_boss_actions ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]


def update_ai_boss_action(action_id, **fields) -> dict:
    """更新动作审计（如验证结果、执行状态）。"""
    allow = {"status", "verify_status", "verify_detail", "action_detail"}
    sets = []
    vals = []
    for k, v in fields.items():
        if k in allow:
            sets.append(f"{k}=?")
            vals.append(v)
    if not sets:
        return {}
    with closing(_conn()) as c:
        c.execute(f"UPDATE ai_boss_actions SET {', '.join(sets)} WHERE id=?", vals + [action_id])
        c.commit()
        r = c.execute("SELECT * FROM ai_boss_actions WHERE id=?", (action_id,)).fetchone()
        return dict(r) if r else {}


def last_title_update(goods_id) -> dict:
    """查某商品最近一次已执行的标题修改动作（硬约束：每14天1次）。"""
    with closing(_conn()) as c:
        r = c.execute(
            "SELECT * FROM ai_boss_actions WHERE goods_id=? AND action_type='title_update' "
            "AND status IN ('executed','verified') ORDER BY id DESC LIMIT 1",
            (goods_id,)).fetchone()
        return dict(r) if r else {}


def add_ai_boss_research(content, work_date="") -> dict:
    """保存一份 AI 老板选品研究报告。"""
    with closing(_conn()) as c:
        cur = c.execute(
            "INSERT INTO ai_boss_research(work_date, content) VALUES(?,?)",
            (work_date, content))
        c.commit()
        r = c.execute("SELECT * FROM ai_boss_research WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(r) if r else {}


def list_ai_boss_research(limit=20) -> list[dict]:
    """查询选品研究报告（倒序）。"""
    with closing(_conn()) as c:
        rows = c.execute("SELECT * FROM ai_boss_research ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]


def find_published_goods_by_id(goods_id) -> dict:
    """从 published_goods 反查商品（goods_id → shop_id + 标题 + 进价售价）。"""
    gid = str(goods_id or "").strip()
    if not gid:
        return {}
    with closing(_conn()) as c:
        row = c.execute(
            "SELECT * FROM published_goods WHERE goods_id=? ORDER BY id DESC LIMIT 1",
            (gid,),
        ).fetchone()
    if not row:
        return {}
    r = dict(row)
    try:
        r["sku_details"] = json.loads(r.get("sku_details") or "[]")
    except Exception:
        r["sku_details"] = []
    return r


def add_ai_boss_log(**fields) -> int:
    """写一条 AI 老板工作日志（一次定时唤醒的完整过程）。"""
    allowed = {"work_date", "trigger_type", "collect_count", "goods_analyzed",
               "actions_triggered", "actions_executed", "actions_detail", "summary", "status"}
    data = {k: v for k, v in fields.items() if k in allowed}
    if not data:
        return 0
    if "actions_detail" in data and not isinstance(data["actions_detail"], str):
        data["actions_detail"] = json.dumps(data["actions_detail"], ensure_ascii=False)
    cols = ", ".join(data.keys())
    phs = ", ".join("?" for _ in data)
    with closing(_conn()) as c:
        cur = c.execute(f"INSERT INTO ai_boss_log({cols}) VALUES({phs})", list(data.values()))
        c.commit()
        return cur.lastrowid


def list_ai_boss_log(limit: int = 50) -> list[dict]:
    """列出 AI 老板工作日志（倒序）。"""
    with closing(_conn()) as c:
        rows = c.execute("SELECT * FROM ai_boss_log ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        try:
            d["actions_detail"] = json.loads(d.get("actions_detail") or "[]")
        except Exception:
            d["actions_detail"] = []
        out.append(d)
    return out



