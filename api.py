# -*- coding: utf-8 -*-
"""电商运营工作台：轻量 API，供单页前端本地调用。"""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import sys
import time
import threading
from urllib.parse import urlparse, parse_qs, quote
from datetime import datetime, timedelta

import data
import catalog
import import_freight
import ai_boss_engine

PORT = 8765
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROMOTION_HISTORY_PATH = os.path.expanduser("~/.hermes/pdd_promotion_history.json")

# 店铺 → 拼多多 CDP 端口（Edge 独立 profile，详见 pdd-promotion-cdp skill）
# 端口对齐 launch_4shops.ps1：9232=嘉裕, 9230=如若月下, 9234=闲时来, 9228=欧世艺
SHOP_CDP_PORT = {5: 9232, 3: 9230, 1: 9234, 6: 9228}
# CDP 实例清单：端口 → {label, profile, target, role}。用于页面「CDP 实例」状态卡片 + 手动重启。
# profile 与 C:\\tmp\\ 下 Edge user-data-dir 一一对应（登录态存 profile，重启不丢登录态）。
CDP_INSTANCES = [
    {"port": 9238, "label": "1688 抓取", "profile": r"C:\tmp\edge-cdp-1688", "role": "1688 商品详情抓取", "target": "https://detail.1688.com"},
    {"port": 9232, "label": "嘉裕工艺品", "profile": r"C:\tmp\edge-cdp-ry", "role": "拼多多店铺", "shop_id": 5, "target": "https://mms.pinduoduo.com"},
    {"port": 9230, "label": "如若月下", "profile": r"C:\tmp\edge-cdp-ruoyue", "role": "拼多多店铺", "shop_id": 3, "target": "https://mms.pinduoduo.com"},
    {"port": 9234, "label": "闲时来工艺", "profile": r"C:\tmp\edge-cdp-xianshi", "role": "拼多多店铺", "shop_id": 1, "target": "https://mms.pinduoduo.com"},
    {"port": 9228, "label": "欧世艺", "profile": r"C:\tmp\edge-cdp-oshiyi", "role": "拼多多店铺", "shop_id": 6, "target": "https://mms.pinduoduo.com"},
]
NODE_EXE = "/mnt/d/Program Files/nodejs/node.exe"
PDD_SET_TITLE_JS = r"C:\tmp\pdd_set_titles.js"
# 一键上架：执行层脚本目录（WSL 路径 / Windows 路径，node.exe 只能吃 Windows 路径）
AUTOPUBLISH_DIR_WSL = os.path.join(BASE_DIR, "autopublish")
AUTOPUBLISH_DIR_WIN = r"D:\电商运营\运营工作台\autopublish"
# 1688 登录实例 CDP 端口（抓取商品详情用，详见 pdd-promotion-cdp / taobao 相关 skill）
CLIENT_1688_PORT = 9238
# 竞品监控：买家端搜索实例 + 采集脚本
CLIENT_CDP_PORT = 9236
PDD_SEARCH_COMP_JS = r"C:\tmp\fetch_competitors.js"
PDD_BUYER_REVIEW_JS = r"C:\tmp\fetch_buyer_reviews.js"
PDD_COMMENTS_FULL_JS = r"C:\tmp\fetch_comments_full.js"

# 访问口令：环境变量 ECOM_OP_TOKEN 可覆盖，默认见下。静态资源公开，/api/* 需带口令。
ACCESS_TOKEN = os.environ.get("ECOM_OP_TOKEN", "Alcz8283103")
AUTH_WHITELIST = {"/", "/index.html", "/app.js", "/style.css", "/favicon.ico", "/api/auth/login", "/api/published-goods/image"}


def _sanitize(obj):
    """递归把 JSON 非法的 Infinity/NaN 转成 None，防止前端 JSON.parse 崩溃。"""
    if isinstance(obj, float):
        if obj != obj or obj in (float("inf"), float("-inf")):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize(v) for v in obj]
    return obj


