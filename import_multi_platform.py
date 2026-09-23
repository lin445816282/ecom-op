# -*- coding: utf-8 -*-
"""多平台导入（京东/小红书/微信/淘宝/抖音 → catalog.db 平台+店铺+商品+SKU+订单）。

用法：
    python3 import_multi_platform.py          # 实际导入
    python3 import_multi_platform.py --dry    # 只解析打印样本，不写库
"""
import os, csv, re, sys
import import_catalog as ic
import catalog

BASE = '/mnt/c/Users/小林/Desktop/2'
DRY = '--dry' in sys.argv


def _clean(v):
    if v is None:
        return None
    s = str(v).strip().replace('\t', '').strip()
    return s if s != '' else None


def _f(v):
    c = _clean(v)
    if c is None:
        return None
    try:
        return float(c)
    except Exception:
        return None


def _i(v):
    c = _clean(v)
    if c is None:
        return None
    try:
        return int(float(c))
    except Exception:
        return None


def agg_products_skus(rows_iter):
    """rows_iter 产 (pid, name, code, skuid, spec_name, spec_code, dan, pin, stock)。"""
    products = {}
    skus = {}
    for pid, name, code, skuid, spec_name, spec_code, dan, pin, stock in rows_iter:
        if not pid:
            continue
        pid = str(pid)
        products[pid] = {'platform_product_id': pid, 'name': name or '', 'code': code or ''}
        if skuid:
            key = (pid, str(skuid))
            skus[key] = {
                'platform_product_id': pid, 'platform_sku_id': str(skuid),
                'spec_name': spec_name or '', 'spec_code': spec_code or '',
                'dan_price': dan, 'pin_price': pin, 'stock': stock,
            }
    return list(products.values()), list(skus.values())


# ----------------------------- 京东 -----------------------------
def parse_jd():
    p = os.path.join(BASE, '京东-欧世艺 OSHIYI花架官方旗舰店', '导出商品普通POP-SKU信息_11425227_20260923173943498(0).csv')
    rows = ic._read_csv_rows(p)
    def gen():
        for r in rows[1:]:
            # 0 SKUID, 1 商品编码, 2 商品名称, 4 销售属性, 5 货号, 12 京东价, 14 可用库存
            yield (r[1] if len(r) > 1 else '', r[2] if len(r) > 2 else '', r[5] if len(r) > 5 else '',
                   r[0] if len(r) > 0 else '', r[4] if len(r) > 4 else '', '',
                   _f(r[12] if len(r) > 12 else None), None, _i(r[14] if len(r) > 14 else None))
    return agg_products_skus(gen())


# ----------------------------- 小红书 -----------------------------
def parse_xhs_products():
    p = os.path.join(BASE, '小红书-OSHIYI欧世艺的店', 'OSHIYI欧世艺的店2026-09-23_593ed4e6-dc04-4ce3-89f2-9e23e8014e01.xlsx')
    rows = ic.read_sheet_rows(p)
    def gen():
        for r in rows[1:]:
            # 0 规格id, 1 itemId, 3 商品标题, 4 规格名称, 5 库存, 6 售价, 9 商家编码
            yield (r[1] if len(r) > 1 else '', r[3] if len(r) > 3 else '', r[9] if len(r) > 9 else '',
                   r[0] if len(r) > 0 else '', r[4] if len(r) > 4 else '', '',
                   _f(r[6] if len(r) > 6 else None), None, _i(r[5] if len(r) > 5 else None))
    return agg_products_skus(gen())


def parse_xhs_orders():
    p = os.path.join(BASE, '小红书-OSHIYI欧世艺的店', '5fb06964-3e01-4e3f-8f1f-46da2e3ce139.xlsx')
    rows = ic.read_sheet_rows(p)
    out = []
    for r in rows[1:]:
        def g(i):
            return r[i] if i < len(r) else ''
        order_no = _clean(g(0))
        if not order_no:
            continue
        out.append({
            'order_no': order_no, 'status': _clean(g(1)) or '', 'aftersale_status': _clean(g(2)) or '',
            'province': _clean(g(8)) or '', 'city': _clean(g(9)) or '', 'district': _clean(g(10)) or '',
            'spec': _clean(g(18)) or '', 'quantity': _i(g(19)) or 0,
            'buyer_amount': _f(g(23)), 'seller_amount': _f(g(28)),
            'pay_time': _clean(g(34)) or '', 'courier': _clean(g(38)) or '', 'tracking_no': _clean(g(39)) or '',
            'platform_product_id': _clean(g(70)) or '', 'source': '小红书',
        })
    return out


