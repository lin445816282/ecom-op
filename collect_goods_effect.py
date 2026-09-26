#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""采集拼多多商品访问明细（商品数据·商品明细）→ 写 ecom-op catalog.db。

流程：node.exe CDP 采集（读字体 URL + 抓明细 API）→ 下载动态字体 →
OCR 识别 PUA→数字映射 → 解密 → 写 goods_effect 表。

依赖：aa-books venv 的 python（含 easyocr / PIL / fontTools）。
调用：/home/xiaolin/projects/aa-books/backend/.venv/bin/python collect_goods_effect.py
"""
import json
import os
import re
import sqlite3
import subprocess
import sys
import urllib.request

NODE = "/mnt/d/Program Files/nodejs/node.exe"
FETCH_JS = r"C:\tmp\fetch_ge.js"
OUT = "/mnt/c/tmp/ge_fetch.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36"
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "catalog.db")

SHOP_ID = 1  # 闲时来工艺（默认）

SHOP_CDP_PORT = {5: 9232, 3: 9230, 1: 9234, 6: 9228}  # 嘉裕=9232 / 如若月下=9230 / 闲时来=9234 / 欧世艺=9228

FIELD_MAP = {
    "goodsId": "platform_product_id",
    "goodsName": "goods_name",
    "statDate": "stat_date",
    "goodsUv": "goods_uv",
    "goodsPv": "goods_pv",
    "payOrdrAmt": "pay_ordr_amt",
    "payOrdrCnt": "pay_ordr_cnt",
    "payOrdrUsrCnt": "pay_ordr_usr_cnt",
    "goodsVcr": "goods_vcr",
    "goodsFavCnt": "goods_fav_cnt",
    "hdThumbUrl": "thumb_url",
}
NUM_FIELDS = {"goods_uv", "goods_pv", "pay_ordr_amt", "pay_ordr_cnt",
              "pay_ordr_usr_cnt", "goods_vcr", "goods_fav_cnt"}


def download_font(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = r.read()
    path = "/tmp/ge_font.ttf"
    with open(path, "wb") as f:
        f.write(data)
    return path


def build_mapping(font_path, reader):
    from fontTools.ttLib import TTFont
    from PIL import Image, ImageDraw, ImageFont
    import numpy as np
    from collections import Counter
    font = TTFont(font_path)
    cmap = font.getBestCmap()
    puas = [cp for cp in cmap if 0xE000 <= cp <= 0xF8FF]
    if len(puas) != 10:
        puas = puas[:10]
    pil_font = ImageFont.truetype(font_path, 100)
    imgs = {}
    mapping = {}
    for cp in puas:
        img = Image.new("L", (140, 150), 255)
        d = ImageDraw.Draw(img)
        d.text((15, 15), chr(cp), font=pil_font, fill=0)
        bbox = img.getbbox()
        if bbox:
            img = img.crop(bbox)
        img = img.resize((img.width * 2, img.height * 2))
        arr = np.array(img) < 128
        imgs[cp] = arr
        res = reader.readtext(np.array(img), allowlist="0123456789", detail=0)
        mapping[cp] = res[0] if res else "?"

    def has_top_bar(arr):
        h, w = arr.shape
        for row in range(max(1, h // 4)):
            if int(arr[row].sum()) >= w * 0.4:
                return True
        return False

    # 1↔7 混淆修正：缺 1 且 7 重复时，无顶部横线的是 1
    cnt = Counter(mapping.values())
    if cnt.get("7", 0) >= 2 and cnt.get("1", 0) == 0:
        for cp in [c for c, d in mapping.items() if d == "7"]:
            if not has_top_bar(imgs[cp]):
                mapping[cp] = "1"

    return mapping


def decrypt(s, mapping):
    if not isinstance(s, str):
        return s
    out = []
    for ch in s:
        cp = ord(ch)
        out.append(mapping[cp] if cp in mapping else ch)
    return "".join(out)


def to_num(s):
    if s is None:
        return None
    s = str(s).strip()
    if not s or s == "--" or s == "?":
        return None
    s = s.replace("%", "")
    try:
        return float(s) if "." in s else int(s)
    except Exception:
        return None


def run_node(port=9228):
    r = subprocess.run([NODE, FETCH_JS, str(port)], capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError("node 采集失败: " + (r.stderr or r.stdout)[:300])


def main():
    global SHOP_ID
    shop_id = int(sys.argv[1]) if len(sys.argv) > 1 else SHOP_ID
    SHOP_ID = shop_id
    port = SHOP_CDP_PORT.get(shop_id, 9228)
    run_node(port)
    with open(OUT, encoding="utf-8") as f:
        d = json.load(f)
    if "err" in d or not d.get("apiBody") or not d.get("fontUrl"):
        return {"ok": False, "error": d.get("err") or "无数据/字体 URL 缺失"}

    import easyocr
    reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    font_path = download_font(d["fontUrl"])
    mapping = build_mapping(font_path, reader)

    body = json.loads(d["apiBody"])
    goods_list = (body.get("result") or {}).get("goodsDetailList") or []

    records = []
    for g in goods_list:
        rec = {}
        for src, dst in FIELD_MAP.items():
            val = g.get(src)
            if dst in NUM_FIELDS:
                rec[dst] = to_num(decrypt(val, mapping))
            else:
                rec[dst] = val if val is not None else ""
        records.append(rec)

    conn = sqlite3.connect(DB_PATH)
    try:
        n = 0
        for r in records:
            conn.execute(
                "INSERT INTO goods_effect(shop_id, platform_product_id, goods_name, stat_date, "
                "goods_uv, goods_pv, pay_ordr_amt, pay_ordr_cnt, pay_ordr_usr_cnt, goods_vcr, "
                "goods_fav_cnt, thumb_url) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(platform_product_id, stat_date) DO UPDATE SET "
                "goods_name=excluded.goods_name, goods_uv=excluded.goods_uv, goods_pv=excluded.goods_pv, "
                "pay_ordr_amt=excluded.pay_ordr_amt, pay_ordr_cnt=excluded.pay_ordr_cnt, "
                "pay_ordr_usr_cnt=excluded.pay_ordr_usr_cnt, goods_vcr=excluded.goods_vcr, "
                "goods_fav_cnt=excluded.goods_fav_cnt, thumb_url=excluded.thumb_url",
                (SHOP_ID, r["platform_product_id"], r["goods_name"], r["stat_date"],
                 r["goods_uv"], r["goods_pv"], r["pay_ordr_amt"], r["pay_ordr_cnt"],
                 r["pay_ordr_usr_cnt"], r["goods_vcr"], r["goods_fav_cnt"], r["thumb_url"]),
            )
            n += 1
        conn.commit()
        return {"ok": True, "count": n}
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    sys.path.insert(0, "/home/xiaolin/.hermes/scripts")
    import notify_task_run as _ntr

    def _run():
        result = main()
        print(json.dumps(result, ensure_ascii=False))

    _ntr.run_and_log("goods_effect", _run)
