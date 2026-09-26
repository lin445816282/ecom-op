# -*- coding: utf-8 -*-
"""电商运营工作台：轻量 API，供单页前端本地调用。"""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import sys
import threading
from urllib.parse import urlparse, parse_qs, quote

import data
import catalog

PORT = 8765
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROMOTION_HISTORY_PATH = os.path.expanduser("~/.hermes/pdd_promotion_history.json")

# 店铺 → 拼多多 CDP 端口（Edge 独立 profile，详见 pdd-promotion-cdp skill）
SHOP_CDP_PORT = {5: 9232, 3: 9230, 1: 9234, 6: 9228}
NODE_EXE = "/mnt/d/Program Files/nodejs/node.exe"
PDD_SET_TITLE_JS = r"C:\tmp\pdd_set_titles.js"
# 竞品监控：买家端搜索实例 + 采集脚本
CLIENT_CDP_PORT = 9236
PDD_SEARCH_COMP_JS = r"C:\tmp\fetch_competitors.js"
PDD_BUYER_REVIEW_JS = r"C:\tmp\fetch_buyer_reviews.js"
PDD_COMMENTS_FULL_JS = r"C:\tmp\fetch_comments_full.js"

# 访问口令：环境变量 ECOM_OP_TOKEN 可覆盖，默认见下。静态资源公开，/api/* 需带口令。
ACCESS_TOKEN = os.environ.get("ECOM_OP_TOKEN", "Alcz8283103")
AUTH_WHITELIST = {"/", "/index.html", "/app.js", "/style.css", "/favicon.ico", "/api/auth/login"}


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

        if path == "/api/hook-cost" and self.command == "GET":
            n = int(qs.get("n", ["1"])[0] or 1)
            return _json(self, catalog.calc_hook_cost(n))

        if path == "/api/cost-params" and self.command == "GET":
            return _json(self, {"params": catalog.get_cost_params()})

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
            return _json(self, catalog.freight_compare())

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
            rid = catalog.add_title_opt(shop_id, platform_product_id)
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
            ok = catalog.update_title_opt(opt_id, new_title, status, note)
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


def _collect_competitors_bg(shop_id, platform_product_id, keyword):
    """后台线程：调买家端 node 脚本搜关键词抓竞品，写库。"""
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
        if items:
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