def _json(handler, obj, status=200):
    body = json.dumps(_sanitize(obj), ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[api]", self.address_string(), fmt % args)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        if not length:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def _authed(self, path, qs):
        """鉴权：静态资源 + 登录接口放行，其余 /api/* 校验访问口令。"""
        if path in AUTH_WHITELIST:
            return True
        if path.startswith("/static/"):
            return True
        if not path.startswith("/api/"):
            return True  # 非 API 路径（如未知静态）不做鉴权，交给后续 404
        token = self.headers.get("Authorization", "").replace("Bearer ", "").strip()
        if not token:
            token = (qs.get("token") or [""])[0]
        return token == ACCESS_TOKEN

    def _route(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        # 支持子路径代理（如 Cloudflare Tunnel /ecom-op/）：
        # 剥离前缀后按原路由逻辑处理，本地直连不受影响。
        for prefix in ("/ecom-op",):
            if path == prefix or path.startswith(prefix + "/"):
                path = path[len(prefix):].rstrip("/") or "/"
                break
        qs = parse_qs(parsed.query)

        if self.command == "OPTIONS":
            return _json(self, {"ok": True})

        # 鉴权：静态资源 + 登录接口放行，其余 /api/* 校验访问口令
        if not self._authed(path, qs):
            return _json(self, {"error": "未授权，请先登录"}, 401)

        # 登录接口
        if path == "/api/auth/login" and self.command == "POST":
            item = self._read_body()
            token = str(item.get("token") or "").strip()
            if token == ACCESS_TOKEN:
                return _json(self, {"ok": True})
            return _json(self, {"error": "口令错误"}, 401)

        # 错误知识库
        if path == "/api/errors" and self.command == "GET":
            return _json(self, {"items": catalog.query_errors()})

        if path == "/api/errors" and self.command == "POST":
            item = self._read_body()
            action = str(item.get("action") or "").strip()
            if action == "hit":
                rec = catalog.hit_error(int(item.get("id") or 0))
                if rec:
                    return _json(self, {"ok": True, "item": rec})
                return _json(self, {"ok": False, "error": "记录不存在"})
            error_type = str(item.get("error_type") or "").strip()
            if not error_type:
                return _json(self, {"ok": False, "error": "错误类型不能为空"})
            rec = catalog.add_error(
                error_type,
                str(item.get("description") or ""),
                str(item.get("skill_name") or ""),
                str(item.get("solution") or ""),
            )
            return _json(self, {"ok": True, "item": rec})

        # 产品
        if path == "/api/products" and self.command == "GET":
            items = [data.enrich_product(data.Product.from_dict(p)) for p in data.load_products()]
            return _json(self, {"items": items})

        if path == "/api/products" and self.command == "POST":
            item = self._read_body()
            cleaned = {k: item.get(k) for k in [
                "id", "name", "selling_price", "gross_profit", "ad_cost", "refund_rate",
                "ad_spend", "orders", "impressions", "clicks", "sold", "notes",
                "cost", "shipping", "commission_rate", "freight_insurance", "shop",
                "platform_product_id"]}
            cleaned["id"] = cleaned.get("id") or ""
            cleaned["name"] = cleaned.get("name") or "未命名商品"
            for k in ["selling_price", "gross_profit", "ad_cost", "refund_rate",
                      "ad_spend", "orders", "impressions", "clicks", "sold",
                      "cost", "shipping", "commission_rate", "freight_insurance"]:
                try:
                    cleaned[k] = float(cleaned.get(k) or 0)
                except Exception:
                    cleaned[k] = 0.0
            for k in ["orders", "impressions", "clicks", "sold"]:
                cleaned[k] = int(cleaned[k])
            cleaned["shop"] = cleaned.get("shop") or "拼多多"
            data.add_product(cleaned)
            saved = data.enrich_product(data.Product.from_dict(cleaned))
            return _json(self, {"item": saved})

        if path.startswith("/api/products/") and self.command == "DELETE":
            pid = path.split("/")[-1]
            ok = data.delete_product(pid)
            return _json(self, {"ok": ok}, 200 if ok else 404)

        # 知识库 / 选品日历 / 任务模板
        if path == "/api/knowledge" and self.command == "GET":
            return _json(self, {"items": data.knowledge_base()})

        if path == "/api/calendar" and self.command == "GET":
            return _json(self, {"items": data.seasonal_calendar()})

        if path == "/api/task-templates" and self.command == "GET":
            return _json(self, {"items": data.task_templates()})

        # 关键词库
        if path == "/api/keywords" and self.command == "GET":
            return _json(self, {"items": data.load_keywords()})

        if path == "/api/keywords" and self.command == "POST":
            item = self._read_body()
            cleaned = {k: item.get(k) for k in ["id", "word", "category", "source", "status", "notes", "hot", "product", "shop", "weight", "pool_type", "platform_scope", "mutually_exclude", "max_occur", "search_volume", "competition", "ctr", "cvr", "roi"]}
            cleaned["id"] = cleaned.get("id") or ""
            cleaned["word"] = (cleaned.get("word") or "").strip()
            cleaned["category"] = cleaned.get("category") or "核心词"
            cleaned["source"] = cleaned.get("source") or "manual"
            cleaned["status"] = cleaned.get("status") or "待用"
            cleaned["notes"] = cleaned.get("notes") or ""
            cleaned["hot"] = cleaned.get("hot") or "中"
            cleaned["product"] = cleaned.get("product") or "门后挂钩"
            cleaned["shop"] = cleaned.get("shop") or "拼多多"
            # 新字段：权重/池子/平台/互斥/最大出现次数
            cleaned["pool_type"] = cleaned.get("pool_type") or "main"
            cleaned["platform_scope"] = cleaned.get("platform_scope") or "all"
            try:
                cleaned["weight"] = int(cleaned.get("weight") if cleaned.get("weight") is not None else 5)
            except Exception:
                cleaned["weight"] = 5
            try:
                cleaned["max_occur"] = int(cleaned.get("max_occur") if cleaned.get("max_occur") is not None else 1)
            except Exception:
                cleaned["max_occur"] = 1
            # 数据维度：搜索量/竞争度 int，ctr/cvr/roi float
            for k in ["search_volume", "competition"]:
                try:
                    cleaned[k] = int(cleaned.get(k) if cleaned.get(k) is not None else 0)
                except Exception:
                    cleaned[k] = 0
            for k in ["ctr", "cvr", "roi"]:
                try:
                    cleaned[k] = float(cleaned.get(k) if cleaned.get(k) is not None else 0)
                except Exception:
                    cleaned[k] = 0.0
            me = cleaned.get("mutually_exclude")
            cleaned["mutually_exclude"] = me if isinstance(me, list) else []
            if not cleaned["word"]:
                return _json(self, {"error": "关键词不能为空"}, 400)
            data.add_keyword(cleaned)
            return _json(self, {"item": cleaned})

        # 批量清洗：去重 + 标准化 + 脏词标记
        if path == "/api/keywords/clean" and self.command == "POST":
            result = data.clean_keywords()
            return _json(self, {"ok": True, **result})

        # 批量更新：打标签 / 池子迁移 / 权重（body: {ids:[], fields:{weight:8,pool_type:"main"}}）
        if path == "/api/keywords/batch" and self.command == "POST":
            body = self._read_body()
            ids = body.get("ids") or []
            fields = body.get("fields") or {}
            if not fields:
                return _json(self, {"error": "fields 不能为空"}, 400)
            n = data.batch_update_keywords(ids, fields)
            return _json(self, {"ok": True, "updated": n})

        # 预筛打分：单词打分（body: 关键词 dict）
        if path == "/api/keywords/score" and self.command == "POST":
            body = self._read_body()
            if not body.get("word"):
                return _json(self, {"error": "word 不能为空"}, 400)
            r = data.score_keyword(body)
            return _json(self, r)

        # 批量重跑预筛打分（spare 池词）
        if path == "/api/keywords/rescore" and self.command == "POST":
            r = data.rescore_all_keywords()
            return _json(self, {"ok": True, **r})

        # 类目均值基线
        if path == "/api/keywords/baseline" and self.command == "GET":
            return _json(self, data.class_baselines())

        # 标题投放记录（标题 → 曝光/点击/成交/花费）
        if path == "/api/title-perf" and self.command == "GET":
            return _json(self, {"items": data.load_title_perf()})

        if path == "/api/title-perf" and self.command == "POST":
            item = self._read_body()
            if not (item.get("title") or "").strip():
                return _json(self, {"error": "标题不能为空"}, 400)
            saved = data.add_title_perf(item)
            return _json(self, {"item": saved})

        if path.startswith("/api/title-perf/") and self.command == "DELETE":
            tid = path.split("/")[-1]
            ok = data.delete_title_perf(tid)
            return _json(self, {"ok": ok}, 200 if ok else 404)

        # 按词聚合表现（特殊词 CTR 判定）
        if path == "/api/keywords/metrics" and self.command == "GET":
            return _json(self, {"items": data.aggregate_word_metrics()})

        # 权重变更建议（AI 计算，人工审核）
        if path == "/api/weight-suggestions" and self.command == "GET":
            return _json(self, {"items": data.load_suggestions()})

        if path == "/api/weight-suggestions/generate" and self.command == "POST":
            r = data.generate_weight_suggestions()
            return _json(self, {"ok": True, **r})

        if path == "/api/weight-suggestions/apply" and self.command == "POST":
            body = self._read_body()
            ids = body.get("ids") or []
            r = data.apply_suggestions(ids)
            return _json(self, {"ok": True, **r})

        if path == "/api/weight-suggestions/reject" and self.command == "POST":
            body = self._read_body()
            ids = body.get("ids") or []
            r = data.reject_suggestions(ids)
            return _json(self, {"ok": True, **r})

        if path.startswith("/api/keywords/") and self.command == "DELETE":
            kid = path.split("/")[-1]
            ok = data.delete_keyword(kid)
            return _json(self, {"ok": ok}, 200 if ok else 404)

        # 标题模板库
        if path == "/api/title-templates" and self.command == "GET":
            return _json(self, {"items": data.TITLE_TEMPLATES})

        # 标题生成（模板+结构化词库加权随机，含互斥/权重/长度校验）
        if path == "/api/titles/generate" and self.command == "POST":
            body = self._read_body()
            core = (body.get("core") or "").strip()
            if not core:
                return _json(self, {"error": "核心词不能为空"}, 400)
            n = int(body.get("n") or 10)
            platform = body.get("platform") or "all"
            template_ids = body.get("template_ids") or None
            titles = data.generate_titles(core, n=n, platform=platform, template_ids=template_ids)
            return _json(self, {"items": titles})

        # 标题表现回流（商品投产数据 → 关键词权重升降）
        if path == "/api/keywords/feedback" and self.command == "POST":
            body = self._read_body()
            title = (body.get("title") or "").strip()
            perf = body.get("performance") or "good"
            if not title:
                return _json(self, {"error": "标题不能为空"}, 400)
            result = data.feedback_title(title, perf)
            return _json(self, {"ok": True, **result})

        # 1688 搜索联想词采集（body: {core_words: ["门后挂钩", ...], product: "门后挂钩"}）
        if path == "/api/keywords/collect" and self.command == "POST":
            body = self._read_body()
            core_words = body.get("core_words") or []
            if isinstance(core_words, str):
                core_words = [core_words]
            if not core_words:
                return _json(self, {"error": "core_words 不能为空"}, 400)
            product = (body.get("product") or "门后挂钩").strip() or "门后挂钩"
            result = data.collect_1688_keywords(core_words, product=product)
            return _json(self, {"ok": result["error"] is None, **result})

        # 竞品标题 AI 分词拆解（body: {title: "..."}）
        if path == "/api/titles/split" and self.command == "POST":
            body = self._read_body()
            title = (body.get("title") or "").strip()
            if not title:
                return _json(self, {"error": "标题不能为空"}, 400)
            result = data.split_competitor_title(title)
            return _json(self, {"ok": result["error"] is None, **result})

        # 拆解词导入关键词库（body: {title: "...", words: [{word, role}]}）
        if path == "/api/titles/split/import" and self.command == "POST":
            body = self._read_body()
            title = (body.get("title") or "").strip()
            words = body.get("words") or []
            if not title or not words:
                return _json(self, {"error": "title 和 words 不能为空"}, 400)
            result = data.import_split_words(title, words)
            return _json(self, {"ok": True, **result})

        # 竞品评价/问大家 痛点词 AI 拆解（body: {text: "..."}）
        if path == "/api/titles/split-review" and self.command == "POST":
            body = self._read_body()
            text = (body.get("text") or "").strip()
            if not text:
                return _json(self, {"error": "评价文本不能为空"}, 400)
            result = data.split_review_painpoints(text)
            return _json(self, {"ok": result["error"] is None, **result})

        # 痛点反推词导入关键词库（body: {text: "...", pairs: [{pain, selling}]}）
        if path == "/api/titles/split-review/import" and self.command == "POST":
            body = self._read_body()
            text = (body.get("text") or "").strip()
            pairs = body.get("pairs") or []
            if not text or not pairs:
                return _json(self, {"error": "text 和 pairs 不能为空"}, 400)
            result = data.import_painpoint_words(text, pairs)
            return _json(self, {"ok": True, **result})

        # AI 同义词/长尾变体扩充（body: {core_word: "..."}）
        if path == "/api/keywords/expand" and self.command == "POST":
            body = self._read_body()
            core_word = (body.get("core_word") or "").strip()
            if not core_word:
                return _json(self, {"error": "core_word 不能为空"}, 400)
            result = data.expand_synonyms(core_word)
            return _json(self, {"ok": result["error"] is None, **result})

        # AI 扩充词导入关键词库（body: {core_word: "...", words: [{word, role}]}）
        if path == "/api/keywords/expand/import" and self.command == "POST":
            body = self._read_body()
            core_word = (body.get("core_word") or "").strip()
            words = body.get("words") or []
            if not core_word or not words:
                return _json(self, {"error": "core_word 和 words 不能为空"}, 400)
            result = data.import_expanded_words(core_word, words)
            return _json(self, {"ok": True, **result})

        # 推广历史（趋势图数据源）
        if path == "/api/promotion-history" and self.command == "GET":
            items = []
            try:
                with open(PROMOTION_HISTORY_PATH, "r", encoding="utf-8") as f:
                    hist = json.load(f)
                for ts in sorted(hist.keys()):
                    rec = hist[ts]
                    rec["ts"] = ts
                    items.append(rec)
            except Exception:
                pass
            return _json(self, {"items": items})

        # 任务
        if path == "/api/tasks" and self.command == "GET":
            return _json(self, {"items": data.load_tasks()})

        if path == "/api/tasks" and self.command == "POST":
            item = self._read_body()
            items = data.load_tasks()
            if "id" not in item or not item["id"]:
                item["id"] = "t" + os.urandom(3).hex()
            idx = next((i for i, t in enumerate(items) if t.get("id") == item["id"]), None)
            if idx is None:
                items.append(item)
            else:
                items[idx] = item
            data.save_tasks(items)
            return _json(self, {"item": item})

        if path.startswith("/api/tasks/") and self.command == "DELETE":
            tid = path.split("/")[-1]
            items = data.load_tasks()
            new_items = [t for t in items if t.get("id") != tid]
            if len(new_items) == len(items):
                return _json(self, {"ok": False}, 404)
            data.save_tasks(new_items)
            return _json(self, {"ok": True})

        # 运营日志
        if path == "/api/logs" and self.command == "GET":
            return _json(self, {"items": data.load_logs()})

        if path == "/api/logs" and self.command == "POST":
            item = self._read_body()
            cleaned = {k: item.get(k) for k in [
                "id", "date", "product", "impressions", "clicks", "sold",
                "orders", "ad_spend", "conclusion", "actions", "shop"]}
            cleaned["id"] = cleaned.get("id") or ""
            cleaned["date"] = cleaned.get("date") or ""
            cleaned["product"] = cleaned.get("product") or ""
            cleaned["conclusion"] = cleaned.get("conclusion") or ""
            cleaned["actions"] = cleaned.get("actions") or ""
            cleaned["shop"] = cleaned.get("shop") or "拼多多"
            for k in ["ad_spend"]:
                try:
                    cleaned[k] = float(cleaned.get(k) or 0)
                except Exception:
                    cleaned[k] = 0.0
            for k in ["impressions", "clicks", "sold", "orders"]:
                try:
                    cleaned[k] = int(cleaned.get(k) or 0)
                except Exception:
                    cleaned[k] = 0
            data.add_log(cleaned)
            return _json(self, {"item": cleaned})

        if path.startswith("/api/logs/") and self.command == "DELETE":
            lid = path.split("/")[-1]
            ok = data.delete_log(lid)
            return _json(self, {"ok": ok}, 200 if ok else 404)

        # 导出 CSV
        if path == "/api/products/export" and self.command == "GET":
            items = data.load_products()
            fields = ["ID", "商品名", "到手售价", "单件毛利", "利润率", "售后率", "保本投产比",
                      "目标投产比", "单件广告花费", "周期广告花费", "周期订单数", "曝光", "点击",
                      "成交件数", "点击率", "转化率", "每日建议预算", "备注"]
            import csv, io
            out = io.StringIO()
            w = csv.writer(out)
            w.writerow(fields)
            for it in items:
                pr = data.Product.from_dict(it)
                cm = pr.click_metrics()
                w.writerow([it.get("id",""), it.get("name",""), pr.selling_price, pr.gross_profit,
                            round(pr.margin,4), pr.refund_rate, pr.break_even_roi, pr.target_roi,
                            pr.ad_cost, pr.ad_spend, pr.orders, pr.impressions, pr.clicks, pr.sold,
                            cm["ctr"], cm["cvr"], pr.suggested_daily_budget, it.get("notes","")])
            body = out.getvalue().encode("utf-8-sig")
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="products.csv"')
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # 商品目录（平台 + 电商层级：平台 → 店铺 → 商品 → SKU）
        if path == "/api/catalog/stats" and self.command == "GET":
            return _json(self, catalog.catalog_stats())

        if path == "/api/catalog/flow-status" and self.command == "GET":
            stats = catalog.flow_stats()
            kws = data.load_keywords()
            pool, kstat = {}, {}
            for k in kws:
                p = k.get("pool_type") or "?"
                s = k.get("status") or "?"
                pool[p] = pool.get(p, 0) + 1
                kstat[s] = kstat.get(s, 0) + 1
            stats["keywords"] = {
                "total": len(kws), "main": pool.get("main", 0),
                "spare": pool.get("spare", 0), "black": pool.get("black", 0),
                "used": kstat.get("已用", 0),
            }
            tasks = data.load_tasks()
            logs = data.load_logs()
            stats["tasks"] = {"total": len(tasks), "done": sum(1 for t in tasks if t.get("done"))}
            stats["logs"] = {"total": len(logs)}
            return _json(self, stats)

        if path == "/api/catalog/platforms" and self.command == "GET":
            return _json(self, {"items": catalog.list_platforms()})

        if path == "/api/catalog/platforms" and self.command == "POST":
            item = self._read_body()
            code = (item.get("code") or "").strip()
            name = (item.get("name") or "").strip()
            if not code or not name:
                return _json(self, {"error": "平台代码和名称不能为空"}, 400)
            pid = catalog.upsert_platform(code, name)
            return _json(self, {"id": pid, "code": code, "name": name})

        if path.startswith("/api/catalog/platforms/") and self.command == "PUT":
            pid = int(path.split("/")[-1])
            name = (self._read_body().get("name") or "").strip()
            if not name:
                return _json(self, {"error": "名称不能为空"}, 400)
            ok = catalog.rename_platform(pid, name)
            return _json(self, {"ok": ok}, 200 if ok else 404)

        if path.startswith("/api/catalog/platforms/") and self.command == "DELETE":
            pid = int(path.split("/")[-1])
            stats = catalog.delete_platform(pid)
            return _json(self, {"ok": True, **stats})

        if path == "/api/catalog/shops" and self.command == "GET":
            platform_id = qs.get("platform_id", [None])[0]
            return _json(self, {"items": catalog.list_shops(int(platform_id) if platform_id else None)})

        if path == "/api/catalog/shops" and self.command == "POST":
            item = self._read_body()
            platform_id = int(item.get("platform_id") or 0)
            name = (item.get("name") or "").strip()
            if not platform_id or not name:
                return _json(self, {"error": "平台和店铺名称不能为空"}, 400)
            sid = catalog.upsert_shop(platform_id, name)
            return _json(self, {"id": sid, "platform_id": platform_id, "name": name})

        if path.startswith("/api/catalog/shops/") and self.command == "PUT":
            sid = int(path.split("/")[-1])
            name = (self._read_body().get("name") or "").strip()
            if not name:
                return _json(self, {"error": "名称不能为空"}, 400)
            ok = catalog.rename_shop(sid, name)
            return _json(self, {"ok": ok}, 200 if ok else 404)

        if path.startswith("/api/catalog/shops/") and self.command == "DELETE":
            sid = int(path.split("/")[-1])
            stats = catalog.delete_shop(sid)
            return _json(self, {"ok": True, **stats})

        if path == "/api/catalog/products" and self.command == "GET":
            shop_id = qs.get("shop_id", [None])[0]
            q = qs.get("q", [None])[0]
            limit = qs.get("limit", ["500"])[0]
            try:
                limit = int(limit)
            except Exception:
                limit = 500
            items = catalog.list_products(int(shop_id) if shop_id else None, q=q, limit=limit)
            return _json(self, {"items": items})

        if path == "/api/catalog/skus" and self.command == "GET":
            product_id = qs.get("product_id", [None])[0]
            return _json(self, {"items": catalog.list_skus(int(product_id) if product_id else None)})

        if path == "/api/catalog/orders" and self.command == "GET":
            shop_id = qs.get("shop_id", [None])[0]
            limit = qs.get("limit", ["500"])[0]
            try:
                limit = int(limit)
            except Exception:
                limit = 500
            return _json(self, {"items": catalog.list_orders(int(shop_id) if shop_id else None, limit=limit)})

        if path == "/api/catalog/promotions" and self.command == "GET":
            shop_id = qs.get("shop_id", [None])[0]
            limit = qs.get("limit", ["500"])[0]
            try:
                limit = int(limit)
            except Exception:
                limit = 500
            return _json(self, {"items": catalog.list_promotions(int(shop_id) if shop_id else None, limit=limit)})

        if path == "/api/catalog/tree" and self.command == "GET":
            return _json(self, {"items": catalog.catalog_tree()})

        if path == "/api/catalog/analysis" and self.command == "GET":
            return _json(self, catalog.catalog_analysis())

        if path == "/api/catalog/performance" and self.command == "GET":
            shop_id = qs.get("shop_id", [None])[0]
            start = qs.get("start", [None])[0]
            end = qs.get("end", [None])[0]
            statuses = [s for s in qs.get("status", []) if s]
            return _json(self, catalog.catalog_performance(
                int(shop_id) if shop_id else None, start or None, end or None,
                statuses or None))

        if path == "/api/catalog/performance-all" and self.command == "GET":
            start = qs.get("start", [None])[0]
            end = qs.get("end", [None])[0]
            statuses = [s for s in qs.get("status", []) if s]
            return _json(self, catalog.catalog_performance_all(
                start or None, end or None, statuses or None))

        if path == "/api/catalog/order-statuses" and self.command == "GET":
            return _json(self, {"items": catalog.order_statuses()})

        if path == "/api/catalog/platform-overview" and self.command == "GET":
            start = qs.get("start", [None])[0]
            end = qs.get("end", [None])[0]
            return _json(self, catalog.platform_overview(start, end))

        if path == "/api/catalog/product/cost" and self.command == "POST":
            item = self._read_body()
            shop_id = int(item.get("shop_id") or 0)
            ppid = item.get("platform_product_id", "")
            cost = item.get("cost_price")
            if cost == "" or cost is None:
                cost = None
            elif isinstance(cost, str):
                cost = float(cost)
            ok = catalog.update_product_cost(shop_id, ppid, cost)
            return _json(self, {"ok": ok})

        if path == "/api/catalog/product/status" and self.command == "POST":
            item = self._read_body()
            shop_id = int(item.get("shop_id") or 0)
            ppid = item.get("platform_product_id", "")
            status = item.get("status", "") or ""
            try:
                ok = catalog.update_product_status(shop_id, ppid, status)
            except ValueError as e:
                return _json(self, {"error": str(e)}, 400)
            return _json(self, {"ok": ok})

        if path == "/api/catalog/selection" and self.command == "GET":
            return _json(self, catalog.selection_analysis())

        if path == "/api/catalog/promotions-analysis" and self.command == "GET":
            return _json(self, catalog.promotions_analysis())

        if path == "/api/catalog/product-real-roi" and self.command == "GET":
            period = qs.get("period", [None])[0]
            return _json(self, catalog.product_real_roi(period))

        if path == "/api/catalog/promo-finance" and self.command == "GET":
            shop_id = qs.get("shop_id", [None])[0]
            limit = qs.get("limit", ["30"])[0]
            rows = catalog.query_promo_finance(int(shop_id) if shop_id else None, int(limit))
            return _json(self, {"items": rows})

        if path == "/api/catalog/promo-monthly-bill" and self.command == "GET":
            shop_id = qs.get("shop_id", [None])[0]
            limit = qs.get("limit", ["100"])[0]
            rows = catalog.query_promo_monthly_bill(int(shop_id) if shop_id else None, int(limit))
            return _json(self, {"items": rows})

        if path == "/api/catalog/promo-daily-bill" and self.command == "GET":
            shop_id = qs.get("shop_id", [None])[0]
            start = qs.get("start", [None])[0]
            end = qs.get("end", [None])[0]
            limit = qs.get("limit", ["500"])[0]
            rows = catalog.query_promo_daily_bill(
                int(shop_id) if shop_id else None,
                start, end, int(limit),
            )
            return _json(self, {"items": rows})

        if path == "/api/hook-cost" and self.command == "GET":
            n = int(qs.get("n", ["1"])[0] or 1)
            return _json(self, catalog.calc_hook_cost(n))

        if path == "/api/cost-params" and self.command == "GET":
            return _json(self, {"params": catalog.list_cost_params_full()})

        if path == "/api/cost-params" and self.command == "POST":
            item = self._read_body()
            params = item.get("params") or {}
            updated = catalog.update_cost_params(params)
            return _json(self, {"ok": True, "updated": updated})

        if path == "/api/catalog/daily-profit" and self.command == "GET":
            shop_id = qs.get("shop_id", [None])[0]
            start = qs.get("start", [None])[0]
            end = qs.get("end", [None])[0]
            limit = qs.get("limit", ["90"])[0]
            rows = catalog.list_daily_profit(
                int(shop_id) if shop_id else None,
                start, end, int(limit),
            )
            return _json(self, {"items": rows, "server_today": datetime.now().strftime("%Y-%m-%d")})

        if path == "/api/catalog/daily-profit/settle" and self.command == "POST":
            item = self._read_body()
            date = str(item.get("date") or "").strip()
            if not date:
                date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
            result = catalog.settle_daily_profit(date)
            return _json(self, result)

        if path == "/api/catalog/sale-category" and self.command == "GET":
            start = qs.get("start", [None])[0]
            end = qs.get("end", [None])[0]
            return _json(self, {"items": catalog.sale_category_summary(start, end),
                                "date_range": catalog.sale_date_range(),
                                "server_today": datetime.now().strftime("%Y-%m-%d")})

        if path == "/api/catalog/sale-daily" and self.command == "GET":
            start = qs.get("start", [None])[0]
            end = qs.get("end", [None])[0]
            limit = qs.get("limit", ["90"])[0]
            return _json(self, {"items": catalog.sale_daily(start, end, int(limit))})

        if path == "/api/catalog/sale-monthly" and self.command == "GET":
            return _json(self, {"items": catalog.sale_monthly()})

        if path == "/api/catalog/sale-sku" and self.command == "GET":
            start = qs.get("start", [None])[0]
            end = qs.get("end", [None])[0]
            limit = qs.get("limit", ["500"])[0]
            return _json(self, {"items": catalog.sale_sku_detail(start, end, int(limit))})

        if path == "/api/order-time-analysis" and self.command == "GET":
            shop_id = qs.get("shop_id", [None])[0]
            days = qs.get("days", [None])[0]
            return _json(self, catalog.order_time_analysis(
                int(shop_id) if shop_id else None,
                int(days) if days else None,
            ))

        if path == "/api/weekday-time-vote" and self.command == "GET":
            shop_id = qs.get("shop_id", [None])[0]
            days = qs.get("days", [None])[0]
            return _json(self, catalog.weekday_time_vote(
                int(shop_id) if shop_id else None,
                int(days) if days else None,
            ))

        if path == "/api/catalog/scheduled-tasks" and self.command == "GET":
            return _json(self, {"items": catalog.list_scheduled_tasks()})

        if path == "/api/catalog/scheduled-tasks/toggle" and self.command == "POST":
            item = self._read_body()
            task_key = item.get("task_key")
            enabled = item.get("enabled")
            if not task_key:
                return _json(self, {"error": "task_key required"}, 400)
            ok = catalog.toggle_scheduled_task(task_key, 1 if enabled else 0)
            return _json(self, {"ok": ok})

        if path == "/api/catalog/task-runs" and self.command == "GET":
            task_key = qs.get("task_key", [None])[0]
            limit = int(qs.get("limit", ["100"])[0] or 100)
            return _json(self, {"items": catalog.list_task_runs(task_key, limit)})

        if path == "/api/catalog/reviews" and self.command == "GET":
            shop_id = qs.get("shop_id", [None])[0]
            goods_id = qs.get("goods_id", [None])[0]
            star = qs.get("star", [None])[0]
            has_picture = qs.get("has_picture", ["0"])[0] in ("1", "true", "True")
            has_video = qs.get("has_video", ["0"])[0] in ("1", "true", "True")
            keyword = qs.get("keyword", [""])[0]
            limit = int(qs.get("limit", ["200"])[0] or 200)
            offset = int(qs.get("offset", ["0"])[0] or 0)
            items = catalog.list_reviews(
                int(shop_id) if shop_id else None,
                goods_id,
                int(star) if star else None,
                has_picture,
                has_video,
                keyword,
                limit,
                offset,
            )
            return _json(self, {"items": items})

        if path == "/api/catalog/review-stats" and self.command == "GET":
            return _json(self, catalog.review_stats())

        if path == "/api/catalog/review-analysis" and self.command == "GET":
            return _json(self, catalog.review_analysis())

        if path == "/api/catalog/reviews/collect" and self.command == "POST":
            item = self._read_body()
            shop_id = item.get("shop_id")
            if not shop_id:
                return _json(self, {"error": "shop_id required"}, 400)
            import subprocess
            script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "collect_reviews.py")

            def _run_collect():
                try:
                    subprocess.run([sys.executable, script, str(shop_id)], capture_output=True, text=True, timeout=900)
                except Exception:
                    pass

            threading.Thread(target=_run_collect, daemon=True).start()
            return _json(self, {"ok": True, "msg": "评价采集已启动（后台执行）"})

        # 打单登记
        if path == "/api/pack-records" and self.command == "POST":
            item = self._read_body()
            entry = item.get("entry")
            source = item.get("source")
            try:
                count = int(item.get("count") or 0)
            except Exception:
                count = 0
            if not entry or not source or count <= 0:
                return _json(self, {"error": "入口/来源/数量不能为空"}, 400)
            rec = catalog.save_pack_record(entry, source, count, item.get("remark") or "", item.get("record_date"), item.get("scatter_shop") or "")
            return _json(self, {"item": rec})

        if path == "/api/pack-records" and self.command == "GET":
            date = qs.get("date", [None])[0]
            return _json(self, {"items": catalog.list_pack_records(date)})

        if path == "/api/pack-summary" and self.command == "GET":
            date = qs.get("date", [None])[0]
            return _json(self, catalog.pack_summary(date))

        if path == "/api/pack-monthly" and self.command == "GET":
            entry = qs.get("entry", [""])[0] or None
            ym = qs.get("month", [""])[0] or None
            return _json(self, catalog.pack_monthly_summary(entry=entry, ym=ym))

        if path == "/api/freight/three-way" and self.command == "GET":
            ym = qs.get("month", [""])[0] or None
            return _json(self, catalog.freight_three_way(month=ym))

        if path == "/api/freight/mapping" and self.command == "GET":
            return _json(self, {"items": catalog.list_pack_mapping()})

        if path == "/api/freight/mapping" and self.command == "POST":
            item = self._read_body()
            entry = item.get("entry")
            if not entry:
                return _json(self, {"error": "入口不能为空"}, 400)
            return _json(self, {"item": catalog.save_pack_mapping(
                entry,
                item.get("shop_ids") or "",
                item.get("freight_account") or "",
            )})

        if path == "/api/freight/import" and self.command == "POST":
            body = self._read_body()
            b64 = (body.get("data") or "").strip()
            if not b64:
                return _json(self, {"ok": False, "error": "缺少文件数据"}, 400)
            import base64
            import tempfile
            try:
                raw = base64.b64decode(b64)
            except Exception:
                return _json(self, {"ok": False, "error": "文件数据无效（base64 解码失败）"}, 400)
            tmp_path = None
            try:
                fd, tmp_path = tempfile.mkstemp(suffix=".xlsx")
                with os.fdopen(fd, "wb") as f:
                    f.write(raw)
                rows = import_freight.parse_zt_bill(tmp_path)
            except ValueError as e:
                return _json(self, {"ok": False, "error": str(e)}, 400)
            except Exception as e:
                return _json(self, {"ok": False, "error": "解析失败：" + str(e)}, 400)
            finally:
                if tmp_path and os.path.exists(tmp_path):
                    try:
                        os.remove(tmp_path)
                    except OSError:
                        pass
            if not rows:
                return _json(self, {"ok": False, "error": "未解析到运费明细（请确认是中通账单 xlsx，明细 sheet 含「运单号」列）"}, 400)
            res = catalog.import_freight(rows)
            return _json(self, {"ok": True, **res})

        if path.startswith("/api/pack-records/") and self.command == "DELETE":
            rid = path.split("/")[-1]
            ok = catalog.delete_pack_record(int(rid) if rid.isdigit() else 0)
            return _json(self, {"ok": ok}, 200 if ok else 404)

        if path.startswith("/api/pack-records/") and self.command == "PUT":
            rid = path.split("/")[-1]
            item = self._read_body()
            ok = catalog.update_pack_record(
                int(rid) if rid.isdigit() else 0,
                entry=item.get("entry"),
                source=item.get("source"),
                count=item.get("count"),
                remark=item.get("remark"),
                record_date=item.get("record_date"),
            )
            return _json(self, {"ok": ok}, 200 if ok else 404)

        # 散单店铺（下拉框选项）
        if path == "/api/scatter-shops" and self.command == "GET":
            return _json(self, {"items": catalog.list_scatter_shops()})

        if path == "/api/scatter-shops" and self.command == "POST":
            item = self._read_body()
            name = (item.get("name") or "").strip()
            if not name:
                return _json(self, {"error": "店铺名不能为空"}, 400)
            return _json(self, {"item": catalog.add_scatter_shop(name)})

        if path.startswith("/api/scatter-shops/") and self.command == "DELETE":
            sid = path.split("/")[-1]
            ok = catalog.delete_scatter_shop(int(sid) if sid.isdigit() else 0)
            return _json(self, {"ok": ok}, 200 if ok else 404)

        # 竞品监控
        if path == "/api/competitors" and self.command == "GET":
            platform_product_id = qs.get("platform_product_id", [""])[0] or None
            keyword = qs.get("keyword", [""])[0] or None
            return _json(self, {"items": catalog.list_competitors(platform_product_id, keyword)})

        if path == "/api/competitors/collect" and self.command == "POST":
            item = self._read_body()
            shop_id = int(item.get("shop_id") or 0)
            platform_product_id = str(item.get("platform_product_id") or "").strip()
            keyword = (item.get("keyword") or "").strip()
            if not platform_product_id or not keyword:
                return _json(self, {"error": "商品ID和搜索词不能为空"}, 400)
            import threading
            threading.Thread(
                target=_collect_competitors_bg,
                args=(shop_id, platform_product_id, keyword),
                daemon=True,
            ).start()
            return _json(self, {"ok": True, "msg": "竞品采集已启动"})

        if path == "/api/competitors/confirm" and self.command == "POST":
            item = self._read_body()
            cid = int(item.get("id") or 0)
            status = item.get("status")
            if status not in ("ok", "no", "pending"):
                return _json(self, {"error": "status 无效"}, 400)
            ok = catalog.confirm_competitor(cid, status)
            return _json(self, {"ok": ok}, 200 if ok else 404)

        if path == "/api/buyer-reviews" and self.command == "GET":
            goods_id = qs.get("goods_id", [""])[0] or None
            return _json(self, {"items": catalog.list_buyer_reviews(goods_id)})

        if path == "/api/buyer-reviews/collect" and self.command == "POST":
            item = self._read_body()
            goods_id = str(item.get("goods_id") or "").strip()
            if not goods_id:
                return _json(self, {"error": "商品ID不能为空"}, 400)
            import threading
            threading.Thread(
                target=_collect_buyer_review_bg,
                args=(goods_id,),
                daemon=True,
            ).start()
            return _json(self, {"ok": True, "msg": "买家端评论提取已启动"})

        if path == "/api/buyer-reviews/collect-full" and self.command == "POST":
            item = self._read_body()
            goods_id = str(item.get("goods_id") or "").strip()
            target = int(item.get("target") or 200)
            if not goods_id:
                return _json(self, {"error": "商品ID不能为空"}, 400)
            import threading
            threading.Thread(
                target=_collect_comments_full_bg,
                args=(goods_id, target),
                daemon=True,
            ).start()
            return _json(self, {"ok": True, "msg": "评论全文采集已启动"})

        if path == "/api/catalog/low-stock" and self.command == "GET":
            threshold = int(qs.get("threshold", ["10"])[0] or 10)
            return _json(self, {"items": catalog.low_stock(threshold)})

        if path == "/api/catalog/freight" and self.command == "GET":
            month = qs.get("month", [""])[0] or None
            shop_id = qs.get("shop_id", [""])[0]
            sid = int(shop_id) if shop_id else None
            return _json(self, catalog.freight_analysis(month, sid))

        if path == "/api/catalog/freight/list" and self.command == "GET":
            unmatched = qs.get("unmatched", ["0"])[0] == "1"
            limit = int(qs.get("limit", ["5000"])[0] or 5000)
            return _json(self, {"items": catalog.list_freight(limit, unmatched)})

        if path == "/api/catalog/freight/match" and self.command == "POST":
            return _json(self, catalog.match_freight())

        if path == "/api/catalog/freight/match-analysis" and self.command == "GET":
            month = qs.get("month", [""])[0] or None
            shop_id = qs.get("shop_id", [""])[0]
            sid = int(shop_id) if shop_id else None
            return _json(self, catalog.freight_match_analysis(month, sid))

        if path == "/api/catalog/freight-rate" and self.command == "GET":
            return _json(self, {"items": catalog.list_freight_rate()})

        if path == "/api/catalog/freight-compare" and self.command == "GET":
            month = qs.get("month", [""])[0] or None
            return _json(self, catalog.freight_compare(month))

        if path == "/api/freight/order-detail" and self.command == "GET":
            order_no = qs.get("order_no", [""])[0] or None
            tracking_no = qs.get("tracking_no", [""])[0] or None
            return _json(self, catalog.freight_order_detail(order_no, tracking_no))

        if path == "/api/freight/by-date" and self.command == "GET":
            date = qs.get("date", [""])[0] or None
            return _json(self, {"items": catalog.list_freight_by_date(date)})

        if path == "/api/freight/calc" and self.command == "GET":
            province = qs.get("province", [""])[0] or ""
            city = qs.get("city", [""])[0] or ""
            weight_str = qs.get("weight", [""])[0] or ""
            try:
                weight = float(weight_str)
            except ValueError:
                return _json(self, {"error": "重量无效"}, 400)
            calc = catalog.calc_freight(province, city, weight)
            if calc is None:
                return _json(self, {"ok": False, "error": "未匹配到报价单地区"}, 400)
            return _json(self, {"ok": True, **calc})

        if path == "/api/freight/rebuild-weights" and self.command == "POST":
            return _json(self, {"ok": True, **catalog.rebuild_sku_weights()})

        if path == "/api/catalog/suppliers" and self.command == "GET":
            return _json(self, {"items": catalog.list_suppliers()})

        if path == "/api/catalog/supplier-products" and self.command == "GET":
            supplier_id = qs.get("supplier_id", [""])[0]
            q = qs.get("q", [""])[0]
            sid = int(supplier_id) if supplier_id else None
            return _json(self, {"items": catalog.list_supplier_products(sid, q)})

        if path == "/api/catalog/supplier-import" and self.command == "POST":
            body = self._read_body()
            csv_text = body.get("csv", "")
            if not csv_text.strip():
                return _json(self, {"error": "CSV 内容为空"}, 400)
            try:
                result = catalog.import_supplier_csv(csv_text)
            except Exception as e:
                return _json(self, {"error": str(e)}, 500)
            return _json(self, {"ok": True, **result})

        if path == "/api/catalog/export" and self.command == "GET":
            etype = qs.get("type", ["products"])[0]
            try:
                filename, content = catalog.export_csv(etype)
            except ValueError as e:
                return _json(self, {"error": str(e)}, 400)
            body = content.encode("utf-8-sig")
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{quote(filename)}")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if path == "/api/catalog/import" and self.command == "POST":
            body = self._read_body()
            etype = body.get("type", "")
            shop_id = int(body.get("shop_id") or 0)
            fmt = (body.get("format") or "csv").lower()
            try:
                if fmt == "xlsx":
                    result = catalog.import_xlsx(etype, shop_id, body.get("data", ""))
                else:
                    result = catalog.import_csv(etype, shop_id, body.get("csv", ""))
                return _json(self, {"ok": True, **result})
            except ValueError as e:
                return _json(self, {"ok": False, "error": str(e)}, 400)
            except Exception as e:
                return _json(self, {"ok": False, "error": str(e)}, 500)

        if path == "/api/catalog/template" and self.command == "GET":
            etype = qs.get("type", ["products"])[0]
            try:
                filename, content = catalog.template_csv(etype)
            except ValueError as e:
                return _json(self, {"error": str(e)}, 400)
            body = content.encode("utf-8-sig")
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{quote(filename)}")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # 修改记录（不改动原始商品/SKU，仅记录待导出）
        if path == "/api/catalog/modifications" and self.command == "POST":
            item = self._read_body()
            shop_id = int(item.get("shop_id") or 0)
            platform_product_id = (item.get("platform_product_id") or "").strip()
            platform_sku_id = (item.get("platform_sku_id") or "").strip()
            field = (item.get("field") or "").strip()
            new_value = item.get("new_value")
            new_value = "" if new_value is None else str(new_value).strip()
            if not shop_id or not platform_product_id or not field:
                return _json(self, {"error": "参数不完整"}, 400)
            if field not in ("title", "code", "dan_price", "pin_price", "stock"):
                return _json(self, {"error": f"非法字段: {field}"}, 400)
            if field in ("dan_price", "pin_price", "stock") and not platform_sku_id:
                return _json(self, {"error": "价格/库存修改需要 SKUID"}, 400)
            ok = catalog.add_modification(shop_id, platform_product_id, field, new_value, platform_sku_id)
            return _json(self, {"ok": ok, "count": catalog.modification_count(shop_id)})

        if path == "/api/catalog/modifications" and self.command == "GET":
            shop_id = qs.get("shop_id", [None])[0]
            return _json(self, {"items": catalog.list_modifications(int(shop_id) if shop_id else None)})

        if path == "/api/catalog/modifications/counts" and self.command == "GET":
            shop_id = qs.get("shop_id", [None])[0]
            return _json(self, catalog.modification_counts(int(shop_id) if shop_id else None))

        if path == "/api/catalog/modifications/mark-done" and self.command == "POST":
            item = self._read_body()
            field = (item.get("field") or "").strip()
            shop_id = int(item.get("shop_id") or 0)
            if field not in ("title", "code", "price", "stock"):
                return _json(self, {"error": f"非法字段: {field}"}, 400)
            n = catalog.mark_modifications_done(field, shop_id or None)
            return _json(self, {"ok": True, "done": n})

        if path == "/api/catalog/modifications/clear" and self.command == "POST":
            shop_id = qs.get("shop_id", [None])[0]
            n = catalog.clear_modifications(int(shop_id) if shop_id else None)
            return _json(self, {"ok": True, "cleared": n})

        if path.startswith("/api/catalog/modifications/") and self.command == "DELETE":
            mid = int(path.split("/")[-1])
            ok = catalog.delete_modification(mid)
            return _json(self, {"ok": ok}, 200 if ok else 404)

        # 商品访问明细（拼多多商品数据·商品明细）
        if path == "/api/catalog/goods-effect" and self.command == "GET":
            return _json(self, {"items": catalog.list_goods_effect()})

        if path == "/api/catalog/goods-effect/collect" and self.command == "POST":
            import subprocess
            script = os.path.join(BASE_DIR, "collect_goods_effect.py")
            py = "/home/xiaolin/projects/aa-books/backend/.venv/bin/python"
            try:
                _body = self._read_body()
            except Exception:
                _body = {}
            shop_id = _body.get("shop_id") if isinstance(_body, dict) else None
            cmd = [py, script] + ([str(shop_id)] if shop_id else [])
            try:
                r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
                lines = [ln for ln in (r.stdout or "").strip().splitlines() if ln.strip().startswith("{")]
                if lines:
                    return _json(self, json.loads(lines[-1]))
                return _json(self, {"ok": False, "error": (r.stderr or r.stdout or "无输出")[:300]}, 500)
            except subprocess.TimeoutExpired:
                return _json(self, {"ok": False, "error": "采集超时（180s）"}, 500)
            except Exception as e:
                return _json(self, {"ok": False, "error": str(e)}, 500)

        # 标题优化（挑选无订单商品 + 优化标题 + 效果跟踪）
        if path == "/api/catalog/title-opt/candidates" and self.command == "GET":
            shop_id = int(qs.get("shop_id", [0])[0] or 0)
            q = qs.get("q", [""])[0]
            if not shop_id:
                return _json(self, {"error": "shop_id required"}, 400)
            return _json(self, {"items": catalog.title_opt_candidates(shop_id, q or None)})

        if path == "/api/catalog/title-opt" and self.command == "GET":
            shop_id = qs.get("shop_id", [None])[0]
            return _json(self, {"items": catalog.list_title_opt(int(shop_id) if shop_id else None)})

        if path == "/api/catalog/title-opt" and self.command == "POST":
            item = self._read_body()
            shop_id = int(item.get("shop_id") or 0)
            platform_product_id = (item.get("platform_product_id") or "").strip()
            if not shop_id or not platform_product_id:
                return _json(self, {"error": "参数不完整"}, 400)
            rid = catalog.add_title_opt(shop_id, platform_product_id, source="manual")
            if rid == -1:
                return _json(self, {"error": "该商品已有订单，标题不动"}, 400)
            if rid is None:
                return _json(self, {"error": "商品不存在"}, 404)
            return _json(self, {"ok": True, "id": rid})

        if path == "/api/catalog/title-opt/update" and self.command == "POST":
            item = self._read_body()
            opt_id = int(item.get("id") or 0)
            new_title = item.get("new_title")
            status = item.get("status")
            note = item.get("note")
            if not opt_id:
                return _json(self, {"error": "id required"}, 400)
            ok = catalog.update_title_opt(opt_id, new_title, status, note, source="manual")
            return _json(self, {"ok": ok})

        if path == "/api/catalog/title-opt/baseline" and self.command == "POST":
            item = self._read_body()
            opt_id = int(item.get("id") or 0)
            if not opt_id:
                return _json(self, {"error": "id required"}, 400)
            bl = catalog.save_title_opt_baseline(opt_id)
            return _json(self, {"ok": True, "baseline": bl})

        if path == "/api/catalog/title-opt/fix" and self.command == "POST":
            item = self._read_body()
            opt_id = int(item.get("id") or 0)
            if not opt_id:
                return _json(self, {"error": "id required"}, 400)
            ok = catalog.mark_title_opt_fixed(opt_id)
            return _json(self, {"ok": ok})

        if path == "/api/catalog/title-opt/fix-batch" and self.command == "POST":
            item = self._read_body()
            ids = item.get("ids") or []
            if not ids:
                return _json(self, {"error": "ids required"}, 400)
            try:
                ids = [int(x) for x in ids]
            except (TypeError, ValueError):
                return _json(self, {"error": "非法 id"}, 400)
            n = catalog.mark_title_opt_fixed_batch(ids)
            return _json(self, {"ok": True, "count": n})

        if path == "/api/catalog/title-opt/apply" and self.command == "POST":
            import threading
            item = self._read_body()
            ids = item.get("ids") or []
            if not ids:
                return _json(self, {"error": "ids required"}, 400)
            try:
                ids = [int(x) for x in ids]
            except (TypeError, ValueError):
                return _json(self, {"error": "非法 id"}, 400)
            recs = catalog.get_title_opt_by_ids(ids)
            todo = []
            skipped_order = 0
            for r in recs:
                if not (r.get("new_title") and r.get("status") != "done"):
                    continue
                if catalog.has_order(r["shop_id"], r["platform_product_id"]):
                    catalog.update_title_opt(r["id"], note="已出单，跳过")
                    catalog.log_title_opt(r["shop_id"], r["platform_product_id"], r["product_name"], r["old_title"], r["new_title"], "apply", "skip", "已出单，跳过")
                    skipped_order += 1
                    continue
                todo.append(r)
            if not todo:
                msg = "没有可执行记录" + ("（" + str(skipped_order) + " 个已出单跳过）" if skipped_order else "（需已优化且未生效）")
                return _json(self, {"ok": False, "error": msg}, 400)
            shops = {r["shop_id"] for r in todo}
            if len(shops) > 1:
                return _json(self, {"error": "一次只能执行同一店铺的商品"}, 400)
            shop_id = todo[0]["shop_id"]
            port = SHOP_CDP_PORT.get(shop_id)
            if not port:
                return _json(self, {"error": f"店铺 {shop_id} 未配置 CDP 端口"}, 400)
            for r in todo:
                catalog.update_title_opt(r["id"], note="执行中…")
            threading.Thread(target=_apply_titles_bg, args=(todo, port), daemon=True).start()
            return _json(self, {"ok": True, "started": True, "count": len(todo), "skipped_order": skipped_order, "shop_id": shop_id})

        if path == "/api/catalog/title-opt/log" and self.command == "GET":
            shop_id = qs.get("shop_id", [None])[0]
            limit = int(qs.get("limit", [200])[0] or 200)
            return _json(self, {"items": catalog.list_title_opt_log(int(shop_id) if shop_id else None, limit)})

        if path.startswith("/api/catalog/title-opt/") and self.command == "DELETE":
            try:
                opt_id = int(path.split("/")[-1])
                catalog.delete_title_opt(opt_id)
                return _json(self, {"ok": True})
            except ValueError:
                return _json(self, {"error": "非法 id"}, 400)

        # ------------------------- 一键上架 pipeline -------------------------
        if path == "/api/autopublish" and self.command == "POST":
            import threading
            item = self._read_body()
            url = _extract_1688_url(item.get("url"))
            shop_id = int(item.get("shop_id") or 5)
            pricing = item.get("pricing") or {}
            if not url:
                return _json(self, {"error": "请填写 1688 商品链接"}, 400)
            task = catalog.create_autopublish_task(url, shop_id)
            threading.Thread(target=_autopublish_bg, args=(task["id"], pricing), daemon=True).start()
            return _json(self, {"ok": True, "task": task})

        if path == "/api/autopublish/batch" and self.command == "POST":
            import threading
            item = self._read_body()
            # 支持两种输入：urls 数组 或 text 多行文本（每行一个链接/口令）
            raw = item.get("urls") or []
            if isinstance(raw, str):
                raw = [raw]
            text = str(item.get("text") or "").strip()
            lines = list(raw) + [l for l in text.splitlines() if l.strip()]
            shop_ids = item.get("shop_ids") or []
            if isinstance(shop_ids, (int, str)):
                shop_ids = [int(shop_ids)]
            else:
                shop_ids = [int(s) for s in shop_ids if str(s).isdigit()]
            if not shop_ids:
                shop_ids = [5]
            pricing = item.get("pricing") or {}
            # 逐行解析 URL（去重、保持顺序）
            urls = []
            for l in lines:
                u = _extract_1688_url(l)
                if u and u not in urls:
                    urls.append(u)
            if not urls:
                return _json(self, {"error": "未识别到有效的 1688 链接"}, 400)
            # 生成 url × shop 任务清单并逐个启动（并发控制靠 scrape/publish 锁，见 _SCRAPE_LOCK/_shop_lock）
            tasks = []
            for u in urls:
                for sid in shop_ids:
                    t = catalog.create_autopublish_task(u, sid)
                    tasks.append(t)
                    threading.Thread(target=_autopublish_bg, args=(t["id"], pricing), daemon=True).start()
            return _json(self, {"ok": True, "tasks": tasks, "count": len(tasks),
                                "urls": len(urls), "shops": len(shop_ids)})

        if path == "/api/autopublish/verify" and self.command == "POST":
            # 回查 submitted（已提交待审核）商品在拼多多后台的真实状态，更新为 published/draft/failed
            item = self._read_body()
            shop_id = int(item.get("shop_id") or 1)
            port = SHOP_CDP_PORT.get(shop_id)
            if not port:
                return _json(self, {"error": f"店铺 {shop_id} 未配置 CDP 端口"}, 400)
            tasks = catalog.list_autopublish_tasks(300)
            pending = [t for t in tasks if t.get("shop_id") == shop_id
                       and t.get("status") in ("submitted", "published", "draft")
                       and t.get("pdd_goods_id")]
            ids = [str(t["pdd_goods_id"]) for t in pending]
            if not ids:
                return _json(self, {"ok": True, "verified": 0, "message": "无待回查商品"})
            res = _run_node_script("verify_publish.js", [str(port), ",".join(ids)], timeout=150)
            statuses = (res.get("data") or {}).get("statuses") or {}
            verified = 0
            changed = []
            for t in pending:
                gid = str(t["pdd_goods_id"])
                real = statuses.get(gid)
                if not real:
                    continue
                verified += 1
                if real == "published":
                    if t.get("status") != "published":
                        catalog.update_autopublish_task(t["id"], status="published")
                        catalog.save_published_good(goods_id=gid, status="published", remark="回查确认在售")
                        changed.append({"goods_id": gid, "from": t["status"], "to": "published"})
                elif real == "draft":
                    if t.get("status") != "draft":
                        catalog.update_autopublish_task(t["id"], status="draft")
                        catalog.save_published_good(goods_id=gid, status="draft", remark="回查确认草稿")
                        changed.append({"goods_id": gid, "from": t["status"], "to": "draft"})
                else:  # offshelf / soldout / rejected / missing
                    if t.get("status") != "failed":
                        catalog.update_autopublish_task(t["id"], status="failed",
                                                         error=f"回查确认未上架({real})")
                        catalog.save_published_good(goods_id=gid, status="failed",
                                                     remark=f"回查确认未上架({real})")
                        changed.append({"goods_id": gid, "from": t["status"], "to": f"failed({real})"})
            return _json(self, {"ok": True, "verified": verified, "changed": changed,
                                "statuses": statuses})

        if path.startswith("/api/autopublish/") and path.endswith("/republish") and self.command == "POST":
            # 历史失败/草稿任务一键重新上架：先回查该商品是否已在售（避免重复上架），未上架才重跑全流程
            import threading
            mid = path[len("/api/autopublish/"):-len("/republish")]
            if not mid.isdigit():
                return _json(self, {"error": "任务ID无效"}, 400)
            task_id = int(mid)
            task = catalog.get_autopublish_task(task_id)
            if not task:
                return _json(self, {"error": "任务不存在"}, 404)
            shop_id = task.get("shop_id") or 5
            gid = str(task.get("pdd_goods_id") or "").strip()
            # 1. 已有商品ID → 先回查真实在售状态，在售则不再重上架
            if gid:
                port = SHOP_CDP_PORT.get(shop_id)
                if port:
                    try:
                        res = _run_node_script("verify_publish.js", [str(port), gid], timeout=150)
                        statuses = (res.get("data") or {}).get("statuses") or {}
                        real = statuses.get(gid)
                        if real == "published":
                            catalog.update_autopublish_task(task_id, status="published")
                            catalog.save_published_good(goods_id=gid, status="published",
                                                         remark="重新上架回查：已在售")
                            catalog.append_autopublish_log(task_id, "publish", "done",
                                                           f"✅ 回查已在售（商品ID {gid}），无需重上架")
                            return _json(self, {"ok": True, "already": True, "status": "published",
                                                "message": "商品已在售，无需重新上架"})
                        catalog.append_autopublish_log(task_id, "publish", "done",
                                                       f"回查状态 {real}，继续重新上架")
                    except Exception as e:
                        catalog.append_autopublish_log(task_id, "publish", "done",
                                                       f"回查失败({e})，继续重新上架")
            # 2. 重置任务并完整重跑（scrape→ai→publish，新类目映射自动生效）
            catalog.update_autopublish_task(task_id, status="queued", stage="", error="")
            catalog.append_autopublish_log(task_id, "scrape", "running", "🔄 手动重新上架：开始完整重跑…")
            threading.Thread(target=_autopublish_bg, args=(task_id, None), daemon=True).start()
            return _json(self, {"ok": True, "already": False,
                                "task": catalog.get_autopublish_task(task_id),
                                "message": "已启动重新上架"})

        # CDP 实例管理：查状态 + 手动重启（页面「CDP 实例」卡片用）
        if path == "/api/cdp/status" and self.command == "GET":
            return _json(self, {"instances": _cdp_status_all()})

        if path == "/api/cdp/restart" and self.command == "POST":
            item = self._read_body()
            try:
                port = int(item.get("port") or 0)
            except (TypeError, ValueError):
                port = 0
            if not port:
                return _json(self, {"error": "缺少端口号"}, 400)
            res = _cdp_restart(port)
            return _json(self, res, 200 if res.get("ok") else 400)

        if path == "/api/autopublish" and self.command == "GET":
            limit = int(qs.get("limit", ["50"])[0] or 50)
            items = catalog.list_autopublish_tasks(limit)
            # 为 publishing 状态的任务附上实时细粒度进度，让批量列表直接显示每个任务当前步骤
            for it in items:
                if it.get("status") == "publishing":
                    it["publish_progress"] = _read_publish_progress(it["id"])
            return _json(self, {"items": items})

        if path.startswith("/api/autopublish/") and self.command == "GET":
            try:
                task_id = int(path.rsplit("/", 1)[-1])
            except ValueError:
                return _json(self, {"error": "非法 id"}, 400)
            task = catalog.get_autopublish_task(task_id)
            if not task:
                return _json(self, {"error": "任务不存在"}, 404)
            task["log"] = json.loads(task.get("log") or "[]")
            task["skus"] = json.loads(task.get("skus") or "[]")
            task["images"] = json.loads(task.get("images") or "[]")
            # publish 阶段的实时细粒度进度（publish.js 写进 config.publish.log 的 [N/8] 步骤）
            task["publish_progress"] = _read_publish_progress(task_id)
            return _json(self, task)

        if path == "/api/category-map" and self.command == "GET":
            items = [{"keyword": kw, "category_path": cp, "category_keyword": ck}
                     for kw, cp, ck in data.CATEGORY_MAP]
            return _json(self, {"items": items})

        if path == "/api/published-goods" and self.command == "GET":
            shop_id = qs.get("shop_id", [""])[0]
            status = qs.get("status", [""])[0]
            shop_id = int(shop_id) if str(shop_id).isdigit() and shop_id else None
            return _json(self, {"items": catalog.list_published_goods(
                shop_id=shop_id, status=(status or None))})

        if path == "/api/published-goods/image" and self.command == "GET":
            return self._serve_pdd_image(qs.get("path", [""])[0])

        # ------------------------- AI老板经营台账（独立记账，不混现有系统） -------------------------
        if path == "/api/aiboss" and self.command == "GET":
            return _json(self, {
                "items": catalog.list_ai_boss_items(),
                "orders": catalog.list_ai_boss_orders(),
                "summary": catalog.ai_boss_summary(),
            })

        if path == "/api/aiboss/items" and self.command == "POST":
            item = self._read_body()
            title = str(item.get("title") or "").strip()
            if not title:
                return _json(self, {"error": "请填商品标题"}, 400)
            r = catalog.add_ai_boss_item(
                title=title,
                source_url=str(item.get("source_url") or "").strip(),
                cost=float(item.get("cost") or 0),
                sale_price=float(item.get("sale_price") or 0),
                note=str(item.get("note") or "").strip(),
            )
            return _json(self, {"ok": True, "item": r})

        if path.startswith("/api/aiboss/items/") and self.command == "POST":
            try:
                item_id = int(path.rstrip("/").rsplit("/", 1)[-1])
            except ValueError:
                return _json(self, {"error": "非法 id"}, 400)
            item = self._read_body()
            action = str(item.get("_action") or "update")
            if action == "delete":
                catalog.delete_ai_boss_item(item_id)
                return _json(self, {"ok": True})
            fields = {}
            for k in ("title", "source_url", "cost", "sale_price", "status", "note"):
                if k in item:
                    fields[k] = item[k]
            r = catalog.update_ai_boss_item(item_id, **fields)
            return _json(self, {"ok": True, "item": r})

        if path == "/api/aiboss/orders" and self.command == "POST":
            item = self._read_body()
            title = str(item.get("title") or "").strip()
            if not title:
                return _json(self, {"error": "请填商品标题"}, 400)
            r = catalog.add_ai_boss_order(
                item_id=item.get("item_id"),
                title=title,
                qty=int(item.get("qty") or 1),
                cost=float(item.get("cost") or 0),
                sale_price=float(item.get("sale_price") or 0),
                freight=float(item.get("freight") or 0),
                note=str(item.get("note") or "").strip(),
            )
            return _json(self, {"ok": True, "order": r})

        if path.startswith("/api/aiboss/orders/") and self.command == "POST":
            # 填单号 = 真实发货（profit 已在出单时由后端算好，这里只记单号+改状态）
            parts = path.rstrip("/").split("/")
            try:
                order_id = int(parts[-1])
            except ValueError:
                return _json(self, {"error": "非法 id"}, 400)
            item = self._read_body()
            tracking_no = str(item.get("tracking_no") or "").strip()
            if not tracking_no:
                return _json(self, {"error": "请填单号"}, 400)
            r = catalog.fill_ai_boss_tracking(order_id, tracking_no)
            return _json(self, {"ok": True, "order": r})

        # ------------------------- AI老板数据闭环 + 规则引擎（系统当董事会） -------------------------
        if path == "/api/aiboss/dashboard" and self.command == "GET":
            return _json(self, {
                "daily": catalog.list_ai_boss_daily(days=30),
                "keywords": catalog.list_ai_boss_keywords(days=7),
                "actions": catalog.list_ai_boss_actions(limit=50),
                "rules": ai_boss_engine.evaluate_rules(),
            })

        if path == "/api/aiboss/daily" and self.command == "POST":
            item = self._read_body()
            rows = item.get("rows") or [item]
            cnt = 0
            for r in rows:
                gid = str(r.get("goods_id") or "").strip()
                if not gid:
                    continue
                catalog.upsert_ai_boss_daily(
                    goods_id=gid,
                    goods_name=str(r.get("goods_name") or "").strip(),
                    stat_date=str(r.get("stat_date") or "").strip(),
                    visitor_cnt=int(r.get("visitor_cnt") or 0),
                    page_view_cnt=int(r.get("page_view_cnt") or 0),
                    pay_buyer_cnt=int(r.get("pay_buyer_cnt") or 0),
                    pay_order_cnt=int(r.get("pay_order_cnt") or 0),
                    pay_amount=float(r.get("pay_amount") or 0),
                    pay_rate=float(r.get("pay_rate") or 0),
                    collect_cnt=int(r.get("collect_cnt") or 0),
                )
                cnt += 1
            return _json(self, {"ok": True, "imported": cnt})

        if path == "/api/aiboss/keywords" and self.command == "POST":
            item = self._read_body()
            rows = item.get("rows") or [item]
            cnt = 0
            for r in rows:
                gid = str(r.get("goods_id") or "").strip()
                kw = str(r.get("keyword") or "").strip()
                if not gid or not kw:
                    continue
                catalog.upsert_ai_boss_keyword(
                    goods_id=gid,
                    keyword=kw,
                    stat_date=str(r.get("stat_date") or "").strip(),
                    pay_order_cnt=int(r.get("pay_order_cnt") or 0),
                    pay_amount=float(r.get("pay_amount") or 0),
                    pay_rate=float(r.get("pay_rate") or 0),
                )
                cnt += 1
            return _json(self, {"ok": True, "imported": cnt})

        if path == "/api/aiboss/action" and self.command == "POST":
            item = self._read_body()
            r = catalog.add_ai_boss_action(
                goods_id=str(item.get("goods_id") or "").strip(),
                goods_name=str(item.get("goods_name") or "").strip(),
                action_type=str(item.get("action_type") or "").strip(),
                action_detail=str(item.get("action_detail") or "").strip(),
                trigger_rule=str(item.get("trigger_rule") or "").strip(),
                status=str(item.get("status") or "proposed").strip(),
            )
            return _json(self, {"ok": True, "action": r})

        if path.startswith("/api/aiboss/action/") and self.command == "POST":
            try:
                aid = int(path.rstrip("/").rsplit("/", 1)[-1])
            except ValueError:
                return _json(self, {"error": "非法 id"}, 400)
            item = self._read_body()
            fields = {}
            for k in ("status", "verify_status", "verify_detail", "action_detail"):
                if k in item:
                    fields[k] = item[k]
            r = catalog.update_ai_boss_action(aid, **fields)
            return _json(self, {"ok": True, "action": r})

        if path == "/api/aiboss/collect" and self.command == "POST":
            # 触发 CDP 采集商品经营数据（后台线程，避免阻塞请求）
            item = self._read_body()
            port = str(item.get("port") or "9232")

            def _collect_bg():
                try:
                    import aiboss_collect
                    n = aiboss_collect.collect(port)
                    print(f"[aiboss] 采集完成，导入 {n} 条")
                except Exception as e:
                    print(f"[aiboss] 采集失败: {e}")

            threading.Thread(target=_collect_bg, daemon=True).start()
            return _json(self, {"ok": True, "message": "采集已启动（后台运行，约30秒完成）"})

        if path == "/api/aiboss/execute" and self.command == "POST":
            # 执行规则动作（复用已有 CDP 能力：改标题走 pdd_set_titles.js，下架需人工）
            import threading
            item = self._read_body()
            gid = str(item.get("goods_id") or "").strip()
            action_type = str(item.get("action_type") or "").strip()
            if not gid or not action_type:
                return _json(self, {"error": "缺 goods_id 或 action_type"}, 400)
            threading.Thread(target=_execute_aiboss_action_bg, args=(gid, action_type, item), daemon=True).start()
            return _json(self, {"ok": True, "started": True, "action_type": action_type})

        if path == "/api/aiboss/log" and self.command == "GET":
            limit = int(qs.get("limit", [50])[0] or 50)
            return _json(self, {"items": catalog.list_ai_boss_log(limit)})

        if path == "/api/aiboss/run-daily" and self.command == "POST":
            # 手动触发一次 AI 老板工作流（采集→评估→执行→写日志，后台线程）
            import threading
            item = self._read_body()
            args = []
            if item.get("no_collect"):
                args.append("--no-collect")
            if item.get("no_execute"):
                args.append("--no-execute")
            if item.get("dry_run"):
                args.append("--dry-run")

            def _daily_bg():
                try:
                    import ai_boss_daily
                    r = ai_boss_daily.main(args)
                    print(f"[aiboss] 每日工作流完成: {r.get('summary', '')}")
                except Exception as e:
                    print(f"[aiboss] 每日工作流失败: {e}")

            threading.Thread(target=_daily_bg, daemon=True).start()
            return _json(self, {"ok": True, "message": "AI 老板工作流已启动（后台运行，约1-2分钟）"})

        if path == "/api/aiboss/research" and self.command == "POST":
            # AI 老板选品研究：调 DeepSeek 生成「该卖什么 + 关键词 + 注意事项 + 建议」，后台线程写库
            import threading

            def _research_bg():
                try:
                    import aiboss_research
                    content = aiboss_research.research()
                    if isinstance(content, dict) and content.get("error"):
                        catalog.add_ai_boss_log(
                            work_date=datetime.now().strftime("%Y-%m-%d"), trigger_type="research",
                            summary=f"选品研究失败：{content['error']}", status="failed")
                        print(f"[aiboss] 选品研究失败: {content['error']}")
                        return
                    work_date = datetime.now().strftime("%Y-%m-%d")
                    catalog.add_ai_boss_research(content, work_date)
                    catalog.add_ai_boss_log(
                        work_date=work_date, trigger_type="research",
                        summary="选品研究完成（该卖什么 + 关键词 + 注意事项 + 建议）", status="success")
                    print(f"[aiboss] 选品研究完成，{len(content)} 字")
                except Exception as e:
                    print(f"[aiboss] 选品研究失败: {e}")

            threading.Thread(target=_research_bg, daemon=True).start()
            return _json(self, {"ok": True, "message": "选品研究已启动（后台运行，约30-60秒）"})

        if path == "/api/aiboss/research" and self.command == "GET":
            return _json(self, {"items": catalog.list_ai_boss_research(limit=10)})

        # 静态页面
        if path in ("/", "/index.html") and self.command == "GET":
            return self._serve_file("index.html", "text/html; charset=utf-8")
        if path in ("/app.js",) and self.command == "GET":
            return self._serve_file("app.js", "text/javascript; charset=utf-8")
        if path in ("/style.css",) and self.command == "GET":
            return self._serve_file("style.css", "text/css; charset=utf-8")

        # 静态资源（供应商产品图片等）
        if path.startswith("/static/") and self.command == "GET":
            return self._serve_static(path)

        return _json(self, {"error": "not found", "path": path}, 404)

    def _serve_static(self, path):
        """服务 static/ 目录下的文件（含图片），防路径穿越。"""
        rel = os.path.normpath(path.lstrip("/"))
        if rel != path.lstrip("/") or not rel.startswith("static/"):
            return _json(self, {"error": "forbidden"}, 403)
        fp = os.path.join(BASE_DIR, rel)
        if not os.path.exists(fp) or os.path.isdir(fp):
            return _json(self, {"error": "file not found"}, 404)
        ext = os.path.splitext(fp)[1].lower()
        ctype = {
            ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
        }.get(ext, "application/octet-stream")
        with open(fp, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_pdd_image(self, img_path):
        """服务 C:\\tmp\\pdd-publish 下的商品图（本地抓取图），防路径穿越。"""
        norm = (img_path or "").replace("\\", "/")
        if not norm.lower().startswith("c:/tmp/pdd-publish/"):
            return _json(self, {"error": "forbidden"}, 403)
        # api.py 跑在 WSL，读 Windows 文件要映射到 /mnt/c/...
        wsl_path = "/mnt/c" + norm[2:]  # C:/tmp/... → /mnt/c/tmp/...
        if not os.path.exists(wsl_path) or os.path.isdir(wsl_path):
            return _json(self, {"error": "not found"}, 404)
        ext = os.path.splitext(wsl_path)[1].lower()
        ctype = {
            ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".gif": "image/gif", ".webp": "image/webp",
        }.get(ext, "image/jpeg")
        with open(wsl_path, "rb") as f:
            body = f.read()
        # 内容嗅探：图片文件扩展名可能与实际格式不符（如 WebP 存成 .jpg），按魔数修正 Content-Type
        if body[:3] == b"\xff\xd8\xff":
            ctype = "image/jpeg"
        elif body[:8] == b"\x89PNG\r\n\x1a\n":
            ctype = "image/png"
        elif body[:4] == b"RIFF" and body[8:12] == b"WEBP":
            ctype = "image/webp"
        elif body[:6] in (b"GIF89a", b"GIF87a"):
            ctype = "image/gif"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "max-age=86400")
        self.end_headers()
        self.wfile.write(body)

    def _serve_file(self, rel, content_type):
        fp = os.path.join(BASE_DIR, rel)
        if not os.path.exists(fp):
            return _json(self, {"error": "file not found"}, 404)
        with open(fp, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def send_response(self, code, message=None):
        super().send_response(code, message)
        self._cors()

    def do_GET(self):
        try:
            self._route()
        except Exception as exc:
            print("ERR", exc)
            try:
                _json(self, {"error": str(exc)}, 500)
            except Exception:
                pass

    def do_POST(self):
        try:
            self._route()
        except Exception as exc:
            print("ERR", exc)
            try:
                _json(self, {"error": str(exc)}, 500)
            except Exception:
                pass

    def do_DELETE(self):
        try:
            self._route()
        except Exception as exc:
            print("ERR", exc)
            try:
                _json(self, {"error": str(exc)}, 500)
            except Exception:
                pass

    def do_PUT(self):
        try:
            self._route()
        except Exception as exc:
            print("ERR", exc)
            try:
                _json(self, {"error": str(exc)}, 500)
            except Exception:
                pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()


_APPLY_LOCK = __import__("threading").Lock()  # 全局锁：串行化 node 执行，避免并发 apply 争抢 CDP 导致 node 连接失败（2026-09-25 实测：两店并发时闲时来全"无结果"）


def _apply_titles_bg(todo, port):
    """后台线程：分批（每批10个）调 node 脚本改标题，回写 title_opt 状态。"""
    # 执行前二次核对：有出单的跳过（弥补挑选→执行之间的异步时间差）
    todo = [r for r in todo if not catalog.has_order(r["shop_id"], r["platform_product_id"])]
    if not todo:
        return
    with _APPLY_LOCK:
        _apply_titles_bg_locked(todo, port)


def _apply_titles_bg_locked(todo, port):
    BATCH = 10
    for i in range(0, len(todo), BATCH):
        _apply_batch(todo[i:i + BATCH], port)


def _apply_batch(batch, port):
    """执行一批（≤10个）商品：写清单→跑 node→解析结果→回写状态。"""
    import subprocess
    import time
    ts = int(time.time())
    base = f"pdd_apply_{ts}.json"
    wsl_path = f"/mnt/c/tmp/{base}"
    win_path = f"C:\\tmp\\{base}"
    items = [{"gid": r["platform_product_id"], "title": r["new_title"]} for r in batch]
    try:
        with open(wsl_path, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False)
    except Exception as e:
        for r in batch:
            catalog.update_title_opt(r["id"], note=f"清单写入失败:{e}")
            catalog.log_title_opt(r["shop_id"], r["platform_product_id"], r["product_name"], r["old_title"], r["new_title"], "apply", "fail", f"清单写入失败:{e}")
        return
    try:
        r = subprocess.run(
            [NODE_EXE, PDD_SET_TITLE_JS, str(port), win_path],
            capture_output=True, timeout=max(300, len(batch) * 50 + 60),
        )
        out = r.stdout.decode("utf-8", errors="replace").strip()
        results = []
        for line in out.splitlines():
            line = line.strip()
            if line.startswith("["):
                try:
                    results = json.loads(line)
                except Exception:
                    pass
        by_gid = {str(x.get("gid")): x for x in results}
        for rec in batch:
            gid = str(rec["platform_product_id"])
            res = by_gid.get(gid)
            if not res:
                catalog.update_title_opt(rec["id"], note="无结果")
                catalog.log_title_opt(rec["shop_id"], gid, rec["product_name"], rec["old_title"], rec["new_title"], "apply", "fail", "无结果")
                continue
            st = res.get("status", "")
            if st == "VERIFIED":
                catalog.update_title_opt(rec["id"], status="done", note="")
                catalog.log_title_opt(rec["shop_id"], gid, rec["product_name"], rec["old_title"], rec["new_title"], "apply", "success", "")
                # 落地闭环：改后台成功后回填标题用到的词（记录时间/商品，便于按时间追踪）
                try:
                    data.mark_keywords_used(rec["new_title"], rec["platform_product_id"])
                except Exception as _e:
                    print(f"[关键词回填失败] {rec['platform_product_id']}: {_e}", file=sys.stderr)
            else:
                catalog.update_title_opt(rec["id"], note=st)
                catalog.log_title_opt(rec["shop_id"], gid, rec["product_name"], rec["old_title"], rec["new_title"], "apply", "fail", st)
    except subprocess.TimeoutExpired:
        for rec in batch:
            catalog.update_title_opt(rec["id"], note="执行超时")
            catalog.log_title_opt(rec["shop_id"], rec["platform_product_id"], rec["product_name"], rec["old_title"], rec["new_title"], "apply", "fail", "执行超时")
    except Exception as e:
        for rec in batch:
            catalog.update_title_opt(rec["id"], note=f"执行异常:{e}")
            catalog.log_title_opt(rec["shop_id"], rec["platform_product_id"], rec["product_name"], rec["old_title"], rec["new_title"], "apply", "fail", f"执行异常:{e}")


def _execute_aiboss_action_bg(gid, action_type, item):
    """后台执行 AI 老板规则动作（复用已有 CDP 能力：改标题走 pdd_set_titles.js，下架需人工）。"""
    import json as _json
    # 1. 反查商品（shop_id + 当前标题）
    pg = catalog.find_published_goods_by_id(gid)
    shop_id = int(pg.get("shop_id") or 5)
    old_title = str(pg.get("ai_title") or pg.get("raw_title") or "").strip()
    goods_name = str(item.get("goods_name") or old_title or gid).strip()

    # 2. 写审计（executing）
    detail_raw = item.get("detail") or {}
    if not isinstance(detail_raw, str):
        detail_raw = _json.dumps(detail_raw, ensure_ascii=False)
    aid = catalog.add_ai_boss_action(
        goods_id=gid, goods_name=goods_name, action_type=action_type,
        action_detail=detail_raw,
        trigger_rule=str(item.get("rule") or ""), status="executing",
    )
    if not aid:
        print(f"[aiboss] 写审计失败 {gid}")
        return

    # 3. 下架：本系统无自动下架 CDP，标记需人工 + 更新商品状态为 offshelf
    if action_type == "offshelf":
        catalog.save_published_good(goods_id=gid, status="offshelf")
        catalog.update_ai_boss_action(aid, status="executed", verify_status="uncertain",
                                      verify_detail="人工确认下架（系统无自动下架验证）")
        print(f"[aiboss] 下架确认 {gid}")
        return

    # 4. 改标题（title_update / promote）：复用已有改标题链路
    port = SHOP_CDP_PORT.get(shop_id)
    if not port:
        catalog.update_ai_boss_action(aid, status="failed", verify_detail=f"店铺 {shop_id} 未配置 CDP 端口")
        return
    _execute_aiboss_title(gid, old_title, goods_name, aid, port, item.get("detail") or {})


def _execute_aiboss_title(gid, old_title, goods_name, aid, port, detail_raw):
    """生成新标题（DeepSeek，复用 pdd_title_batch）+ 质量门 + 复用 pdd_set_titles.js 改标题。"""
    import json as _json
    import subprocess
    import time
    try:
        import pdd_title_batch as ptb
    except Exception as e:
        catalog.update_ai_boss_action(aid, status="failed", verify_detail=f"import pdd_title_batch 失败:{e}")
        return

    # 提取成交词作为候选黄金词（规则A「前移词」/ 规则C「成交词」）
    golden = []
    if isinstance(detail_raw, dict):
        for key in ("前移词", "成交词"):
            arr = detail_raw.get(key) or []
            if isinstance(arr, list):
                for k in arr:
                    if isinstance(k, dict):
                        golden.append(str(k.get("keyword") or "").strip())
                    else:
                        golden.append(str(k).strip())
    golden = [w for w in golden if w]

    # 生成新标题
    try:
        api_key = ptb.load_api_key()
        if not api_key:
            catalog.update_ai_boss_action(aid, status="failed", verify_detail="无 DEEPSEEK_API_KEY")
            return
        products = [{"name": old_title or goods_name, "golden_words": golden}]
        titles = ptb.gen_titles(products, api_key)
        new_title = (titles[0] if titles else "").strip()
    except Exception as e:
        catalog.update_ai_boss_action(aid, status="failed", verify_detail=f"标题生成失败:{e}")
        return

    # 质量门
    passed, reason = ptb.quality_gate(old_title, new_title)
    if not passed:
        catalog.update_ai_boss_action(aid, status="blocked", verify_detail=f"质量门拦截:{reason}")
        return

    # 复用 pdd_set_titles.js 改标题
    ts = int(time.time())
    base = f"aiboss_title_{ts}.json"
    wsl_path = f"/mnt/c/tmp/{base}"
    win_path = f"C:\\tmp\\{base}"
    try:
        with open(wsl_path, "w", encoding="utf-8") as f:
            _json.dump([{"gid": gid, "title": new_title}], f, ensure_ascii=False)
    except Exception as e:
        catalog.update_ai_boss_action(aid, status="failed", verify_detail=f"清单写入失败:{e}")
        return

    try:
        with _APPLY_LOCK:
            r = subprocess.run([NODE_EXE, PDD_SET_TITLE_JS, str(port), win_path],
                               capture_output=True, timeout=300)
        out = r.stdout.decode("utf-8", errors="replace").strip()
        results = []
        for line in out.splitlines():
            line = line.strip()
            if line.startswith("["):
                try:
                    results = _json.loads(line)
                except Exception:
                    pass
        res = next((x for x in results if str(x.get("gid")) == str(gid)), None)
        if res and res.get("status") == "VERIFIED":
            catalog.update_ai_boss_action(aid, status="executed", verify_status="verified_success",
                                          verify_detail=f"已改标题 → {new_title}")
        elif res:
            catalog.update_ai_boss_action(aid, status="failed", verify_detail=f"改标题失败:{res.get('status')}")
        else:
            catalog.update_ai_boss_action(aid, status="failed", verify_detail="无结果")
    except Exception as e:
        catalog.update_ai_boss_action(aid, status="failed", verify_detail=f"执行异常:{e}")


def _collect_competitors_bg(shop_id, platform_product_id, keyword):
    """后台线程：调买家端 node 脚本搜关键词抓竞品，AI 精准匹配后写库。"""
    import subprocess
    try:
        r = subprocess.run(
            [NODE_EXE, PDD_SEARCH_COMP_JS, str(CLIENT_CDP_PORT), keyword, "20"],
            capture_output=True, timeout=90,
        )
        out = r.stdout.decode("utf-8", errors="replace").strip()
        items = []
        for line in out.splitlines():
            line = line.strip()
            if line.startswith("["):
                try:
                    items = json.loads(line)
                except Exception:
                    pass
        if not items:
            return
        # AI 精准匹配：拿自家商品标题做锚点，逐条判断是否同款/直接竞品
        anchor = catalog.get_product_title(shop_id, platform_product_id)
        if anchor:
            verdicts = data.ai_filter_competitors(anchor, items)
            if len(verdicts) == len(items):
                for it, v in zip(items, verdicts):
                    it["is_comp"] = v["is_comp"]
                    it["ai_reason"] = v["reason"]
        catalog.save_competitors(shop_id, platform_product_id, keyword, items)
    except Exception:
        pass  # 静默失败，前端轮询无数据会提示


def _collect_buyer_review_bg(goods_id):
    """后台线程：调买家端 node 脚本提取商品评论（独立表 buyer_reviews）。"""
    import subprocess
    try:
        r = subprocess.run(
            [NODE_EXE, PDD_BUYER_REVIEW_JS, goods_id],
            capture_output=True, timeout=120,
        )
        out = r.stdout.decode("utf-8", errors="replace").strip()
        data = None
        for line in out.splitlines():
            line = line.strip()
            if line.startswith("{"):
                try:
                    data = json.loads(line)
                    break
                except Exception:
                    continue
        if data and data.get("total"):
            catalog.save_buyer_review(data)
    except Exception:
        pass  # 静默失败，前端轮询无数据会提示


def _collect_comments_full_bg(goods_id, target):
    """后台线程：调买家端 node 脚本翻页采集评论全文（source='full'）。"""
    import subprocess
    try:
        r = subprocess.run(
            [NODE_EXE, PDD_COMMENTS_FULL_JS, goods_id, str(target)],
            capture_output=True, timeout=300,
        )
        out = r.stdout.decode("utf-8", errors="replace").strip()
        data = None
        for line in out.splitlines():
            line = line.strip()
            if line.startswith("{"):
                try:
                    data = json.loads(line)
                    break
                except Exception:
                    continue
        if data and data.get("comments"):
            catalog.save_buyer_review_full(data)
    except Exception:
        pass  # 静默失败，前端轮询无数据会提示


def _run_node_script(script_name: str, args: list, timeout: int = 180) -> dict:
    """执行 autopublish/ 下的 node 脚本，返回 {ok, stdout, stderr, data}。

    node.exe 是 Windows 程序，脚本路径必须用 Windows 格式；输出取第一行合法 JSON。
    """
    import subprocess
    script_win = AUTOPUBLISH_DIR_WIN + "\\" + script_name
    script_wsl = os.path.join(AUTOPUBLISH_DIR_WSL, script_name)
    if not os.path.exists(script_wsl):
        return {"ok": False, "error": f"脚本缺失: {script_name}", "data": None}
    try:
        r = subprocess.run(
            [NODE_EXE, script_win] + [str(a) for a in args],
            capture_output=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "执行超时", "data": None}
    except Exception as e:
        return {"ok": False, "error": f"执行异常:{e}", "data": None}
    out = r.stdout.decode("utf-8", errors="replace").strip()
    err = r.stderr.decode("utf-8", errors="replace").strip()
    data = None
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("{") or line.startswith("["):
            try:
                data = json.loads(line)
                break
            except Exception:
                continue
    return {"ok": r.returncode == 0, "stdout": out, "stderr": err, "data": data}


def _normalize_publish_images(outdir_wsl: str) -> int:
    """规范化商品图尺寸，符合拼多多主图+商详要求：宽 480-1200、高 ≤1500，统一转 JPEG。

    1688 抓图尺寸参差（400~1500+，且可能 WebP 存成 .jpg），不规范化会导致
    「商详装修校验：请重新上传第N张图片（宽度应为480-1200px，高度应为1500px以内）」失败。
    """
    import glob
    from PIL import Image
    n = 0
    for p in glob.glob(os.path.join(outdir_wsl, "img_*.jpg")):
        try:
            im = Image.open(p)
            w, h = im.size
            if w <= 0 or h <= 0:
                continue
            ratio = 1.0
            if w > 1200:
                ratio = 1200 / w
            elif w < 480:
                ratio = 480 / w
            nw, nh = round(w * ratio), round(h * ratio)
            if nh > 1500:
                r2 = 1500 / nh
                nw, nh = round(nw * r2), round(nh * r2)
            need_resize = (nw, nh) != (w, h)
            need_convert = (im.format or "").upper() not in ("JPEG", "JPG")
            if need_resize or need_convert:
                if need_convert or im.mode not in ("RGB", "L"):
                    im = im.convert("RGB")
                if need_resize:
                    im = im.resize((nw, nh), Image.LANCZOS)
                im.save(p, "JPEG", quality=90)
            n += 1
        except Exception:
            pass
    return n


def _extract_1688_url(text: str) -> str:
    """从 1688 分享口令/整段文本里提取纯 URL，失败返回空串。"""
    import re
    url = str(text or "").strip()
    if not url:
        return ""
    if url.startswith(("http://", "https://")):
        return url
    m = re.search(r'https?://[^\s\u4e00-\u9fff，。；！？、（）【】]+', url)
    if m:
        return m.group(0).rstrip('.,;:')
    m2 = re.search(r'(qr\.1688\.com/s/[A-Za-z0-9]+|detail\.1688\.com/offer/\d+(?:\.html)?)', url)
    if m2:
        return "https://" + m2.group(1)
    return ""


# 批量上架并发控制：scrape 全局串行（1688 抓取实例端口 9238 共享），publish 按店铺串行（店铺 CDP 端口独立）
_SCRAPE_LOCK = threading.Lock()
_SHOP_LOCKS = {}


def _shop_lock(shop_id: int):
    return _SHOP_LOCKS.setdefault(shop_id, threading.Lock())


def _auto_verify_bg(task_id: int, shop_id: int, goods_id: str):
    """上架提交后延迟自动回查真实在售状态（后台线程，60s 后跑，避免与 publish 抢 CDP）。

    提交 ≠ 在售：拼多多提交后先进审核队列，需等商品进入后台列表才能回查。
    回查结果：published→已上架 / draft→草稿 / offshelf|soldout|rejected→失败 / missing→保持 submitted（可能还在审核，不误判 failed）。
    """
    if not goods_id:
        return
    import time as _time
    _time.sleep(60)  # 等商品进入后台商品列表（提交后立即回查会 missing 误判）
    port = SHOP_CDP_PORT.get(shop_id)
    if not port:
        return
    try:
        with _shop_lock(shop_id):
            res = _run_node_script("verify_publish.js", [str(port), str(goods_id)], timeout=150)
        statuses = (res.get("data") or {}).get("statuses") or {}
        real = statuses.get(str(goods_id))
        if not real or real == "missing":
            # missing = 可能还在审核队列，保持 submitted，不误判 failed（等下次手动/定时 verify）
            return
        if real == "published":
            catalog.update_autopublish_task(task_id, status="published")
            catalog.save_published_good(goods_id=goods_id, status="published", remark="回查确认在售")
            catalog.append_autopublish_log(task_id, "publish", "done", f"✅ 回查确认在售（商品ID: {goods_id}）")
        elif real == "draft":
            catalog.update_autopublish_task(task_id, status="draft")
            catalog.save_published_good(goods_id=goods_id, status="draft", remark="回查确认草稿")
            catalog.append_autopublish_log(task_id, "publish", "done", "⚠️ 回查确认草稿（未真正上架）")
        else:  # offshelf / soldout / rejected
            catalog.update_autopublish_task(task_id, status="failed", error=f"回查确认未上架({real})")
            catalog.save_published_good(goods_id=goods_id, status="failed", remark=f"回查确认未上架({real})")
            catalog.append_autopublish_log(task_id, "publish", "failed", f"❌ 回查确认未上架({real})")
    except Exception as e:
        catalog.append_autopublish_log(task_id, "publish", "done", f"⚠️ 自动回查失败:{e}")


def _cdp_port_alive(port: int) -> bool:
    """探测某 CDP 端口是否监听（Windows 侧 PowerShell，WSL 里 curl 连不上 Windows CDP）。"""
    import subprocess
    ps = (
        'Get-NetTCPConnection -LocalPort %d -State Listen -ErrorAction SilentlyContinue '
        '| Select-Object -First 1 -ExpandProperty OwningProcess'
    ) % port
    try:
        r = subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command", ps],
            capture_output=True, text=True, timeout=15,
        )
        return bool(r.stdout.strip())
    except Exception:
        return False


def _cdp_status_all() -> list:
    """返回所有 CDP 实例的实时状态（alive / pid / 标签 / 端口）。"""
    import subprocess
    # 一次性查所有端口监听状态，避免逐个 powershell 调用太慢
    ports = [c["port"] for c in CDP_INSTANCES]
    ps = (
        "Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue "
        "| Where-Object { $_.LocalPort -in @(%s) } "
        "| Select-Object LocalPort,OwningProcess | Format-Table -HideTableHeaders"
    ) % ",".join(str(p) for p in ports)
    alive_map = {}
    try:
        r = subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command", ps],
            capture_output=True, text=True, timeout=20,
        )
        for line in r.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            # 形如 "9232   12345"
            parts = line.split()
            if len(parts) >= 2 and parts[0].isdigit():
                alive_map[int(parts[0])] = parts[1]
    except Exception:
        pass
    out = []
    for c in CDP_INSTANCES:
        port = c["port"]
        pid = alive_map.get(port)
        out.append({
            "port": port,
            "label": c["label"],
            "role": c["role"],
            "target": c["target"],
            "alive": bool(pid),
            "pid": pid or None,
        })
    return out


