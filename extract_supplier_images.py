#!/usr/bin/env python3
"""供应商产品图片提取器：从 xlsx 报价表内嵌图片提取，按行号关联到产品。

原理：Excel 里产品图片是浮动对象，锚定在「产品图片」单元格（anchor row/col）。
图片 anchor 的行号精确等于产品数据行号，因此可精确关联到产品。

流程：
1. 解析每个 sheet 的 drawing anchor (row -> rId -> media 图片)
2. 用与 import_suppliers.py 相同的遍历逻辑定位产品行 + 货号
3. 图片导出到 static/supplier_img/{sid}/{code}.{ext}
4. 按产品遍历序号对齐数据库（id 顺序 = parser 插入顺序），UPDATE image 字段

用法：python3 extract_supplier_images.py [供应商名...]（默认全部 xlsx 供应商）
"""
import os, sys, re, zipfile
from xml.etree import ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalog
from import_suppliers import DOCS, read_xlsx, _idx, _f, NS, NSR

BASE = os.path.dirname(os.path.abspath(__file__))
IMG_ROOT = os.path.join(BASE, 'static', 'supplier_img')

# drawing 命名空间
NSD = '{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}'
NSR_EMBED = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'


# ----------------------------- 图片提取（xlsx） -----------------------------

def _sheet_xml(z, sheet_name):
    wb = ET.fromstring(z.read('xl/workbook.xml').decode('utf-8', 'ignore'))
    wb_rel = ET.fromstring(z.read('xl/_rels/workbook.xml.rels').decode('utf-8', 'ignore'))
    rid2t = {r.get('Id'): r.get('Target') for r in wb_rel}
    for s in wb.iter(NS + 'sheet'):
        if s.get('name') == sheet_name:
            t = rid2t[s.get(NSR)]
            return 'xl/' + t.lstrip('/') if not t.startswith('xl/') else t
    return None


def sheet_image_map(docid, sheet_name):
    """返回 {row: (image_bytes, ext)}。取每行 col 最小的一张图（主图）。"""
    path = os.path.join(DOCS, docid + '_qqdownloadftnv5')
    if not os.path.exists(path) or not zipfile.is_zipfile(path):
        return {}
    z = zipfile.ZipFile(path)
    t = _sheet_xml(z, sheet_name)
    if not t:
        z.close()
        return {}
    relf = t.replace('worksheets/', 'worksheets/_rels/') + '.rels'
    draws = []
    try:
        relroot = ET.fromstring(z.read(relf).decode('utf-8', 'ignore'))
        for rel in relroot:
            if 'drawing' in (rel.get('Type') or ''):
                draws.append(rel.get('Target').replace('../', 'xl/'))
    except KeyError:
        pass
    row2pics = {}  # row -> [(col, media_path)]
    for d in draws:
        if not d.endswith('.xml'):
            continue
        droot = ET.fromstring(z.read(d).decode('utf-8', 'ignore'))
        drelf = d.replace('xl/drawings/', 'xl/drawings/_rels/') + '.rels'
        rid2media = {}
        try:
            drel = ET.fromstring(z.read(drelf).decode('utf-8', 'ignore'))
            for rel in drel:
                rid2media[rel.get('Id')] = rel.get('Target')
        except KeyError:
            pass
        for a in list(droot.iter(NSD + 'twoCellAnchor')) + list(droot.iter(NSD + 'oneCellAnchor')):
            fr = a.find(NSD + 'from')
            row = int(fr.find(NSD + 'row').text)
            col = int(fr.find(NSD + 'col').text)
            blip = a.find('.//' + '{http://schemas.openxmlformats.org/drawingml/2006/main}blip')
            if blip is None:
                continue
            rid = blip.get(NSR_EMBED + 'embed')
            media = rid2media.get(rid)
            if media:
                row2pics.setdefault(row, []).append((col, media.replace('../', 'xl/')))
    out = {}
    for row, pics in row2pics.items():
        pics.sort(key=lambda x: x[0])  # col 最小 = 主图
        media = pics[0][1]
        try:
            data = z.read(media)
        except KeyError:
            continue
        ext = os.path.splitext(media)[1].lower().lstrip('.') or 'png'
        if ext == 'jpeg':
            ext = 'jpg'
        out[row] = (data, ext)
    z.close()
    return out


