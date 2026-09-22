# -*- coding: utf-8 -*-
"""导入拼多多商家后台导出的真实数据 → catalog.db（平台+电商层级）。

拼多多导出的 xlsx 是 inline-string 格式，openpyxl 的 read_only 模式读不全、
非 read_only 模式又慢，故直接解析 XML（0.1s 级）。

用法：
    python3 import_catalog.py           # 增量导入（幂等 upsert）
    python3 import_catalog.py --reset   # 清空后重新导入
"""
from __future__ import annotations

import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

import catalog

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXPORTS_DIR = os.path.join(BASE_DIR, "data", "exports")

PLATFORM_CODE = "pdd"
PLATFORM_NAME = "拼多多"
SHOP_NAME = "嘉裕工艺品"

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

TITLE_XLSX = os.path.join(EXPORTS_DIR, "导出商品标题_260921.xlsx")
PRICE_XLSX = os.path.join(EXPORTS_DIR, "导出商品价格_260921.xlsx")
STOCK_XLSX = os.path.join(EXPORTS_DIR, "导出商品库存_260921.xlsx")
CODE_XLSX = os.path.join(EXPORTS_DIR, "导出商品编码_260921.xlsx")
ORDERS_CSV = os.path.join(EXPORTS_DIR, "orders_export2.csv")
PROMO_XLSX = os.path.join(EXPORTS_DIR, "商品推广_汇总数据_20260801至20260831.xlsx")

# 推广表核心字段（中文列名 → 英文字段），其余 32 列存 metrics JSON
PROMO_CORE_COLS = {
    "商品ID": "platform_product_id",
    "商品名称": "product_name",
    "推广场景": "scene",
    "推广名称": "plan_name",
    "出价方式": "bid_type",
    "分组": "group_name",
    "成交花费(元)": "deal_spend",
    "交易额(元)": "deal_amount",
    "实际投产比": "actual_roi",
    "总花费(元)": "total_spend",
    "净成交笔数": "net_deal_count",
    "曝光量": "impressions",
    "点击量": "clicks",
}


def _col_idx(ref: str) -> int:
    m = re.match(r'([A-Z]+)', ref)
    n = 0
    for ch in m.group(1):
        n = n * 26 + (ord(ch) - ord('A') + 1)
    return n - 1


def read_sheet_rows(path: str) -> list[list]:
    """直接解析 xlsx 的 sheet1 XML，返回 list[list]（行 → 按列索引填值的数组）。

    兼容两种格式：sharedStrings（t='s'，如商品标题表）和 inlineStr（如价格/库存/编码表）。
    """
    with zipfile.ZipFile(path) as z:
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
            elif t == 's':  # shared string
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


def _is_num(v) -> bool:
    return str(v).strip().isdigit() if v is not None else False


def _clean(v):
    if v is None:
        return None
    s = str(v).strip()
    return s if s != "" else None


def _to_float(v):
    c = _clean(v)
    if c is None:
        return None
    try:
        return float(c)
    except Exception:
        return None


def _to_int(v):
    c = _clean(v)
    if c is None:
        return None
    try:
        return int(float(c))
    except Exception:
        return None


