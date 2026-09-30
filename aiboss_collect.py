# -*- coding: utf-8 -*-
"""AI老板数据采集：CDP抓商品数据页 + spider字体解密 + 入库。

流程：node抓取(输出私有区字符) → 下载spider字体 → 模板匹配破映射 → 解密数字 → 入库 ai_boss_goods_daily。
用法：python3 aiboss_collect.py <端口> [统计日期]
"""
import sys
import os
import json
import subprocess
import tempfile
import urllib.request
from datetime import datetime, timedelta

import catalog

NODE_EXE = "/mnt/d/Program Files/nodejs/node.exe"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _wsl_to_win(path: str) -> str:
    """WSL 路径 /mnt/c/xxx → Windows 路径 C:\\xxx（node.exe 是 Windows 程序）。"""
    p = os.path.abspath(path)
    low = p.lower()
    for d in "cdefgh":
        prefix = f"/mnt/{d}/"
        if low.startswith(prefix):
            return f"{d.upper()}:\\" + p[len(prefix):].replace("/", "\\")
    return p.replace("/", "\\")


SCRAPE_JS = _wsl_to_win(os.path.join(BASE_DIR, "scrape_goods_effect.js"))
RAW_OUT = r"C:\tmp\goods_effect_raw.json"
STD_FONT = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"


def _decode_with_mapping(raw: str, mapping: dict) -> str:
    """把私有区字符串解密成数字串。mapping: {ord: '数字'}"""
    out = []
    for ch in raw:
        if ord(ch) in mapping:
            out.append(mapping[ord(ch)])
        elif ch in ".%-":
            out.append(ch)
        else:
            out.append(ch)
    return "".join(out)


def _parse_number(s: str) -> float:
    """解密后的字符串转数字（去掉 % 等单位）。"""
    s = s.replace("%", "").replace("元", "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return 0.0


def _crack_font_mapping(font_path: str) -> dict:
    """下载的字体文件 → {私有区码点: 数字字符}。用模板匹配。"""
    from fontTools.ttLib import TTFont
    from PIL import Image, ImageDraw, ImageFont
    import numpy as np

    f = TTFont(font_path)
    cmap = f.getBestCmap()
    priv = [u for u in cmap if u >= 0xE000]
    if not priv:
        return {}
    priv.sort()

    # 渲染标准数字模板
    std_font = ImageFont.truetype(STD_FONT, 100)
    std = {}
    for i in range(10):
        img = Image.new("L", (140, 140), 255)
        d = ImageDraw.Draw(img)
        bbox = d.textbbox((0, 0), str(i), font=std_font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        d.text((70 - w / 2 - bbox[0], 70 - h / 2 - bbox[1]), str(i), font=std_font, fill=0)
        std[i] = np.array(img.resize((28, 28))) < 128

    spider_font = ImageFont.truetype(font_path, 100)
    mapping = {}
    for u in priv:
        img = Image.new("L", (140, 140), 255)
        d = ImageDraw.Draw(img)
        bbox = d.textbbox((0, 0), chr(u), font=spider_font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        d.text((70 - w / 2 - bbox[0], 70 - h / 2 - bbox[1]), chr(u), font=spider_font, fill=0)
        a = np.array(img.resize((28, 28))) < 128
        best, best_iou = None, -1
        for i in range(10):
            b = std[i]
            inter = int((a & b).sum())
            union = int((a | b).sum())
            iou = inter / union if union else 0
            if iou > best_iou:
                best_iou, best = iou, i
        mapping[u] = str(best)
    return mapping


def collect(port: str, stat_date: str = None):
    """抓取 + 解密 + 入库。返回导入条数。"""
    if not stat_date:
        stat_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    # 1. node 抓取
    r = subprocess.run([NODE_EXE, SCRAPE_JS, port, RAW_OUT], capture_output=True, text=True, timeout=180)
    print("抓取输出:", r.stdout.strip()[:200], r.stderr.strip()[:200])

    raw = json.load(open("/mnt/c/tmp/goods_effect_raw.json", encoding="utf-8"))
    font_url = raw.get("fontUrl", "")
    rows = raw.get("rows", [])
    if not rows:
        print("无数据行")
        return 0
    if not font_url:
        print("⚠️ 未获取到 spider 字体 URL，尝试默认字体")
        font_url = "https://pfile.pddpic.com/webspider-sdk-api/19f4b805aac64707adb4ebf68192fcba-13b7cd57f3c64d85b41779f9b6fc3e2a.ttf"

    # 2. 下载字体
    font_path = os.path.join(tempfile.gettempdir(), "spider_font_cur.ttf")
    try:
        urllib.request.urlretrieve(font_url, font_path)
    except Exception as e:
        print("⚠️ 字体下载失败:", e)
        return 0

    # 3. 破映射
    mapping = _crack_font_mapping(font_path)
    print("字体映射:", {hex(k): v for k, v in mapping.items()})

    # 3.5 只保留 AI 老板自己上架的商品（published_goods 里的长 ID），排除店铺老商品（短 ID）
    pub_ids = {str(g.get("goods_id")) for g in catalog.list_published_goods(limit=300) if g.get("goods_id")}

    # 4. 解密 + 入库
    cnt = 0
    for row in rows:
        gid = row.get("gid", "").strip()
        if not gid:
            continue
        if gid not in pub_ids:
            print(f"  跳过(非AI老板上架): {gid}")
            continue
        title = row.get("title", "").strip()
        # 清理标题里的 CSS 样式残留
        title = title.split("}")[-1].strip() if "}" in title else title
        def dec(key):
            return _decode_with_mapping(row.get(key, ""), mapping)
        catalog.upsert_ai_boss_daily(
            goods_id=gid,
            goods_name=title,
            stat_date=stat_date,
            visitor_cnt=int(_parse_number(dec("visitor"))),
            page_view_cnt=int(_parse_number(dec("page_view"))),
            pay_buyer_cnt=int(_parse_number(dec("pay_buyer"))),
            pay_order_cnt=int(_parse_number(dec("pay_order"))),
            pay_amount=_parse_number(dec("pay_amount")),
            pay_rate=_parse_number(dec("pay_rate")),
            collect_cnt=int(_parse_number(dec("collect"))),
        )
        cnt += 1
        print(f"  入库: {gid} {title[:20]} 访客={dec('visitor')} 订单={dec('pay_order')} 金额={dec('pay_amount')}")
    return cnt


if __name__ == "__main__":
    port = sys.argv[1] if len(sys.argv) > 1 else "9232"
    stat_date = sys.argv[2] if len(sys.argv) > 2 else None
    n = collect(port, stat_date)
    print(f"完成，导入 {n} 条")