def _safe_name(code, row):
    s = re.sub(r'[\\/:*?"<>|]+', '_', str(code or '').strip())
    s = s.strip()[:60]
    return s or f'row{row}'


def _col_idx(ref):
    """'A'->0, 'B'->1, 'AA'->26。"""
    letters = ''.join(ch for ch in (ref or '') if ch.isalpha())
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch.upper()) - ord('A') + 1)
    return n - 1


def read_xlsx_aligned(docid, sheet):
    """读取 xlsx，用单元格 r 属性定位列（保留空单元格，避免列错位）。"""
    path = os.path.join(DOCS, docid + '_qqdownloadftnv5')
    z = zipfile.ZipFile(path)
    names = z.namelist()
    wb = ET.fromstring(z.read('xl/workbook.xml').decode('utf-8', 'ignore'))
    wb_rel = ET.fromstring(z.read('xl/_rels/workbook.xml.rels').decode('utf-8', 'ignore'))
    rid2t = {r.get('Id'): r.get('Target') for r in wb_rel}
    target = None
    for s in wb.iter(NS + 'sheet'):
        if s.get('name') == sheet:
            t = rid2t.get(s.get(NSR))
            if t:
                target = 'xl/' + t.lstrip('/') if not t.startswith('xl/') else t
            break
    if not target:
        z.close()
        return []
    shared = []
    if 'xl/sharedStrings.xml' in names:
        ss = ET.fromstring(z.read('xl/sharedStrings.xml').decode('utf-8', 'ignore'))
        for si in ss.iter(NS + 'si'):
            shared.append(''.join(t.text or '' for t in si.iter(NS + 't')))
    sh = ET.fromstring(z.read(target).decode('utf-8', 'ignore'))
    rows = []
    for row in sh.iter(NS + 'row'):
        # 收集该行所有单元格 (col_idx, value)
        cells = {}
        maxcol = -1
        for c in row.iter(NS + 'c'):
            ref = c.get('r') or ''
            ci = _col_idx(ref)
            t = c.get('t')
            v = c.find(NS + 'v')
            val = ''
            if v is not None and v.text is not None:
                if t == 's':
                    val = shared[int(v.text)]
                elif t == 'inlineStr':
                    val = ''.join(x.text or '' for x in c.iter(NS + 't'))
                else:
                    val = v.text
            cells[ci] = val
            maxcol = max(maxcol, ci)
        rows.append([cells.get(i, '') for i in range(maxcol + 1)])
    z.close()
    return rows


def save_image(sid, code, row, data, ext):
    d = os.path.join(IMG_ROOT, str(sid))
    os.makedirs(d, exist_ok=True)
    base = _safe_name(code, row)
    fname = base + '.' + ext
    fp = os.path.join(d, fname)
    i = 2
    while os.path.exists(fp):
        fname = f'{base}_{i}.{ext}'
        fp = os.path.join(d, fname)
        i += 1
    with open(fp, 'wb') as f:
        f.write(data)
    return f'supplier_img/{sid}/{fname}'


def apply_images(sid, images_by_seq):
    """images_by_seq: {遍历序号: image_rel_path}。按 id 顺序对齐数据库。"""
    products = catalog.list_supplier_products(sid)
    updated = 0
    with catalog.closing(catalog._conn()) as c:
        for i, p in enumerate(products):
            if i in images_by_seq:
                c.execute("UPDATE supplier_products SET image=? WHERE id=?",
                          (images_by_seq[i], p['id']))
                updated += 1
        c.commit()
    return updated


# ----------------------------- 各供应商提取 -----------------------------

def extract_senwei():
    """厦门森威：Sheet1, header=row0, 产品=row1.., 货号列=货号。图片 col0。"""
    sid = 2
    docid = 'doc_006bd99616cd'
    rows = read_xlsx(docid, 'Sheet1')
    imgs = sheet_image_map(docid, 'Sheet1')
    header = [str(c).strip() for c in rows[0]]
    code_i = _idx(header, '货号')
    name_i = _idx(header, '品名')
    out = {}
    seq = 0
    for i, r in enumerate(rows[1:]):
        sheet_row = i + 1
        name = _f(r, name_i)
        code = _f(r, code_i)
        if not name and not code:
            continue
        if sheet_row in imgs:
            data, ext = imgs[sheet_row]
            out[seq] = save_image(sid, code, sheet_row, data, ext)
        seq += 1
    return sid, out