def _cdp_restart(port: int) -> dict:
    """重启指定 CDP 端口：杀整棵进程树 → 用对应 profile 重新起 Edge。

    返回 {ok, port, label, message, launched, alive}。
    """
    import subprocess
    inst = next((c for c in CDP_INSTANCES if c["port"] == port), None)
    if not inst:
        return {"ok": False, "port": port, "message": "未知端口"}
    label = inst["label"]
    profile = inst["profile"]
    target = inst["target"]

    # 1. 杀监听该端口的进程树（taskkill /T /F /PID）
    kill_ps = (
        "$c = Get-NetTCPConnection -LocalPort %d -State Listen -ErrorAction SilentlyContinue "
        "| Select-Object -First 1 -ExpandProperty OwningProcess; "
        "if ($c) { taskkill /F /T /PID $c | Out-Null; Start-Sleep -Seconds 2; 'KILLED ' + $c } "
        "else { 'NO_PROC' }"
    ) % port
    try:
        r = subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command", kill_ps],
            capture_output=True, text=True, timeout=30,
        )
        kill_msg = (r.stdout or "").strip()
    except Exception as e:
        kill_msg = f"杀进程异常:{e}"

    # 2. 重新启动 Edge（独立 user-data-dir，保留登录态）
    launch_ps = (
        "$Edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'; "
        "if (-not (Test-Path $Edge)) { $Edge = 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' }; "
        "Start-Process $Edge -ArgumentList "
        "'--remote-debugging-port=%d','--remote-debugging-address=0.0.0.0','--remote-allow-origins=*',"
        "'--no-first-run','--no-default-browser-check','--user-data-dir=%s','%s' -WindowStyle Minimized"
    ) % (port, profile, target)
    try:
        subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command", launch_ps],
            capture_output=True, text=True, timeout=30,
        )
    except Exception:
        pass

    # 3. 等端口监听（最多 12 秒）
    alive = False
    for _ in range(12):
        import time as _t
        _t.sleep(1)
        if _cdp_port_alive(port):
            alive = True
            break

    return {
        "ok": True,
        "port": port,
        "label": label,
        "message": kill_msg,
        "launched": True,
        "alive": alive,
    }


