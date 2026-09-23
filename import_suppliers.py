#!/usr/bin/env python3
"""供应商商品数据导入器（8 家供应商，异构格式）。"""
import os, sys, json, re, zipfile
from xml.etree import ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalog
import xlrd

DOCS = os.path.expanduser('~/.hermes/cache/documents/')
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
NSR = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


def read_xls(docid, sheet):
    wb = xlrd.open_workbook(os.path.join(DOCS, docid + '_qqdownloadftnv5'))
    ws = wb.sheet_by_name(sheet)
    rows = [[ws.cell_value(i, c) for c in range(ws.ncols)] for i in range(ws.nrows)]
    # 合并单元格填充：左上角值向下/向右铺开
    for rlo, rhi, clo, chi in ws.merged_cells:
        val = ws.cell_value(rlo, clo)
        for r in range(rlo, min(rhi, ws.nrows)):
            for c in range(clo, min(chi, ws.ncols)):
                if rows[r][c] in ('', None):
                    rows[r][c] = val
    return rows


def read_xlsx(docid, sheet):
    path = os.path.join(DOCS, docid + '_qqdownloadftnv5')
    z = zipfile.ZipFile(path)
    names = z.namelist()
    wb_root = ET.fromstring(z.read('xl/workbook.xml').decode('utf-8', 'ignore'))
    rid = None
    for s in wb_root.iter(NS + 'sheet'):
        if s.get('name') == sheet:
            rid = s.get(NSR)
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels').decode('utf-8', 'ignore'))
    target = None
    for rel in rels:
        if rel.get('Id') == rid:
            target = rel.get('Target')
    if not target.startswith('xl/'):
        target = 'xl/' + target.lstrip('/')
    shared = []
    if 'xl/sharedStrings.xml' in names:
        ss = ET.fromstring(z.read('xl/sharedStrings.xml').decode('utf-8', 'ignore'))
        for si in ss.iter(NS + 'si'):
            shared.append(''.join(t.text or '' for t in si.iter(NS + 't')))
    sh = ET.fromstring(z.read(target).decode('utf-8', 'ignore'))
    rows = []
    for row in sh.iter(NS + 'row'):
        cells = []
        for c in row.iter(NS + 'c'):
            t = c.get('t'); v = c.find(NS + 'v')
            val = ''
            if v is not None and v.text is not None:
                if t == 's': val = shared[int(v.text)]
                elif t == 'inlineStr': val = ''.join(x.text or '' for x in c.iter(NS + 't'))
                else: val = v.text
            cells.append(val)
        rows.append(cells)
    z.close()
    return rows


def _f(r, idx):
    if idx < len(r) and r[idx] is not None:
        s = str(r[idx]).strip()
        return s
    return ''


def _idx(header, *keywords):
    """按关键词找列索引（第一个匹配）。"""
    for i, h in enumerate(header):
        hs = str(h).strip()
        for kw in keywords:
            if kw in hs:
                return i
    return -1


def row_dict(header, cells):
    return {str(k).strip(): (cells[i] if i < len(cells) else '') for i, k in enumerate(header) if str(k).strip()}


# ===== 解析器 =====

def parse_nixiti():
    rows = read_xls('doc_b4f7898d8d15', 'Sheet1')
    if not rows: return []
    header = [str(c).strip() for c in rows[0]]
    out = []
    for r in rows[1:]:
        name = _f(r, _idx(header, '款式名称'))
        code = _f(r, _idx(header, '编号'))
        if not name and not code: continue
        raw = row_dict(header, r)
        out.append({
            'category': raw.get('分类', ''), 'product_name': name, 'product_code': code,
            'spec': raw.get('尺寸/CM', ''), 'color': raw.get('颜色', ''),
            'weight': catalog._num(raw.get('净重/KG')), 'box_spec': raw.get('箱规', ''),
            'supply_price': catalog._num(raw.get('代发价/包邮') or raw.get('进货价')),
            'retail_price': catalog._num(raw.get('市场零售价') or raw.get('控价')),
            'source_url': raw.get('疑似货源链接', ''), 'remark': raw.get('版权', ''),
            'raw_json': json.dumps(raw, ensure_ascii=False),
        })
    return out


def parse_senwei():
    rows = read_xlsx('doc_006bd99616cd', 'Sheet1')
    if not rows: return []
    header = [str(c).strip() for c in rows[0]]
    out = []
    for r in rows[1:]:
        name = _f(r, _idx(header, '品名')); code = _f(r, _idx(header, '货号'))
        if not name and not code: continue
        raw = row_dict(header, r)
        out.append({
            'category': '', 'product_name': name, 'product_code': code,
            'spec': raw.get('产品尺寸', ''), 'color': '',
            'weight': catalog._num(raw.get('产品净重')), 'box_spec': raw.get('外箱尺寸', ''),
            'supply_price': catalog._num(raw.get('单款累计20个以内')),
            'retail_price': catalog._num(raw.get('建议零售价')),
            'stock': raw.get('现有库存', ''), 'source_url': '', 'remark': raw.get('备注', ''),
            'raw_json': json.dumps(raw, ensure_ascii=False),
        })
    return out