# ----------------------------- 微信 -----------------------------
def parse_weixin_products():
    p = os.path.join(BASE, '微信-嘉裕工艺品', '商品数据导出_wx577e7c3cbac85631_2026年09月23日17时22分25秒_1.xlsx')
    rows = ic.read_sheet_rows(p)
    def gen():
        for r in rows[1:]:
            # 0 商品ID, 1 商品标题, 2 商家编码(商品), 7 SKUID, 8 SKU名称, 10 商家编码(SKU), 11 价格, 12 库存
            yield (r[0] if len(r) > 0 else '', r[1] if len(r) > 1 else '', r[2] if len(r) > 2 else '',
                   r[7] if len(r) > 7 else '', r[8] if len(r) > 8 else '', r[10] if len(r) > 10 else '',
                   _f(r[11] if len(r) > 11 else None), None, _i(r[12] if len(r) > 12 else None))
    return agg_products_skus(gen())


def parse_weixin_orders():
    p = os.path.join(BASE, '微信-嘉裕工艺品', '微信小店订单_wx577e7c3cbac85631_2026年09月23日17时25分58秒_1.xlsx')
    rows = ic.read_sheet_rows(p)
    out = []
    for r in rows[1:]:
        def g(i):
            return r[i] if i < len(r) else ''
        order_no = _clean(g(0))
        if not order_no:
            continue
        as_status = _clean(g(65)) or ''
        if as_status in ('无', '-', ''):
            as_status = '无售后'
        out.append({
            'order_no': order_no, 'status': _clean(g(5)) or '', 'aftersale_status': as_status,
            'province': _clean(g(9)) or '', 'city': _clean(g(10)) or '', 'district': _clean(g(11)) or '',
            'spec': _clean(g(53)) or '', 'quantity': _i(g(58)) or 0,
            'buyer_amount': _f(g(17)), 'seller_amount': _f(g(18)),
            'pay_time': _clean(g(28)) or '', 'courier': _clean(g(30)) or '', 'tracking_no': _clean(g(31)) or '',
            'platform_product_id': _clean(g(50)) or '', 'source': '微信',
        })
    return out


# ----------------------------- 淘宝 -----------------------------
def parse_taobao_products():
    p = os.path.join(BASE, '淘宝-嘉裕工艺品', '商品列表.xlsx')
    rows = ic.read_sheet_rows(p)
    # 行0 分组表头, 行1 真表头, 行2 注释, 行3 起数据
    def gen():
        for r in rows[3:]:
            # 0 商品Id, 3 宝贝标题, 6 商家编码, 9 销售属性, 10 skuId, 11 价格, 12 库存
            yield (r[0] if len(r) > 0 else '', r[3] if len(r) > 3 else '', r[6] if len(r) > 6 else '',
                   r[10] if len(r) > 10 else '', r[9] if len(r) > 9 else '', '',
                   _f(r[11] if len(r) > 11 else None), None, _i(r[12] if len(r) > 12 else None))
    return agg_products_skus(gen())


def parse_taobao_orders():
    p = os.path.join(BASE, '淘宝-嘉裕工艺品', '订单.xlsx')
    rows = ic.read_sheet_rows(p)
    out = []
    for r in rows[1:]:
        def g(i):
            return r[i] if i < len(r) else ''
        order_no = _clean(g(0))
        if not order_no:
            continue
        addr = _clean(g(6)) or ''
        parts = [x for x in addr.split(' ') if x]
        province = parts[0] if len(parts) > 0 else ''
        city = parts[1] if len(parts) > 1 else ''
        district = parts[2] if len(parts) > 2 else ''
        out.append({
            'order_no': order_no, 'status': _clean(g(5)) or '', 'aftersale_status': '',
            'province': province, 'city': city, 'district': district,
            'spec': _clean(g(9)) or '', 'quantity': _i(g(8)) or 0,
            'buyer_amount': _f(g(4)), 'seller_amount': _f(g(3)),
            'pay_time': _clean(g(7)) or '', 'courier': '', 'tracking_no': '',
            'platform_product_id': '', 'source': '淘宝',
        })
    return out


