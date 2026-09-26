#!/usr/bin/env python3
"""AI 批量升级关键词库：精准分类 / 热度 / 搜索量估算 / 竞争度 / 相关性校准
+ 降噪标记(移black不删) + 同义扩展(丰富词库)。断点续跑(已处理词打 ai_enriched 标记)。

用法:
  python3 ai_enrich_keywords.py --limit 20          # 只处理前20个未处理词(测试)
  python3 ai_enrich_keywords.py                     # 全量
  python3 ai_enrich_keywords.py --dry-run           # 只打印第一批, 不写库
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.request

KEYWORDS_PATH = "/mnt/d/电商运营/运营工作台/data/keywords.json"

CATEGORIES = "核心词/属性词/场景词/规格词/卖点词/风格词/长尾词"
HOTS = "热/中/长尾/低"
RELEVANCES = "高/中/低"
PRODUCTS = "挂钩/收纳/园艺/家居装饰/其他"


def load_keys_env() -> dict:
    env = {}
    p = os.path.expanduser("~/.keys.env")
    if os.path.isfile(p):
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


API_KEY = load_keys_env().get("DEEPSEEK_API_KEY", "")


def call_deepseek(prompt: str) -> str:
    body = json.dumps({
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "stream": False,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.deepseek.com/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    )
    resp = json.loads(urllib.request.urlopen(req, timeout=180).read())
    return resp["choices"][0]["message"]["content"]


def build_prompt(words):
    lines = "\n".join(f"{i + 1}. {w}" for i, w in enumerate(words))
    return (
        "你是拼多多电商关键词库运营专家。下面是一批商品标题拆出来的关键词，"
        "请对每个词做结构化升级，用于标题生成和选词。\n\n"
        f"词列表：\n{lines}\n\n"
        "对每个词输出以下字段（严格 JSON 数组）：\n"
        "- category(词角色): 只能从 [" + CATEGORIES + "] 选一个。\n"
        "  核心词=商品是什么(门后挂钩/花盆/收纳盒/烛台)；属性词=修饰特征(免打孔/无痕/铁艺/强力)；\n"
        "  场景词=使用地点(厨房/浴室/阳台/宿舍/客厅)；规格词=数量尺寸(五钩/4个装/加大号/大号)；\n"
        "  卖点词=解决痛点(承重/防滑/可折叠/加厚)；风格词=风格(北欧/ins/轻奢/复古)；长尾词=完整搜索词组(免打孔门后挂钩)。\n"
        "- product(品类): 只能从 [" + PRODUCTS + "] 选一个。\n"
        "- hot(热度): 只能从 [" + HOTS + "] 选一个，按电商真实搜索热度判断。\n"
        "- search_volume(估算搜索量): 整数 0~100000，按常识估量级(如 门后挂钩≈5000、宿舍床边挂衣钩≈150、花盆≈8000)。\n"
        "- competition(竞争度): 整数 0~100，越高越红海(通用大词>80，长尾蓝海<40)。\n"
        "- relevance(相关性): 只能从 [" + RELEVANCES + "] 选一个。\n"
        "  高=明确商品词或强购买意图；中=有用的属性/场景/卖点修饰词；低=弱相关或泛词。\n"
        "- keep(是否保留): true/false。false 仅限：负面词/差评词(生锈/掉漆/粘不住/脱落/留胶痕)、"
        "营销噪音词(包邮/清仓/爆款/新款/促销/买一送一)、无意义碎片(单字/纯量词/乱码)。\n"
        "- synonyms(同义扩展): 字符串数组。仅对 核心词/属性词/卖点词 生成 2~3 个同义词或组合长尾词；"
        "其余角色给空数组 []。\n\n"
        "只输出 JSON，格式：{\"items\":[{\"word\":\"原词\",\"category\":\"属性词\",\"product\":\"挂钩\",\"hot\":\"中\","
        "\"search_volume\":3000,\"competition\":60,\"relevance\":\"高\",\"keep\":true,\"synonyms\":[\"免打孔门后挂钩\"]}]}。\n"
        "不要输出 markdown 代码块，不要解释。每个输入词都要有对应条目，word 保持原文。"
    )


def parse_items(content: str):
    m = re.search(r"\[.*\]", content, re.DOTALL)
    if not m:
        m = re.search(r"\{.*\}", content, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def load_keywords():
    with open(KEYWORDS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_keywords(items):
    with open(KEYWORDS_PATH, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="只处理前 N 个未处理词(测试)")
    ap.add_argument("--batch", type=int, default=50)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not API_KEY:
        print("未配置 DEEPSEEK_API_KEY")
        sys.exit(1)

    items = load_keywords()
    # 待处理：非 black 池 + 未打 ai_enriched 标记 + 有词
    todo = [k for k in items
            if k.get("pool_type", "main") != "black"
            and not k.get("ai_enriched")
            and (k.get("word") or "").strip()]
    if args.limit:
        todo = todo[:args.limit]
    print(f"待处理 {len(todo)} 词 / 总 {len(items)} 词", flush=True)

    if not todo:
        print("没有待处理词")
        return

    # 建 word -> item 索引(去重词库, word 唯一)
    idx = {k.get("word"): k for k in items}

    enriched = 0
    blacked = 0
    added = 0
    fail = 0

    for start in range(0, len(todo), args.batch):
        batch = todo[start:start + args.batch]
        words = [k["word"] for k in batch]
        prompt = build_prompt(words)
        try:
            content = call_deepseek(prompt)
        except Exception as e:
            print(f"批 {start // args.batch + 1} 调用失败: {e}", flush=True)
            fail += len(batch)
            time.sleep(3)
            continue

        data = parse_items(content)
        if not data:
            print(f"批 {start // args.batch + 1} 解析失败: {content[:200]}", flush=True)
            fail += len(batch)
            continue

        if args.dry_run:
            print("=== dry-run 第一批 ===")
            print(json.dumps(data, ensure_ascii=False, indent=2))
            return

        # 按 word 匹配回写
        ai_map = {}
        for d in data:
            if isinstance(d, dict) and d.get("word"):
                ai_map[d["word"]] = d

        for k in batch:
            w = k["word"]
            d = ai_map.get(w)
            if not d:
                fail += 1
                continue
            k["ai_enriched"] = True
            # 降噪：keep=false → black 池(不删)
            if d.get("keep") is False:
                k["pool_type"] = "black"
                k["status"] = "禁用"
                k["notes"] = "AI降噪：" + (d.get("reason") or "负面/噪音/无意义")
                blacked += 1
                continue
            # 升级字段
            cat = d.get("category")
            if cat and cat in CATEGORIES.split("/"):
                k["category"] = cat
            prod = d.get("product")
            if prod and prod in PRODUCTS.split("/"):
                k["product"] = prod
            hot = d.get("hot")
            if hot and hot in HOTS.split("/"):
                k["hot"] = hot
            sv = d.get("search_volume")
            if isinstance(sv, (int, float)):
                k["search_volume"] = int(sv)
                k["search_volume_source"] = "AI估算"
            comp = d.get("competition")
            if isinstance(comp, (int, float)):
                k["competition"] = int(max(0, min(100, comp)))
            rel = d.get("relevance")
            if rel and rel in RELEVANCES.split("/"):
                k["relevance"] = rel
            enriched += 1

            # 同义扩展 → 新词入库(只加不删)
            for syn in (d.get("synonyms") or []):
                syn = (syn or "").strip()
                if not syn or len(syn) < 2:
                    continue
                if syn in idx:
                    continue  # 已存在, 跳过
                import uuid
                new_item = {
                    "id": "kw_ai_" + uuid.uuid4().hex[:10],
                    "word": syn,
                    "category": k.get("category", "长尾词"),
                    "source": "AI同义词",
                    "status": "待用",
                    "notes": f"由「{w}」AI扩展",
                    "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "product": k.get("product", "门后挂钩"),
                    "shop": "拼多多",
                    "hot": k.get("hot", "中"),
                    "relevance": k.get("relevance", "中"),
                    "search_volume": int(sv) if isinstance(sv, (int, float)) else 0,
                    "search_volume_source": "AI估算",
                    "competition": int(max(0, min(100, comp))) if isinstance(comp, (int, float)) else 0,
                    "weight": 5,
                    "pool_type": "spare",
                    "platform_scope": "all",
                    "mutually_exclude": [],
                    "max_occur": 1,
                    "ctr": 0.0, "cvr": 0.0, "roi": 0.0,
                    "ai_enriched": True,
                }
                items.append(new_item)
                idx[syn] = new_item
                added += 1

        save_keywords(items)
        print(f"批 {start // args.batch + 1} 完成: 升级{enriched} 降噪{blacked} 新增{added} 失败{fail}",
              flush=True)
        time.sleep(0.5)

    print(f"\n完成: 升级 {enriched} 词 / 降噪移黑 {blacked} 词 / 新增同义词 {added} 词 / 失败 {fail} 词")


if __name__ == "__main__":
    main()