def parse_jiayu_styles():
    """嘉裕代发-款式：Sheet1 表头错位（数据比表头左移1列），Sheet2 表头正常。"""
    out = []
    # Sheet1 固定列（数据列含义已探明）
    try:
        rows = read_xlsx('doc_fa8398379512', 'Sheet1')
        for r in rows[1:]:
            code = _f(r, 2); name = _f(r, 5)
            if not name and not code: continue
            out.append({
                'category': '', 'product_name': name, 'product_code': code,
                'spec': '', 'color': '',
                'weight': catalog._num(_f(r, 13)), 'box_spec': _f(r, 15),
                'supply_price': catalog._num(_f(r, 6)), 'retail_price': catalog._num(_f(r, 9)),
                'stock': '', 'source_url': '', 'remark': _f(r, 20),
                'raw_json': json.dumps([_f(r, i) for i in range(len(r))], ensure_ascii=False),
            })
    except Exception as e:
        print('  Sheet1 err', e)
    # Sheet2 表头定位
    try:
        rows = read_xlsx('doc_fa8398379512', 'Sheet2')
        header = [str(c).strip() for c in rows[0]]
        for r in rows[1:]:
            name = _f(r, _idx(header, '商品名称')); code = _f(r, _idx(header, '商品编码'))
            if not name and not code: continue
            raw = row_dict(header, r)
            out.append({
                'category': raw.get('商品分类', ''), 'product_name': name, 'product_code': code,
                'spec': '', 'color': '',
                'weight': catalog._num(raw.get('包装重量（kg）')), 'box_spec': raw.get('标准装箱数量', ''),
                'supply_price': catalog._num(raw.get('A-报价')), 'retail_price': catalog._num(raw.get('1688售价')),
                'stock': '', 'source_url': raw.get('1688采购链接', ''), 'remark': raw.get('备注', ''),
                'raw_json': json.dumps(raw, ensure_ascii=False),
            })
    except Exception as e:
        print('  Sheet2 err', e)
    return out


def parse_pinyao():
    out = []
    for sheet in ['抽屉柜系列', '折叠柜系列', '鞋柜系列', '厨房系列', '折叠购物车系列', '垃圾桶系列', '收纳箱系列']:
        try:
            rows = read_xlsx('doc_b9f1fc105945', sheet)
        except Exception:
            continue
        if len(rows) < 5: continue
        header = [str(c).strip() for c in rows[2]]  # 主表头在行3
        for r in rows[4:]:
            code = _f(r, _idx(header, '货号')); name = _f(r, _idx(header, '品名'))
            if not name and not code: continue
            raw = row_dict(header, r)
            w = catalog._num(raw.get('产品克重'))
            out.append({
                'category': sheet.replace('系列', ''), 'product_name': name, 'product_code': code,
                'spec': '', 'color': raw.get('颜色', ''),
                'weight': round(w / 1000, 3) if w else None,  # 克→千克
                'box_spec': raw.get('装箱数', ''),
                'supply_price': catalog._num(raw.get('出厂价格')), 'retail_price': catalog._num(raw.get('控价')),
                'stock': '', 'source_url': '', 'remark': '',
                'raw_json': json.dumps(raw, ensure_ascii=False),
            })
    return out


def parse_jiayu_size():
    """嘉裕代发-尺寸表（b72494）：表单式布局，编号行开始，标签在列1/值在列2。"""
    rows = read_xlsx('doc_b72494baad2e', 'Sheet1')
    if not rows:
        return []
    out = []
    cur = None
    for r in rows[1:]:
        tag = _f(r, 1)
        val = _f(r, 2)
        if '编号' in tag:
            if cur and (cur.get('product_code') or cur.get('product_name')):
                out.append(cur)
            cur = {
                'category': '', 'product_code': val, 'product_name': '', 'spec': '', 'color': '',
                'weight': None, 'box_spec': '',
                'supply_price': catalog._num(_f(r, 5)),
                'retail_price': catalog._num(_f(r, 6)),
                'stock': '', 'source_url': '', 'remark': '',
                'raw_json': json.dumps([_f(r, i) for i in range(len(r))], ensure_ascii=False),
            }
        elif cur is not None:
            if '品名' in tag:
                cur['product_name'] = val
            elif '产品规格' in tag:
                cur['spec'] = val
            elif '净重' in tag:
                cur['weight'] = catalog._num(val)
            elif '颜色' in tag:
                cur['color'] = val
            elif '纸箱规格' in tag:
                cur['box_spec'] = val
    if cur and (cur.get('product_code') or cur.get('product_name')):
        out.append(cur)
    return out


