# -*- coding: utf-8 -*-
"""中通快递账单导入：解析 xlsx 明细 sheet → catalog.import_freight。

用法：
    python3 import_freight.py <账单xlsx路径> [--courier 中通快递]

账单结构（明细 sheet，13 列）：
    账单日期 | 运单号 | 结算对象 | 面单账号名称 | 目的地省 | 目的地市 |
    结算重量 | 快递费(元) | 面单费(元) | 附加费(元) | 应结金额(元) | 寄件人 | 寄件人电话
"""
from __future__ import annotations

import sys
import os
import re
import zipfile
from datetime import datetime, timedelta

import catalog

DEFAULT_COURIER = "中通快递"


def _excel_date(n) -> str:
    """Excel 日期序列号 → YYYY-MM-DD。"""
    try:
        return (datetime(1899, 12, 30) + timedelta(days=int(float(n)))).strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return str(n)


def _to_float(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def parse_zt_bill(path: str) -> list[dict]:
    """解析中通账单 xlsx，返回运费明细 list[dict]。"""
    z = zipfile.ZipFile(path)
    shared = re.findall(
        r"<t[^>]*>(.*?)</t>",
        z.read("xl/sharedStrings.xml").decode("utf-8"),
        re.DOTALL,
    )

    # 找明细 sheet（表头含「运单号」的那个）
    target_sheet = None
    for name in z.namelist():
        if re.match(r"xl/worksheets/sheet\d+\.xml$", name):
            xml = z.read(name).decode("utf-8")
            # 第一个 row 的表头里是否含 sharedStrings 的「运单号」
            first_row = re.search(r"<row[^>]*>(.*?)</row>", xml, re.DOTALL)
            if first_row and "运单号" in _row_to_header(first_row.group(1), shared):
                target_sheet = xml
                break

    if target_sheet is None:
        raise ValueError("未找到含「运单号」的明细 sheet")

    rows = re.findall(r"<row[^>]*>(.*?)</row>", target_sheet, re.DOTALL)
    result = []
    for row in rows[1:]:
        d = _parse_row(row, shared)
        tn = (d.get("B") or "").strip()
        # 运单号须为数字串（过滤空行/合计行）
        if not tn or not re.fullmatch(r"\d+", tn):
            continue
        result.append({
            "tracking_no": tn,
            "account_name": (d.get("C") or "").strip(),
            "courier": DEFAULT_COURIER,
            "ship_date": _excel_date(d.get("A", "")),
            "province": (d.get("E") or "").strip(),
            "city": (d.get("F") or "").strip(),
            "weight": _to_float(d.get("G")),
            "freight_cost": _to_float(d.get("H")),
            "bill_fee": _to_float(d.get("I")),
            "extra_fee": _to_float(d.get("J")),
            "total": _to_float(d.get("K")),
        })
    return result


def _row_to_header(row_xml: str, shared: list[str]) -> str:
    """把第一行的单元格转成表头字符串（用于识别「运单号」）。"""
    parts = []
    for ref, t, body in _iter_cells(row_xml):
        v = _cell_value(t, body, shared)
        parts.append(v)
    return "|".join(parts)


def _parse_row(row_xml: str, shared: list[str]) -> dict:
    d = {}
    for ref, t, body in _iter_cells(row_xml):
        col = re.match(r"([A-Z]+)", ref).group(1)
        d[col] = _cell_value(t, body, shared)
    return d


def _iter_cells(row_xml: str):
    for m in re.finditer(r'<c r="([A-Z]+\d+)"', row_xml):
        ref = m.group(1)
        cm = re.search(
            r'<c r="' + ref + r'"(?:[^>]*?t="(\w+)")?[^>]*>(.*?)</c>',
            row_xml,
            re.DOTALL,
        )
        if not cm:
            continue
        yield ref, cm.group(1), cm.group(2)


def _cell_value(t, body, shared):
    vm = re.search(r"<v>(.*?)</v>", body)
    if not vm:
        return ""
    v = vm.group(1)
    if t == "s":
        try:
            return shared[int(v)]
        except (ValueError, IndexError):
            return v
    return v


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print("用法: python3 import_freight.py <账单xlsx路径> [--courier 快递名]")
        sys.exit(1)
    path = args[0]
    if not os.path.exists(path):
        print(f"文件不存在: {path}")
        sys.exit(1)

    catalog.init_db()
    rows = parse_zt_bill(path)
    if not rows:
        print("未解析到任何运费明细")
        sys.exit(1)

    res = catalog.import_freight(rows)
    print(f"导入完成: {res['imported']} 单（跳过 {res['skipped']}），自动匹配 {res['matched']} 单")
    print(f"账单月份: {min(r['ship_date'] for r in rows)} ~ {max(r['ship_date'] for r in rows)}")
    total = sum(r['total'] or 0 for r in rows)
    print(f"应结总金额: {total:.2f} 元")

    ana = catalog.freight_analysis()
    print(f"当前运费库: {ana['total']} 单，匹配 {ana['matched']} 单 ({ana['match_rate']}%)")


if __name__ == "__main__":
    main()