def extract_pinyao():
    """品瑶：7 sheets, header=row2, 产品=row4.., 货号列=货号。图片 col0。"""
    sid = 4
    docid = 'doc_b9f1fc105945'
    out = {}
    seq = 0
    for sheet in ['抽屉柜系列', '折叠柜系列', '鞋柜系列', '厨房系列', '折叠购物车系列', '垃圾桶系列', '收纳箱系列']:
        try:
            rows = read_xlsx(docid, sheet)
        except Exception:
            continue
        if len(rows) < 5:
            continue
        imgs = sheet_image_map(docid, sheet)
        header = [str(c).strip() for c in rows[2]]
        code_i = _idx(header, '货号')
        name_i = _idx(header, '品名')
        for i, r in enumerate(rows[4:]):
            sheet_row = i + 4
            code = _f(r, code_i)
            name = _f(r, name_i)
            if not name and not code:
                continue
            if sheet_row in imgs:
                data, ext = imgs[sheet_row]
                out[seq] = save_image(sid, code, sheet_row, data, ext)
            seq += 1
    return sid, out


def extract_chengpin():
    """嘉裕成品记录：5 sheets, header=row0, 产品=row1.., 货号列=货号/编号。图片各 sheet 不同列。"""
    sid = 6
    docid = 'doc_22d1f65d8826'
    out = {}
    seq = 0
    for sheet in ['挂钩', '激光割', '铸铁系列', '艺荣', '它山之石']:
        try:
            rows = read_xlsx(docid, sheet)
        except Exception:
            continue
        if not rows:
            continue
        imgs = sheet_image_map(docid, sheet)
        header = [str(c).strip() for c in rows[0]]
        code_i = _idx(header, '货号', '编号')
        name_i = _idx(header, '名字', '名称')
        for i, r in enumerate(rows[1:]):
            sheet_row = i + 1
            code = _f(r, code_i)
            name = _f(r, name_i)
            if not name and not code:
                continue
            if sheet_row in imgs:
                data, ext = imgs[sheet_row]
                out[seq] = save_image(sid, code, sheet_row, data, ext)
            seq += 1
    return sid, out


def extract_jiayu():
    """嘉裕代发：Sheet1(错位, code=col2) + Sheet2(正常, code=商品编码)。图片 col2(主)。"""
    sid = 3
    docid = 'doc_fa8398379512'
    out = {}
    seq = 0
    # Sheet1 固定列（code=col2, name=col5）
    try:
        rows = read_xlsx(docid, 'Sheet1')
        imgs = sheet_image_map(docid, 'Sheet1')
        for i, r in enumerate(rows[1:]):
            sheet_row = i + 1
            code = _f(r, 2)
            name = _f(r, 5)
            if not name and not code:
                continue
            if sheet_row in imgs:
                data, ext = imgs[sheet_row]
                out[seq] = save_image(sid, code, sheet_row, data, ext)
            seq += 1
    except Exception as e:
        print('  Sheet1 err', e)
    # Sheet2 表头定位
    try:
        rows = read_xlsx(docid, 'Sheet2')
        imgs = sheet_image_map(docid, 'Sheet2')
        header = [str(c).strip() for c in rows[0]]
        code_i = _idx(header, '商品编码')
        name_i = _idx(header, '商品名称')
        for i, r in enumerate(rows[1:]):
            sheet_row = i + 1
            code = _f(r, code_i)
            name = _f(r, name_i)
            if not name and not code:
                continue
            if sheet_row in imgs:
                data, ext = imgs[sheet_row]
                out[seq] = save_image(sid, code, sheet_row, data, ext)
            seq += 1
    except Exception as e:
        print('  Sheet2 err', e)
    return sid, out