def parse_chengpin():
    """嘉裕成品记录（22d1f65d8826）：多 sheet 不同表头。"""
    out = []
    # 各 sheet 的关键列（货号/名字/成本/售价）
    for sheet in ['挂钩', '激光割', '铸铁系列', '艺荣', '它山之石']:
        try:
            rows = read_xlsx('doc_22d1f65d8826', sheet)
        except Exception:
            continue
        if not rows: continue
        header = [str(c).strip() for c in rows[0]]
        for r in rows[1:]:
            code = _f(r, _idx(header, '货号', '编号'))
            name = _f(r, _idx(header, '名字', '名称'))
            if not name and not code: continue
            raw = row_dict(header, r)
            supply = catalog._num(raw.get('成本（不含钩）') or raw.get('成本（含钩）') or raw.get('成本价'))
            retail = catalog._num(raw.get('售价') or raw.get('零售价') or raw.get('售价1'))
            out.append({
                'category': sheet, 'product_name': name, 'product_code': code,
                'spec': raw.get('尺寸', '') or raw.get('尺寸/cm', ''), 'color': raw.get('颜色', ''),
                'weight': catalog._num(raw.get('净重/kg/含钩子') or raw.get('重量/kg') or raw.get('净量/kg/含钩子')),
                'box_spec': raw.get('箱规', ''),
                'supply_price': supply, 'retail_price': retail,
                'stock': '', 'source_url': raw.get('网址', ''), 'remark': raw.get('材质', ''),
                'raw_json': json.dumps(raw, ensure_ascii=False),
            })
    return out


def parse_quanzhou():
    """泉州妍希阁（.xls）：货号/描述纵向排列，出厂价在右侧列12。"""
    out = []
    for sheet in ['水管类置物架报价表', '一件代发产品报价表']:
        try:
            rows = read_xls('doc_8891d33ba0b5', sheet)
        except Exception:
            continue
        for idx, r in enumerate(rows):
            if '货号' in _f(r, 4):
                code = _f(r, 7)
                price = catalog._num(_f(r, 12))
                name = _f(rows[idx + 1], 7) if idx + 1 < len(rows) else ''
                if not code and not name:
                    continue
                out.append({
                    'category': sheet.replace('报价表', ''), 'product_name': name, 'product_code': code,
                    'spec': '', 'color': '', 'weight': None, 'box_spec': '',
                    'supply_price': price, 'retail_price': None,
                    'stock': '', 'source_url': '', 'remark': '',
                    'raw_json': json.dumps([_f(r, i) for i in range(len(r))], ensure_ascii=False),
                })
    return out


def parse_xingyan():
    """星彦（.xls）：爬藤架 sheet，颜色/尺寸/零售价/代发价。"""
    out = []
    try:
        rows = read_xls('doc_7dc9b24b3604', '爬藤架')
    except Exception:
        return out
    for r in rows[4:]:
        color = _f(r, 0)
        size = _f(r, 1)
        if not color and not size:
            continue
        supply = catalog._num(_f(r, 7))  # 代发价
        retail = catalog._num(_f(r, 3))  # 零售价格
        out.append({
            'category': '爬藤架', 'product_name': (color + ' ' + size).strip(), 'product_code': '',
            'spec': size, 'color': color, 'weight': catalog._num(_f(r, 25)), 'box_spec': '',
            'supply_price': supply, 'retail_price': retail,
            'stock': '', 'source_url': '', 'remark': '',
            'raw_json': json.dumps([_f(r, i) for i in range(len(r))], ensure_ascii=False),
        })
    return out


SUPPLIERS = [
    ('尼西铁艺馆', parse_nixiti, 'nixityg.1688.com'),
    ('厦门森威', parse_senwei, 'xmsenwei.1688.com'),
    ('嘉裕代发', parse_jiayu_styles, 'doc.weixin.qq.com'),
    ('品瑶', parse_pinyao, '浙江品瑶科技股份有限公司'),
    ('嘉裕代发-尺寸表', parse_jiayu_size, ''),
    ('嘉裕成品记录', parse_chengpin, ''),
    ('泉州妍希阁', parse_quanzhou, '泉州妍希阁工艺品有限公司'),
    ('星彦', parse_xingyan, ''),
]


def main():
    targets = sys.argv[1:]
    total = 0
    for name, parser, source in SUPPLIERS:
        if targets and name not in targets:
            continue
        try:
            rows = parser()
        except Exception as e:
            print(f'✗ {name}: 解析失败 {type(e).__name__}: {e}')
            continue
        if not rows:
            print(f'✗ {name}: 解析到 0 条')
            continue
        sid = catalog.upsert_supplier(name, source=source)
        n = catalog.replace_supplier_products(sid, rows)
        total += n
        print(f'✓ {name}: 导入 {n} 条 (sid={sid})')
    print(f'\n共 {total} 条')


if __name__ == '__main__':
    main()