# ----------------------------- 抖音 -----------------------------
def parse_douyin_products():
    p = os.path.join(BASE, '抖音-OSHIYI欧世艺厦门嘉裕工艺品有限公司专卖店', '商品信息.xlsx')
    rows = ic.read_sheet_rows(p)
    def gen():
        for r in rows[1:]:
            # 0 商品ID, 1 商品名称, 9 商家SKU编码, 10 规格ID(SKUID), 11 商品规格, 13 商品价格, 14 现货可售
            code = (r[9] if len(r) > 9 else '') or (r[20] if len(r) > 20 else '')
            yield (r[0] if len(r) > 0 else '', r[1] if len(r) > 1 else '', code,
                   r[10] if len(r) > 10 else '', r[11] if len(r) > 11 else '', code,
                   _f(r[13] if len(r) > 13 else None), None, _i(r[14] if len(r) > 14 else None))
    return agg_products_skus(gen())


def parse_douyin_orders():
    p = os.path.join(BASE, '抖音-OSHIYI欧世艺厦门嘉裕工艺品有限公司专卖店', '订单信息.csv')
    rows = ic._read_csv_rows(p)
    out = []
    for r in rows[1:]:
        def g(i):
            return r[i] if i < len(r) else ''
        order_no = _clean(g(0))
        if not order_no:
            continue
        express = _clean(g(11)) or ''
        # 从快递信息列提取 19 位商品ID + 快递单号/公司（格式：'单号-公司,商品-商品ID,数量;'）
        m = re.search(r'(\d{19})', express)
        pid = m.group(1) if m else ''
        tracking_no, courier = '', ''
        m2 = re.match(r'^(\d+)-([^,，]+)', express)
        if m2:
            tracking_no, courier = m2.group(1), m2.group(2)
        as_status = _clean(g(5)) or ''
        if as_status in ('-', '无', ''):
            as_status = '无售后'
        else:
            # 抖音格式「商品名-退款成功」，提取 '-' 后的结果
            as_status = as_status.rsplit('-', 1)[-1].strip() if '-' in as_status else as_status
        out.append({
            'order_no': order_no, 'status': '', 'aftersale_status': as_status,
            'province': _clean(g(8)) or '', 'city': _clean(g(9)) or '', 'district': _clean(g(10)) or '',
            'spec': _clean(g(1)) or '', 'quantity': _i(g(2)) or 0,
            'buyer_amount': _f(g(6)), 'seller_amount': _f(g(7)),
            'pay_time': _clean(g(4)) or '', 'courier': courier, 'tracking_no': tracking_no,
            'platform_product_id': pid, 'source': '抖音',
        })
    return out


# ----------------------------- 配置 -----------------------------
PLATFORMS = [
    ('jd', '京东', '欧世艺 OSHIYI花架官方旗舰店', parse_jd, None),
    ('xhs', '小红书', 'OSHIYI欧世艺的店', parse_xhs_products, parse_xhs_orders),
    ('weixin', '微信', '嘉裕工艺品', parse_weixin_products, parse_weixin_orders),
    ('taobao', '淘宝', '嘉裕工艺品', parse_taobao_products, parse_taobao_orders),
    ('douyin', '抖音', 'OSHIYI欧世艺厦门嘉裕工艺品有限公司专卖店', parse_douyin_products, parse_douyin_orders),
]


def main():
    catalog.init_db()
    for code, pname, shop_name, parse_prods, parse_orders in PLATFORMS:
        products, skus = parse_prods()
        orders = parse_orders() if parse_orders else []
        n_order = len(orders)
        print(f'=== {pname} · {shop_name} (code={code}) ===')
        print(f'  商品(SPU)={len(products)}  SKU={len(skus)}  订单={n_order}')
        if DRY:
            if products:
                print('  商品样本:', products[0])
            if skus:
                print('  SKU样本:', skus[0])
            if orders:
                print('  订单样本:', orders[0])
            continue
        platform_id = catalog.upsert_platform(code, pname)
        shop_id = catalog.upsert_shop(platform_id, shop_name)
        stats = catalog.import_batch(shop_id, products, skus)
        if orders:
            catalog.import_orders(shop_id, orders)
        print(f'  → 已导入 shop_id={shop_id}, 累计商品={stats.get("products")}, SKU={stats.get("skus")}, 订单={stats.get("orders")}')
        print()
    if not DRY:
        print('=== 导入完成 ===')


if __name__ == '__main__':
    main()
