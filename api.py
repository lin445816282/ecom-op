# -*- coding: utf-8 -*-
"""电商运营工作台：轻量 API，供单页前端本地调用。"""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from urllib.parse import urlparse, parse_qs

import data

PORT = 8765
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROMOTION_HISTORY_PATH = os.path.expanduser("~/.hermes/pdd_promotion_history.json")


def _json(handler, obj, status=200):
    body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
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

        # 产品
        if path == "/api/products" and self.command == "GET":
            items = [data.enrich_product(data.Product.from_dict(p)) for p in data.load_products()]
            return _json(self, {"items": items})

        if path == "/api/products" and self.command == "POST":
            item = self._read_body()
            cleaned = {k: item.get(k) for k in [
                "id", "name", "selling_price", "gross_profit", "ad_cost", "refund_rate",
                "ad_spend", "orders", "impressions", "clicks", "sold", "notes",
                "cost", "shipping", "commission_rate", "freight_insurance", "shop"]}
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
            body = ("\ufeff" + out.getvalue()).encode("utf-8-sig")
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="products.csv"')
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # 静态页面
        if path in ("/", "/index.html") and self.command == "GET":
            return self._serve_file("index.html", "text/html; charset=utf-8")
        if path in ("/app.js",) and self.command == "GET":
            return self._serve_file("app.js", "text/javascript; charset=utf-8")
        if path in ("/style.css",) and self.command == "GET":
            return self._serve_file("style.css", "text/css; charset=utf-8")

        return _json(self, {"error": "not found", "path": path}, 404)

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

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()


def main():
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"运营工作台已启动：http://127.0.0.1:{PORT}")
    print("按 Ctrl+C 停止。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")


if __name__ == "__main__":
    main()
