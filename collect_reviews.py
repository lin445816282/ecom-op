#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""采集拼多多商品评价（评价管理 saturn/reviews/list）→ 写 ecom-op catalog.db reviews 表。

流程：node.exe CDP 翻页抓取评价 API 响应 → 写 C:\\tmp\\reviews_fetch.json → 读 JSON
→ 字段清洗（图片/视频/规格序列化）→ catalog.save_reviews 幂等写库。

用法：python3 collect_reviews.py [shop_id]   （shop_id: 1闲时来/3如若月下/5嘉裕/6欧世艺）
"""
import json
import os
import subprocess
import sys

NODE = "/mnt/d/Program Files/nodejs/node.exe"
FETCH_JS = r"C:\tmp\fetch_reviews.js"
OUT = "/mnt/c/tmp/reviews_fetch.json"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

SHOP_CDP_PORT = {5: 9232, 3: 9230, 1: 9234, 6: 9228}  # 嘉裕=9232 / 如若月下=9230 / 闲时来=9234 / 欧世艺=9228


def run_node(port):
    r = subprocess.run([NODE, FETCH_JS, str(port)], capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        raise RuntimeError("node 采集失败: " + (r.stderr or r.stdout)[:300])


def to_str(v):
    return "" if v is None else str(v)


def to_int(v, default=0):
    try:
        return default if v is None else int(v)
    except (ValueError, TypeError):
        return default


def clean_pictures(pictures):
    """pictures: [{url,width,height,...}] → ["url1","url2",...]；无图返回空串。"""
    if not pictures:
        return ""
    urls = [p.get("url", "") for p in pictures if isinstance(p, dict) and p.get("url")]
    return json.dumps(urls, ensure_ascii=False) if urls else ""


def clean_video(video):
    """video 可能是 null / url 字符串 / 对象，统一存字符串（对象转 JSON）。"""
    if not video:
        return ""
    if isinstance(video, str):
        return video
    if isinstance(video, dict):
        return json.dumps(video, ensure_ascii=False)
    return str(video)


def clean_json(v):
    """specs/keywords 等：已是 JSON 字符串则原样，否则序列化。"""
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    return json.dumps(v, ensure_ascii=False)


def main():
    shop_id = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    port = SHOP_CDP_PORT.get(shop_id, 9232)
    run_node(port)
    with open(OUT, encoding="utf-8") as f:
        d = json.load(f)
    if d.get("error"):
        return {"ok": False, "error": d["error"]}
    reviews = d.get("reviews", [])
    if not reviews:
        return {"ok": False, "error": "无评价数据（totalNum=0）"}

    records = []
    for r in reviews:
        records.append({
            "review_id": to_str(r.get("reviewId")),
            "goods_id": to_str(r.get("goodsId")),
            "order_id": to_str(r.get("orderId")),
            "order_sn": to_str(r.get("orderSn")),
            "score": to_int(r.get("score")),
            "desc_score": to_int(r.get("descScore")),
            "logistics_score": to_int(r.get("logisticsScore")),
            "service_score": to_int(r.get("serviceScore")),
            "comment": to_str(r.get("comment")),
            "append_num": to_int(r.get("appendNum")),
            "goods_name": to_str(r.get("goodsName")),
            "specs": clean_json(r.get("specs")),
            "keywords": clean_json(r.get("keywords")),
            "pictures": clean_pictures(r.get("pictures")),
            "video": clean_video(r.get("video")),
            "thumb_url": to_str(r.get("thumbUrl")),
            "avatar": to_str(r.get("avatar")),
            "reply": to_str(r.get("reply")),
            "reply_time": to_int(r.get("replyTime")),
            "anonymous": to_int(r.get("anonymous")),
            "status": to_int(r.get("status")),
            "create_time": to_int(r.get("createTime")),
        })

    sys.path.insert(0, BASE_DIR)
    import catalog
    catalog.init_db()
    n = catalog.save_reviews(shop_id, records)
    return {"ok": True, "shop_id": shop_id, "total": d.get("totalNum"), "pages": d.get("pages"), "saved": n}


if __name__ == "__main__":
    import sys
    sys.path.insert(0, "/home/xiaolin/.hermes/scripts")
    import notify_task_run as _ntr

    def _run():
        result = main()
        print(json.dumps(result, ensure_ascii=False))

    _ntr.run_and_log("review_monitor", _run)