def import_all(reset: bool = False) -> dict:
    if reset and os.path.exists(catalog.DB_PATH):
        os.remove(catalog.DB_PATH)
    catalog.init_db()

    platform_id = catalog.upsert_platform(PLATFORM_CODE, PLATFORM_NAME)
    shop_id = catalog.upsert_shop(platform_id, SHOP_NAME)

    # ---- 解析所有数据到内存 ----
    products = {}  # platform_product_id -> {name, code}
    skus = {}      # (platform_product_id, skuid) -> sku dict

    for i, row in enumerate(read_sheet_rows(TITLE_XLSX)):
        if i == 0:
            continue
        pid = _clean(row[0])
        if not _is_num(pid):
            continue
        products[pid] = {"platform_product_id": pid, "name": _clean(row[1]) or "", "code": ""}

    for i, row in enumerate(read_sheet_rows(CODE_XLSX)):
        if i == 0:
            continue
        pid = _clean(row[0])
        code = _clean(row[2])
        if not _is_num(pid) or not code:
            continue
        if pid in products:
            products[pid]["code"] = code

    def add_sku(pid, skuid, spec_name, spec_code, dan_price, pin_price, stock):
        if not _is_num(pid) or not skuid:
            return
        key = (pid, skuid)
        if key in skus:
            # 合并：非空字段覆盖
            s = skus[key]
            if spec_name: s["spec_name"] = spec_name
            if spec_code: s["spec_code"] = spec_code
            if dan_price is not None: s["dan_price"] = dan_price
            if pin_price is not None: s["pin_price"] = pin_price
            if stock is not None: s["stock"] = stock
        else:
            skus[key] = {
                "platform_product_id": pid, "platform_sku_id": skuid,
                "spec_name": spec_name or "", "spec_code": spec_code or "",
                "dan_price": dan_price, "pin_price": pin_price, "stock": stock,
            }

    for i, row in enumerate(read_sheet_rows(PRICE_XLSX)):
        if i == 0:
            continue
        add_sku(_clean(row[0]), _clean(row[2]), _clean(row[3]), _clean(row[6]),
                _to_float(row[4]), _to_float(row[5]), None)

    for i, row in enumerate(read_sheet_rows(STOCK_XLSX)):
        if i == 0:
            continue
        add_sku(_clean(row[0]), _clean(row[2]), _clean(row[3]), _clean(row[5]),
                None, None, _to_int(row[4]))

    # ---- 批量导入 ----
    stats = catalog.import_batch(shop_id, list(products.values()), list(skus.values()))
    stats["coded"] = sum(1 for p in products.values() if p["code"])
    stats["priced"] = sum(1 for s in skus.values() if s["dan_price"] is not None or s["pin_price"] is not None)
    stats["stocked"] = sum(1 for s in skus.values() if s["stock"] is not None)
    stats["platform"] = PLATFORM_NAME
    stats["shop"] = SHOP_NAME

    # ---- 订单导入 ----
    if os.path.exists(ORDERS_CSV):
        orders = parse_orders_csv(ORDERS_CSV)
        stats["orders_imported"] = catalog.import_orders(shop_id, orders)

    # ---- 推广导入 ----
    if os.path.exists(PROMO_XLSX):
        promos = parse_promotions(PROMO_XLSX)
        if promos:
            stats["promotions_imported"] = catalog.import_promotions(shop_id, promos)
    return stats


def parse_promotions(path: str) -> list[dict]:
    """解析拼多多推广汇总 xlsx（45 列）。核心字段单列，其余存 metrics。"""
    rows = read_sheet_rows(path)
    if not rows:
        return []
    header = rows[0]
    result = []
    for row in rows[1:]:
        if not row or not row[0]:
            continue
        pid = str(row[0]).strip()
        if not pid or pid.startswith("注："):
            continue
        promo = {v: None for v in PROMO_CORE_COLS.values()}
        promo["period"] = "20260801至20260831"
        metrics = {}
        for ci, colname in enumerate(header):
            val = row[ci] if ci < len(row) else None
            if colname in PROMO_CORE_COLS:
                field = PROMO_CORE_COLS[colname]
                if field in ("deal_spend", "deal_amount", "actual_roi", "total_spend"):
                    promo[field] = _to_float(val)
                elif field in ("net_deal_count", "impressions", "clicks"):
                    promo[field] = _to_int(val)
                else:
                    promo[field] = _clean(val) or ""
            else:
                metrics[colname] = val
        promo["metrics"] = metrics
        result.append(promo)
    return result


def parse_orders_csv(path: str) -> list[dict]:
    """解析拼多多订单导出 CSV（含 BOM + 制表符脏数据）。"""
    import csv
    rows = []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        header = None
        for raw in reader:
            # strip 每个字段的制表符/空格
            cells = [(c or "").strip().replace("\t", "").strip() for c in raw]
            if not any(cells):
                continue
            if header is None:
                header = cells
                continue
            if not cells or not cells[0]:
                continue
            row = dict(zip(header, cells))
            order_no = row.get("订单号", "").strip()
            if not order_no:
                continue
            rows.append({
                "order_no": order_no,
                "status": row.get("订单状态", "").strip(),
                "quantity": int(float(row.get("商品数量(件)", "0") or 0)),
                "pay_time": row.get("支付时间", "").strip(),
                "confirm_time": row.get("确认收货时间", "").strip(),
                "platform_product_id": row.get("商品id", "").strip(),
                "spec": row.get("商品规格", "").strip(),
                "aftersale_status": row.get("售后状态", "").strip(),
                "buyer_amount": _to_float(row.get("用户实付金额(元)")),
                "seller_amount": _to_float(row.get("商家实收金额(元)")),
                "tracking_no": row.get("快递单号", "").strip(),
                "courier": row.get("快递公司", "").strip(),
                "province": row.get("省", "").strip(),
                "city": row.get("市", "").strip(),
                "district": row.get("区", "").strip(),
                "source": row.get("订单来源", "").strip(),
            })
    return rows