def _read_publish_progress(task_id: int) -> dict:
    """读取 publish.js 实时写进 config.publish.log 的细粒度进度。

    publish.js 每步 log('[N/8] xxx') 同时 append 到 config.publish.log（Windows 路径
    C:\\tmp\\pdd-publish\\task_{id}\\config.publish.log，WSL 读 /mnt/c/...）。publish 阶段
    subprocess.run 阻塞执行，前端轮询任务详情时靠这个文件拿到「正在上传主图 [2/8]」级别的实时进度。
    """
    import re
    STEP_NAMES = {
        1: "选类目", 2: "上传主图", 3: "填标题", 4: "填规格",
        5: "填价格库存", 6: "上传规格预览图", 7: "填参考价", 8: "提交",
    }
    log_path = f"/mnt/c/tmp/pdd-publish/task_{task_id}/config.publish.log"
    try:
        with open(log_path, encoding="utf-8", errors="replace") as f:
            lines = [l.rstrip("\n").rstrip("\r") for l in f.readlines()]
    except Exception:
        return {"step": None, "step_name": "", "lines": []}
    step = None
    for l in lines:
        m = re.search(r"\[(\d)/8\]", l)
        if m:
            step = int(m.group(1))
    return {
        "step": step,
        "step_name": STEP_NAMES.get(step, ""),
        "lines": lines[-8:],
    }


