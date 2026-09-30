# -*- coding: utf-8 -*-
"""AI 老板选品研究：调 DeepSeek，输出「该卖什么 + 关键词 + 注意事项 + 建议」。"""
import json
import urllib.request
import pdd_title_batch as ptb

URL = "https://api.deepseek.com/chat/completions"

PROMPT = """你是拼多多电商选品研究员，负责「闲时来工艺店」的选品研究（AI 老板角色）。

店铺定位：节庆用品店（主营婚庆用品、气球、节日装扮），兼营秋冬手套、家居饰品。

已上架 75 个商品，主要类目分布：
- 婚庆用品（拉花/气球/喜字/红包/纸杯/礼花/拱门/婚房布置）约 20 个
- 气球（套装/铝膜/婚庆气球）约 10 个
- 秋冬手套（各种款式）约 10 个
- 万圣节装饰（南瓜灯/摆件）约 4 个
- 仿真花/绿植约 4 个

商业模式：1688 低价货源（进价 0.5~3 元）→ 拼多多卖 14~60 元，走量赚差价。

当前时间：2026年10月1日。接下来 3 个月的节点：
- 10月31日 万圣节
- 11月11日 双11
- 11月26日 感恩节
- 12月24-25日 圣诞
- 2027年1月1日 元旦
- 2027年1月 春节（约1月22日）

请输出选品研究报告，包含四部分：
1. 该卖什么：接下来 3 个月最值得上架的产品方向（按应季优先级排序），每个方向给具体商品 + 理由
2. 关键词：每个方向的 1688 搜索词 + 拼多多标题关键词
3. 注意事项：类目选择、1688 风控、价格定位、质量、物流、售后等坑
4. 补充建议：你还能想到的（定价策略、测款、组合销售、上架节奏等）

要求：务实、具体、可执行，不要空话套话。中文输出。"""


def research():
    key = ptb.load_api_key()
    if not key:
        return {"error": "无 DEEPSEEK_API_KEY"}
    body = {
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": PROMPT}],
        "temperature": 0.6,
        "max_tokens": 6000,
    }
    req = urllib.request.Request(
        URL, data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        resp = json.loads(r.read().decode("utf-8"))
    return resp["choices"][0]["message"]["content"]


if __name__ == "__main__":
    print(research())