def extract_jiayu_size():
    """嘉裕尺寸表：表单式布局，图片按 row 顺序对应产品块（每块约8-10行，图锚定在块内）。"""
    sid = 5
    docid = 'doc_b72494baad2e'
    rows = read_xlsx(docid, 'Sheet1')
    imgs = sheet_image_map(docid, 'Sheet1')
    # 状态机定位每个产品的「编号行」原始行号
    blocks = []  # [(编号行sheet_row, code)]
    for i, r in enumerate(rows[1:]):
        sheet_row = i + 1
        tag = _f(r, 1)
        val = _f(r, 2)
        if '编号' in tag:
            blocks.append((sheet_row, val))
    # 图片按 row 排序，归属到最近的前一个编号行（图片 row >= 编号行 row）
    sorted_imgs = sorted(imgs.items())
    out = {}
    seq = 0  # 产品遍历序号（与 parser 一致）
    img_iter = iter(sorted_imgs)
    img_row, img_data = next(img_iter, (None, None))
    for bi, (block_row, code) in enumerate(blocks):
        # 该产品块的图片：所有 img_row 落在 [block_row, 下一块block_row) 之间
        got = False
        while img_row is not None and img_row < block_row:
            img_row, img_data = next(img_iter, (None, None))
        if img_row is not None and img_row >= block_row and (bi == len(blocks) - 1 or img_row < blocks[bi + 1][0]):
            data, ext = img_data
            out[seq] = save_image(sid, code, img_row, data, ext)
            got = True
            img_row, img_data = next(img_iter, (None, None))
        seq += 1
    return sid, out


def extract_nixiti():
    """尼西铁艺馆：Sheet1, header=row0, 产品=row1.., 编号列=编号。图片 col0(主)。.xls 转 xlsx。"""
    sid = 1
    docid = 'doc_b4f7898d8d15_conv'
    rows = read_xlsx_aligned(docid, 'Sheet1')
    imgs = sheet_image_map(docid, 'Sheet1')
    if not rows:
        return sid, {}
    header = [str(c).strip() for c in rows[0]]
    code_i = _idx(header, '编号')
    name_i = _idx(header, '款式名称')
    out = {}
    seq = 0
    for i, r in enumerate(rows[1:]):
        sheet_row = i + 1
        name = _f(r, name_i)
        code = _f(r, code_i)
        if not name and not code:
            continue
        if sheet_row in imgs:
            data, ext = imgs[sheet_row]
            out[seq] = save_image(sid, code, sheet_row, data, ext)
        seq += 1
    return sid, out


def extract_quanzhou():
    """泉州妍希阁：纵向表单，货号标签在 col4、值在 col7，图片锚定在块内，归属到最近货号行。"""
    sid = 7
    docid = 'doc_8891d33ba0b5_conv'
    out = {}
    seq = 0
    for sheet in ['水管类置物架报价表', '一件代发产品报价表']:
        rows = read_xlsx_aligned(docid, sheet)
        imgs = sheet_image_map(docid, sheet)
        # 货号行列表（对齐 parser：code=col7，name=下一行 col7，都空则跳过）
        blocks = []
        for idx, r in enumerate(rows):
            if '货号' in _f(r, 4):
                code = _f(r, 7)
                name = _f(rows[idx + 1], 7) if idx + 1 < len(rows) else ''
                if not code and not name:
                    continue
                blocks.append((idx, code))
        sorted_imgs = sorted(imgs.items())
        img_iter = iter(sorted_imgs)
        img_row, img_data = next(img_iter, (None, None))
        for bi, (block_row, code) in enumerate(blocks):
            while img_row is not None and img_row < block_row:
                img_row, img_data = next(img_iter, (None, None))
            if img_row is not None and img_row >= block_row and (bi == len(blocks) - 1 or img_row < blocks[bi + 1][0]):
                data, ext = img_data
                out[seq] = save_image(sid, code, img_row, data, ext)
                img_row, img_data = next(img_iter, (None, None))
            seq += 1
    return sid, out


EXTRACTORS = [
    ('尼西铁艺馆', extract_nixiti),
    ('厦门森威', extract_senwei),
    ('品瑶', extract_pinyao),
    ('嘉裕代发', extract_jiayu),
    ('嘉裕代发-尺寸表', extract_jiayu_size),
    ('嘉裕成品记录', extract_chengpin),
    ('泉州妍希阁', extract_quanzhou),
]


def main():
    targets = sys.argv[1:]
    total = 0
    for name, fn in EXTRACTORS:
        if targets and name not in targets:
            continue
        try:
            sid, images = fn()
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f'✗ {name}: 提取失败 {type(e).__name__}: {e}')
            continue
        n = apply_images(sid, images)
        total += n
        print(f'✓ {name}: 提取 {len(images)} 张图，关联 {n} 条 (sid={sid})')
    print(f'\n共关联 {total} 条产品图片')


if __name__ == '__main__':
    main()