def _autopublish_bg(task_id: int, pricing: dict = None):
    """一键上架编排：scrape(1688抓取) → ai(data.ai_generate_publish_config) → publish(CDP上架)。

    每环节回写任务状态+日志；环节失败即终止（failed），不跳过、不假装成功。
    数据流：scrape.js 写 product.json + 图片到任务目录 → Python 读 product.json
    → AI 生成 config.json（定价用 pricing 固定公式）→ publish.js 读 config.json 上架。
    单个链接整体超时 5 分钟（300s），超时即真实记录 timeout 失败并结束。
    """
    import subprocess
    task = catalog.get_autopublish_task(task_id)
    if not task:
        return
    url = task["source_url"]
    shop_id = task["shop_id"]

    # 单链接整体超时（5 分钟）。超时后任何环节都要立即终止并真实记录。
    OVERALL_TIMEOUT = int(os.environ.get("AUTOPUBLISH_TIMEOUT", "300"))
    _t0 = time.time()

    def _overtime(stage):
        """检查是否已超时，返回超时秒数（未超时返回 0）。"""
        used = time.time() - _t0
        return used if used > OVERALL_TIMEOUT else 0

    def _fail(stage, msg):
        catalog.append_autopublish_log(task_id, stage, "failed", msg)
        catalog.update_autopublish_task(task_id, status="failed", error=msg)
        try:
            # 把具体失败原因作为 description 塞进错误知识库，自动带根因线索
            catalog.hit_error_by_type(f"一键上架:{stage}", description=msg[:300])
        except Exception:
            pass

    def _fail_timeout(stage):
        """超时统一记录：真实记录已耗时 + 卡在哪个环节，不虚假标 submitted。"""
        used = int(time.time() - _t0)
        msg = f"上架超时（>{OVERALL_TIMEOUT}s，已耗 {used}s，卡在 {stage} 环节）"
        return _fail(stage, msg)

    # 任务专属目录（Windows 路径给 node.exe，WSL 路径给 Python 读）
    outdir_win = f"C:\\tmp\\pdd-publish\\task_{task_id}"
    outdir_wsl = f"/mnt/c/tmp/pdd-publish/task_{task_id}"
    os.makedirs(outdir_wsl, exist_ok=True)
    config_win = outdir_win + "\\config.json"
    config_wsl = os.path.join(outdir_wsl, "config.json")

    # ---- 环节1：1688 抓取（scrape.js 写 product.json + 图） ----
    catalog.append_autopublish_log(task_id, "scrape", "running", "开始抓取 1688 商品详情…")
    catalog.update_autopublish_task(task_id, status="crawling", stage="scrape")
    with _SCRAPE_LOCK:
        res = _run_node_script("scrape.js", [url, outdir_win, str(CLIENT_1688_PORT)], timeout=120)
    if _overtime("scrape"):
        return _fail_timeout("scrape")
    if not res.get("data"):
        return _fail("scrape", res.get("error") or res.get("stderr") or "抓取失败（无数据）")
    d = res["data"]
    if d.get("error"):
        return _fail("scrape", d["error"])
    # 读 product.json（含完整 bodyText，AI 环节要用）
    product = {}
    try:
        with open(os.path.join(outdir_wsl, "product.json"), encoding="utf-8") as f:
            product = json.load(f)
    except Exception:
        product = {}
    # 规范化商品图尺寸（1688 抓图 400~1500+ 且可能 WebP，不规范化会导致商详校验失败）
    try:
        _n = _normalize_publish_images(outdir_wsl)
        if _n:
            catalog.append_autopublish_log(task_id, "scrape", "done", f"图片规范化 {_n} 张（宽480-1200/高≤1500/转JPEG）")
    except Exception:
        pass
    if not product.get("title"):
        product["title"] = d.get("title", "")
        product["images"] = d.get("images", [])
        product["bodyText"] = ""
    catalog.update_autopublish_task(
        task_id,
        raw_title=product.get("title", ""),
        images=product.get("images", []),
    )
    catalog.append_autopublish_log(
        task_id, "scrape", "done",
        f"抓取成功：{product.get('title','')[:30]} ｜ 图 {len(product.get('images',[]))} 张",
    )

    # ---- 环节2：AI 生成 config.json ----
    if _overtime("ai"):
        return _fail_timeout("ai")
    catalog.append_autopublish_log(task_id, "ai", "running", "DeepSeek 分析规格/定价/类目，生成上架配置…")
    catalog.update_autopublish_task(task_id, status="ai", stage="ai")
    ai = data.ai_generate_publish_config(product, pricing)
    if _overtime("ai"):
        return _fail_timeout("ai")
    if ai.get("error"):
        return _fail("ai", ai["error"])
    cfg = ai.get("config") or {}
    if not cfg:
        return _fail("ai", "AI 未生成配置")
    catalog.update_autopublish_task(task_id, ai_title=cfg.get("title", ""))
    # 写 config.json 供 publish.js 读
    try:
        with open(config_wsl, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
    except Exception as e:
        return _fail("ai", f"写 config.json 失败:{e}")
    warning = ai.get("warning", "")
    catalog.append_autopublish_log(
        task_id, "ai", "done",
        f"AI 配置完成：标题 {cfg.get('title','')[:30]} ｜ 规格 {len(cfg.get('specs',[]))} 维"
        + (f" ｜ ⚠️{warning}" if warning else ""),
    )

    # ---- 环节3：拼多多 CDP 真实上架 ----
    if _overtime("publish"):
        return _fail_timeout("publish")
    catalog.append_autopublish_log(task_id, "publish", "running", "CDP 真实上架到拼多多…")
    catalog.update_autopublish_task(task_id, status="publishing", stage="publish")
    port = SHOP_CDP_PORT.get(shop_id)
    if not port:
        return _fail("publish", f"店铺 {shop_id} 未配置 CDP 端口")
    with _shop_lock(shop_id):
        res = _run_node_script("publish.js", [config_win, str(port)], timeout=180)
    if _overtime("publish"):
        return _fail_timeout("publish")
    if not res.get("data") and not res.get("ok"):
        return _fail("publish", res.get("error") or res.get("stderr") or "上架失败")
    # publish.js 输出是进度日志（非 JSON），判断成功靠 stdout 里的 RESULT_SUCCESS 明确标记
    # 不能用 "/success" 或 "上架成功" 宽松匹配：续填模式的日志里含 URL ".../success?goods_id=xxx" 会误判
    out = res.get("stdout", "")
    # 构造「上架列表」存表字段（SKU 明细：原始进价 cost + 上架价 pdd + 单买价 danmai）
    _pb = cfg.get("priceBySpec2") or {}
    _sku_details = []
    for _k, _v in _pb.items():
        if isinstance(_v, dict):
            _sku_details.append({"name": str(_k), "cost": _v.get("cost"),
                                 "pdd": _v.get("pdd"), "danmai": _v.get("danmai")})
    _costs = [d["cost"] for d in _sku_details if d.get("cost") is not None]
    _sales = [d["pdd"] for d in _sku_details if d.get("pdd") is not None]
    _danmais = [d["danmai"] for d in _sku_details if d.get("danmai") is not None]
    _pr = pricing or {}
    _base = {
        "task_id": task_id,
        "main_image": (cfg.get("images") or [None])[0] or "",
        "source_url": url,
        "raw_title": product.get("title", ""),
        "ai_title": cfg.get("title", ""),
        "category": cfg.get("categoryPath", ""),
        "shop_id": shop_id,
        "shop_name": catalog.get_shop_name(shop_id),
        "sku_count": len(_sku_details),
        "sku_details": _sku_details,
        "cost_price": (min(_costs) if _costs else None),
        "sale_price": (min(_sales) if _sales else None),
        "danmai_price": (min(_danmais) if _danmais else None),
        "ref_price": cfg.get("refPrice"),
        "profit_rate": _pr.get("profit_rate"),
        "freight": _pr.get("freight"),
        "stock": cfg.get("stock"),
    }
    if "RESULT_SUBMITTED" in out:
        m = __import__("re").search(r"RESULT_SUBMITTED goods_id=(\d+)", out)
        goods_id = m.group(1) if m else ""
        catalog.update_autopublish_task(task_id, status="submitted", pdd_goods_id=goods_id)
        catalog.append_autopublish_log(task_id, "publish", "done", f"✅ 已提交待审核，商品ID: {goods_id}")
        try:
            catalog.save_published_good(**{**_base, "goods_id": goods_id, "status": "submitted",
                "published_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "remark": "已提交待审核"})
        except Exception as e:
            catalog.append_autopublish_log(task_id, "publish", "done", f"⚠️ 写入上架列表失败:{e}")
        # 自动回查真实状态（延迟 60s，避免与 publish 抢 CDP + 等商品进入后台列表）
        if goods_id:
            threading.Thread(target=_auto_verify_bg, args=(task_id, shop_id, goods_id), daemon=True).start()
    elif "RESULT_FAILED" in out:
        # 提交被拼多多拦截（类目资质/必填项/判重等），如实记录具体原因
        m = __import__("re").search(r"RESULT_FAILED (.+)", out)
        reason = (m.group(1) if m else "提交被拦截").strip()
        try:
            catalog.save_published_good(**{**_base, "goods_id": "", "status": "failed",
                "published_at": "", "remark": f"提交被拦截：{reason}"})
        except Exception:
            pass
        return _fail("publish", f"提交被拦截：{reason}")
    else:
        # 上架脚本跑完了但没成功标记，如实记 failed
        # 取 stdout 最后几行（去空行）作为失败线索，自动带进错误知识库 description
        lines = [l.strip() for l in out.splitlines() if l.strip()]
        tail = " | ".join(lines[-3:])[-280:] if lines else ""
        try:
            catalog.save_published_good(**{**_base, "goods_id": "", "status": "failed",
                "published_at": "", "remark": f"未确认上架成功（{tail}）"})
        except Exception:
            pass
        return _fail("publish", f"未确认上架成功（{tail}）")


def main():
    catalog.init_db()  # 每次启动执行幂等迁移（补缺失列）
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"运营工作台已启动：http://127.0.0.1:{PORT}")
    print("按 Ctrl+C 停止。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")


if __name__ == "__main__":
    main()