# ----------------------------- 价格/库存快照导入 -----------------------------

# 拼多多「商品列表批量导出」快照的列名映射（关键词包含匹配，按精确度排序）
PRICE_STOCK_COLUMNS = {
    "platform_product_id": ["商品ID", "商品id", "goods_id", "商品编号"],
    "platform_sku_id": ["SKUID", "sku_id", "SKU_ID", "规格ID", "skuID"],
    "spec_code": ["规格编码", "SKU编码", "sku编码", "商家编码"],
    "spec_name": ["规格名称", "SKU名称", "sku名称", "规格"],
    "dan_price": ["单买价", "单卖价", "销售价", "商品价格", "现价", "售价"],
    "pin_price": ["拼单价", "团购价", "拼团价", "拼团价格"],
    "stock": ["可售库存", "库存数量", "可用库存", "总库存", "库存量", "库存"],
}


def detect_columns(header: list) -> dict:
    """自动识别表头，返回 {field: column_index}。找不到的字段不返回。"""
    mapping = {}
    for i, h in enumerate(header):
        h_clean = str(h or "").strip().lower()
        for field, keywords in PRICE_STOCK_COLUMNS.items():
            if field in mapping:
                continue
            if any(kw.lower() in h_clean for kw in keywords):
                mapping[field] = i
                break
    return mapping


def _read_csv_rows(path: str) -> list[list]:
    """读取 CSV（含 BOM + 制表符脏数据），返回 list[list]。"""
    import csv
    rows = []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        for raw in reader:
            cells = [(c or "").strip().replace("\t", "").strip() for c in raw]
            if not any(cells):
                continue
            rows.append(cells)
    return rows


def parse_price_stock_file(path: str) -> list[dict]:
    """解析价格/库存快照（xlsx 或 csv），自动识别列，返回 updates。

    updates: [{platform_product_id, platform_sku_id, spec_code, spec_name,
               dan_price, pin_price, stock}]
    """
    ext = os.path.splitext(path)[1].lower()
    if ext in (".xlsx", ".xls"):
        rows = read_sheet_rows(path)
    elif ext == ".csv":
        rows = _read_csv_rows(path)
    else:
        raise ValueError(f"不支持的文件格式: {ext}")
    if not rows:
        return []
    cols = detect_columns(rows[0])

    def get(row, field):
        i = cols.get(field)
        if i is None or i >= len(row):
            return None
        return row[i]

    updates = []
    for row in rows[1:]:
        if not row:
            continue
        pid = _clean(get(row, "platform_product_id"))
        if not pid:
            continue
        updates.append({
            "platform_product_id": pid,
            "platform_sku_id": _clean(get(row, "platform_sku_id")),
            "spec_code": _clean(get(row, "spec_code")),
            "spec_name": _clean(get(row, "spec_name")),
            "dan_price": _to_float(get(row, "dan_price")),
            "pin_price": _to_float(get(row, "pin_price")),
            "stock": _to_int(get(row, "stock")),
        })
    return updates


def import_price_stock(path: str, shop_id: int = 1) -> dict:
    """一键导入价格/库存快照：解析 → 幂等更新。返回统计。"""
    updates = parse_price_stock_file(path)
    result = catalog.import_sku_prices(shop_id, updates)
    result["parsed"] = len(updates)
    result["columns_detected"] = detect_columns(
        (read_sheet_rows(path) if path.lower().endswith((".xlsx", ".xls"))
         else _read_csv_rows(path))[0]
    )
    return result


if __name__ == "__main__":
    if "--price-stock" in sys.argv:
        i = sys.argv.index("--price-stock")
        path = sys.argv[i + 1]
        r = import_price_stock(path)
        print("=== 价格/库存快照导入完成 ===")
        for k, v in r.items():
            print(f"  {k}: {v}")
        sys.exit(0)
    result = import_all(reset="--reset" in sys.argv)
    print("=== 导入完成 ===")
    for k, v in result.items():
        print(f"  {k}: {v}")
