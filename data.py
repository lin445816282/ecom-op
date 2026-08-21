# -*- coding: utf-8 -*-
"""电商运营工作台：结构化运营知识与数据模型。

本模块只收录符合平台规则与法律法规的合规运营知识，
不包含刷单、改销量、异常价格、恶意比价规避、虚假宣传等高风险做法。
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Optional

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

DB_PATH = os.path.join(DATA_DIR, "products.json")
FORMULA_PATH = os.path.join(DATA_DIR, "formulas.json")
TASKS_PATH = os.path.join(DATA_DIR, "tasks.json")
INSIGHTS_PATH = os.path.join(DATA_DIR, "insights.debug.json")

# ----------------------------- 产品库 -----------------------------

@dataclass
class Product:
    """单个 SKU 的运营模型。"""

    id: str
    name: str
    selling_price: float       # 实际到手售价（活动/优惠后）
    gross_profit: float        # 单件毛利（手动填写；填了成本明细则自动算）
    ad_cost: float = 0.0       # 单件广告花费
    refund_rate: float = 0.15  # 综合售后率，0.15=15%
    ad_spend: float = 0.0      # 最近周期广告总花费
    orders: int = 0            # 最近周期订单数
    impressions: int = 0       # 最近周期曝光
    clicks: int = 0            # 最近周期点击
    sold: int = 0              # 最近周期成交件数
    notes: str = ""
    # 成本明细（任一非空则自动算毛利，覆盖手动 gross_profit）
    cost: float = 0.0              # 进货价
    shipping: float = 0.0          # 运费
    commission_rate: float = 0.0   # 平台扣点率（0.006=0.6%）
    freight_insurance: float = 0.0 # 运费险
    # 店铺
    shop: str = "拼多多"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "selling_price": self.selling_price,
            "gross_profit": self.gross_profit,
            "ad_cost": self.ad_cost,
            "refund_rate": self.refund_rate,
            "ad_spend": self.ad_spend,
            "orders": self.orders,
            "impressions": self.impressions,
            "clicks": self.clicks,
            "sold": self.sold,
            "notes": self.notes,
            "cost": self.cost,
            "shipping": self.shipping,
            "commission_rate": self.commission_rate,
            "freight_insurance": self.freight_insurance,
            "shop": self.shop,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Product":
        # 过滤未知字段，兼容旧数据缺字段
        allowed = set(cls.__dataclass_fields__)
        return cls(**{k: v for k, v in d.items() if k in allowed})

    # ---- 成本精算 ----
    @property
    def has_cost_breakdown(self) -> bool:
        return any([self.cost, self.shipping, self.commission_rate, self.freight_insurance])

    @property
    def auto_profit(self) -> float:
        """自动算毛利：售价 - 进货 - 运费 - 平台扣点 - 运费险。"""
        commission = self.selling_price * self.commission_rate
        return round(self.selling_price - self.cost - self.shipping - commission - self.freight_insurance, 4)

    @property
    def effective_profit(self) -> float:
        """有效毛利：填了成本明细则自动算，否则用手动 gross_profit。"""
        return self.auto_profit if self.has_cost_breakdown else self.gross_profit

    # ---- 自动计算指标 ----
    @property
    def margin(self) -> float:
        if self.selling_price:
            return self.effective_profit / self.selling_price
        return 0.0

    @property
    def effective_rate(self) -> float:
        """安全起见可按下限理解；此处按 1 - 售后率。"""
        return max(0.0, 1.0 - max(0.0, min(1.0, self.refund_rate)))

    @property
    def break_even_roi(self) -> float:
        denom = self.margin * self.effective_rate
        if denom <= 1e-9:
            return float("inf")
        roi = 1.0 / denom
        return round(roi, 4)

    @property
    def target_roi(self) -> float:
        """目标投产通常建议留出缓冲，默认按保本 ROI 的 1.2 倍。"""
        be = self.break_even_roi
        if be == float("inf"):
            return float("inf")
        return round(be * 1.2, 4)

    @property
    def est_cpc_break_even(self) -> float:
        """按点击口径的盈亏平衡 CPC（元/次点击）。"""
        if self.orders and self.ad_spend:
            cvr = self.sold / self.clicks if self.clicks else 0.0
            cpc_by_cvr = self.effective_profit * self.effective_rate * cvr
            if cpc_by_cvr <= 0:
                return 0.0
            return round(cpc_by_cvr, 3)
        return 0.0

    @property
    def cpa_benchmark(self) -> float:
        """每笔成交广告花费的上限建议（元/单）。"""
        limit = self.effective_profit * self.effective_rate
        return round(max(0.0, limit), 3)

    @property
    def suggested_daily_budget(self) -> float:
        """保守起量日预算：目标单量 * 单笔成交花费上限。"""
        return round(self.cpa_benchmark * 2.0, 2)

    def click_metrics(self) -> dict:
        ctr = self.clicks / self.impressions if self.impressions else 0.0
        cvr = self.sold / self.clicks if self.clicks else 0.0
        return {"ctr": round(ctr, 4), "cvr": round(cvr, 4)}


# ----------------------------- 选品日历 -----------------------------

def seasonal_calendar() -> list[dict]:
    """季节/节点选品日历（月份 -> 节点 -> 品类）。

    来源：原资料中的日历建议，已去重与整理。
    """
    data = [
        ("1月", [("元旦", "演出服、荧光棒、礼盒、贺卡、手工拉花、气球"),
                 ("腊八节", "礼品、礼盒、包装袋"),
                 ("年会", "荣誉证书、手捧花束、签名笔、红地毯、抽奖箱、礼服")]),
        ("2月", [("年货", "春联、福字、挂饰、灯笼、窗花、中国结、春装、箱包、童装、生肖玩偶"),
                 ("情人节", "玫瑰花、礼盒、抱枕、首饰、相册、杯子、毛绒玩具"),
                 ("元宵节", "手提花灯、装饰品、手工贴纸、灯笼"),
                 ("过年送礼", "保暖衣物、按摩椅、帽子、围巾、手套、包包、饰品")]),
        ("3月", [("三八妇女节", "服装、礼盒、手工品、贺卡、化妆镜、自拍神器、包包、花束"),
                 ("开学季", "脸盆、水杯、毛巾、文具、书包、四件套、拉杆箱、睡衣"),
                 ("龙抬头", "理发围布、理发剪刀、收纳箱、理发用品"),
                 ("春游", "背包、帽子、遮阳伞、旅游鞋、墨镜"),
                 ("植树节", "铲子、移植铲、园艺工具、花架、盆托、许愿挂牌")]),
        ("4月", [("愚人节", "整蛊玩具、恶搞礼物、贺卡、活动挂纸"),
                 ("春季家装", "仿真花、墙贴、壁纸、相框、吸顶灯、置物架、隔音棉"),
                 ("美甲", "美甲片、修甲套装、美甲工具、指甲贴"),
                 ("儿童生活", "儿童餐具、宝宝浴盆、儿童小沙发、爬爬垫"),
                 ("清明节", "祭祀用品、花束、灯笼、纪念彩纸")]),
        ("5月", [("劳动节/露营", "帐篷、睡袋、烧烤炉、烧烤签、防晒服、车内旅行用品"),
                 ("青年节", "演出服、舞蹈服、礼品、包装盒、腰带、背包"),
                 ("护士节", "护士鞋、心形奖杯"),
                 ("母亲节", "服装、礼盒、贺卡、老花镜、活动布置用品")]),
        ("6月", [("夏季换季", "泳衣、小电风扇、拖鞋、防晒服、冰坐垫、防晒帽"),
                 ("儿童节", "童装、儿童车、玩偶、滑板车、表演服装、玩具"),
                 ("端午节", "五彩绳、香包、挂饰、香包材料、龙舟道具"),
                 ("毕业季", "相册、纪念册、DIY 手工"),
                 ("父亲节", "水杯、腰带、钱包、老花镜、定制奖杯")]),
        ("7月", [("建党节", "纪念品、定制奖杯、演出服、手工剪纸"),
                 ("大暑", "速干毛巾、凉席、冰床垫、夏季拖鞋、蚊帐、游泳用品"),
                 ("雨季", "雨衣、雨伞、雨鞋")]),
        ("8月", [("七夕", "仿真花、抱抱熊、礼物花束、DIY 手作、表白道具"),
                 ("建军节", "演出服、舞蹈服、纪念品、定制奖杯"),
                 ("中元节", "祭祀用品、灯笼、花束"),
                 ("秋冬换季", "旅行箱、鞋子、厚衣物")]),
        ("9月", [("开学季", "宿舍床品、文具、书包、四件套、水杯、拉杆箱"),
                 ("教师节", "贺卡、钢笔、鲜花、手工品、杯具、摆件"),
                 ("中秋节", "月饼、灯笼、手工礼物贺卡、酒类、包装礼盒"),
                 ("秋季换季", "长袖 T 恤、打底衫、牛仔裤、运动鞋、皮衣")]),
        ("10月", [("国庆节", "灯笼、彩旗、玩具、装饰用品、舞蹈服装、道具"),
                  ("旅游装备", "行李箱、化妆包、洗漱杯、烧烤用具、旅行衣架、自拍杆"),
                  ("重阳节", "香包、贺卡、帽子、袜子、老年服装、拐杖、移动马桶凳"),
                  ("婚礼季", "婚庆布置、拉花、气球拱门、喜字贴纸、一次性喜字杯")]),
        ("11月", [("双十一", "冬季保暖手套、帽子、围巾、棉袜、棉拖鞋、秋裤"),
                  ("万圣节", "服装、道具、糖果、面具、南瓜灯、氛围装扮物品"),
                  ("感恩节", "礼品套件、贺卡、花束、茶具、水杯、摆件"),
                  ("立冬", "手套、围巾、帽子、毛衣、挡风被、四件套")]),
        ("12月", [("圣诞/元旦", "圣诞饰品、礼物、贺卡、彩灯、派对用品"),
                  ("冬季保暖", "棉服、围巾、手套、暖宝宝、保温杯、棉被"),
                  ("年终送礼", "礼盒、家居礼品、办公礼品、定制纪念品")]),
    ]
    result = []
    for month, nodes in data:
        for node, categories in nodes:
            result.append({"month": month, "node": node, "categories": categories})
    return result


# ----------------------------- 知识库 -----------------------------

def knowledge_base() -> list[dict]:
    """合规运营知识卡片。"""
    return [
        {
            "id": "select-links",
            "title": "多链接小批量测试",
            "category": "选品测款",
            "summary": "同一商品可做多条差异化链接测试，观察曝光、点击和转化，再集中资源推表现好的链接。",
            "points": [
                "主图差异化：不同使用场景或卖点表达，不得虚假宣传。",
                "标题前 5 个字尽量体现不同的搜索意图。",
                "SKU 组合差异化：以不同规格、数量、赠品组合满足不同需求。",
                "建议小预算跑 2-3 天，再比较单位广告花费与订单质量。",
            ],
            "sop": "1. 确定品类\n2. 新建 3-5 条差异化链接\n3. 设同结构预算测试\n4. 用转化与利润筛选主推链接",
        },
        {
            "id": "basic-listing",
            "title": "先做好链接基础再放大",
            "category": "链接内功",
            "summary": "正式放量前先完善标题、主图、SKU、详情、评价与客服，避免花钱买来无效流量。",
            "points": [
                "标题和主图与核心关键词保持一致，不堆砌、不蹭品牌词。",
                "SKU 名称、规格、图片、价格真实清晰，不做误导性描述。",
                "详情页先讲清痛点，再讲产品优势与使用场景。",
                "真实好评与售后处理能力是长期转化基础。",
            ],
            "sop": "1. 确定主推关键词\n2. 完善主图与视频\n3. 优化 SKU 结构\n4. 完善详情与卖点\n5. 准备好客服话术与发货流程",
        },
        {
            "id": "ad-cold-start",
            "title": "广告冷启动与出价校准",
            "category": "推广",
            "summary": "新链接先用较低风险的小预算起量，用真实成交数据校准出价和预算，而不是盲目加价。",
            "points": [
                "出价从系统推荐的中间值开始观察。",
                "小预算先积累少量真实成交，计算单笔成交广告花费。",
                "每 1-3 小时观察一次花费速度、曝光与点击率。",
                "连续多日无成交或点击率明显偏低时，先优化主图和 SKU，再加预算。",
            ],
            "sop": "1. 设置小额日预算\n2. 中等出价起跑\n3. 记录成交与广告花费\n4. 按单笔成交花费调整出价\n5. 再决定放量或暂停",
        },
        {
            "id": "drag-price",
            "title": "拖价与投产递增",
            "category": "推广",
            "summary": "数据稳定上升后再逐步小幅调整出价，以验证在更低成本下是否能维持曝光和转化。",
            "points": [
                "优先观察曝光、点击率和花费速率，只调整一个变量。",
                "每次出价调整 0.1-0.5 元，观察 1-3 小时或按你的数据节奏。",
                "曝光稳定且转化不降时再继续小幅拖价。",
                "若拖价后曝光明显下滑，及时回调。",
            ],
            "sop": "1. 记录基线数据\n2. 小步降出价\n3. 观察曝光与转化变化\n4. 稳定则保留，下滑则回调",
        },
        {
            "id": "roi-control",
            "title": "投产与利润底线",
            "category": "数据",
            "summary": "用保本 ROI 判断广告是否可放量。低于保本投产的流量，需要先优化产品毛利、客单或转化。",
            "points": [
                "利润率 = 单件毛利 / 实际到手售价。",
                "建议按到手价计算，扣除平台扣点、运费、运费险和售后影响。",
                "保本投产比 = 1 / (利润率 × 有效成交率)。",
                "目标投产建议在保本投产基础上留 20% 以上安全边际。",
                "低于保本投产的可短期测试，但不应作为持续放量策略。",
            ],
            "sop": "1. 计算单件毛利\n2. 计算利润率与售后率\n3. 得到保本 ROI\n4. 与广告实际 ROI 比较决策",
        },
        {
            "id": "ctr-cvr",
            "title": "点击率与转化率基准",
            "category": "数据",
            "summary": "不同类目基准不同，应建立自己的店铺历史基线，而不要只迷信某个固定数字。",
            "points": [
                "点击率主要受主图、标题、外露价格影响。",
                "转化率主要受价格、SKU 结构、详情、评价与客服影响。",
                "持续低于自身历史均值的链接，优先优化内功。",
                "数据量很小时，波动噪声大，不宜过早下结论。",
            ],
            "sop": "1. 建立店铺周/月基线\n2. 比较链接 CTR/CVR\n3. 定位主图还是转化问题\n4. 单变量优化后复测",
        },
        {
            "id": "compliance-rules",
            "title": "平台规则红线",
            "category": "合规",
            "summary": "上架、发货、客服、品控中常见处罚点，务必在放量前检查，避免店铺和资金风险。",
            "points": [
                "商品放在正确类目，不低价引流、不虚假宣传、不发布禁售/违禁信息。",
                "48 小时内发货，点击发货后 24 小时内要有物流流转。",
                "杜绝虚假发货、欺诈发货，物流与买家地址须真实一致。",
                "客服 8:00-23:00 尽量 1 小时内有效回复。",
                "不得引导用户添加微信、QQ 等社交工具，不得辱骂用户。",
                "产品描述、容量、材质、资质须真实，不蹭品牌词。",
            ],
            "sop": "1. 上架前核对类目与资质\n2. 下单后及时真实发货\n3. 客服限时有效响应\n4. 描述与实物一致\n5. 定期阅读规则中心公告",
        },
        {
            "id": "keyword-cover",
            "title": "黄金标题要点",
            "category": "选品测款",
            "summary": "标题要覆盖真实搜索词，并与主图、SKU 匹配，避免无效词和违规词。",
            "points": [
                "先整理真实搜索词，按相关性和竞争度排序。",
                "核心词前置，属性词、场景词、规格词合理组合。",
                "标题与主图描述一致，不夸大功效。",
                "避免堆砌同义词和无关品牌词。",
            ],
            "sop": "1. 收集关键词\n2. 选相关词\n3. 组合标题\n4. 匹配主图卖点",
        },
        {
            "id": "main-image",
            "title": "高点击主图",
            "category": "链接内功",
            "summary": "主图要快速回答用户‘这是什么、给谁用、有什么价值’，并围绕核心关键词展示卖点。",
            "points": [
                "优选真实清晰的产品图与使用场景。",
                "核心卖点用醒目文案，但保持主次分明。",
                "换主图前先测试，可用小范围对比或逐步轮播观察。",
                "主图视频控制在约 30 秒，核心卖点放前 10 秒。",
            ],
            "sop": "1. 提炼核心卖点\n2. 准备素材\n3. 先测试后替换\n4. 观察点击率变化",
        },
        {
            "id": "seasonal",
            "title": "季节与节点选品",
            "category": "选品测款",
            "summary": "按月份和节点提前布局应季需求，提前 2-4 周上架与起量，避开爆发当天才开始准备。",
            "points": [
                "1-2 月：春节、年货、情人节、元宵。",
                "3-4 月：开学、春游、家装、母亲节筹备。",
                "5-6 月：露营、夏季、儿童节、端午。",
                "7-8 月：防暑、七夕、开学季筹备。",
                "9-10 月：开学、教师节、中秋、国庆出行。",
                "11-12 月：双十一、圣诞、保暖、年货。",
            ],
            "sop": "1. 提前 2-4 周选品\n2. 上链接并完善内功\n3. 小预算预跑观察\n4. 节点前一周加大预算",
        },
        {
            "id": "service",
            "title": "客服与售后",
            "category": "合规",
            "summary": "客服响应、售后处理与 DSR 是长期流量和转化的重要基础。",
            "points": [
                "在平台规定时段保持快速有效回复，自动回复不计有效回复。",
                "常见问题建立标准话术，减少响应延迟。",
                "通过真实物流与售后能力降低纠纷率。",
                "不承诺无法兑现的内容，不私下导流。",
            ],
            "sop": "1. 搭建 FAQ 话术\n2. 设置值班与提醒\n3. 真实处理售后\n4. 复盘差评与投诉",
        },
    ]


# ----------------------------- 任务模板 -----------------------------

def task_templates() -> list[dict]:
    return [
        {"id": "t-new-listing", "title": "新建差异化链接", "module": "选品测款", "default_priority": "P2", "checklist": [
            "确认商品类目与资质", "准备 3-5 套主图卖点", "设置差异化 SKU", "完善标题与详情"]},
        {"id": "t-cold-start", "title": "广告冷启动测试", "module": "推广", "default_priority": "P1", "checklist": [
            "设置小额日预算", "中等出价跑 2-3 天", "记录曝光/点击/成交", "按单笔成交花费校准出价"]},
        {"id": "t-roi-check", "title": "投产复盘", "module": "数据", "default_priority": "P1", "checklist": [
            "更新售价与毛利", "计算保本 ROI", "对比实际广告 ROI", "决定放量/拖价/暂停"]},
        {"id": "t-listing-audit", "title": "链接内功体检", "module": "链接内功", "default_priority": "P2", "checklist": [
            "标题关键词与主图一致", "SKU 描述真实清晰", "详情卖点主次分明", "主图/视频完整"]},
        {"id": "t-compliance-audit", "title": "合规自检", "module": "合规", "default_priority": "P0", "checklist": [
            "类目正确", "无虚假宣传/低价引流", "发货与物流合规", "客服限时响应", "不导流/不辱骂"]},
        {"id": "t-seo", "title": "搜索词与标题优化", "module": "选品测款", "default_priority": "P2", "checklist": [
            "更新搜索词表", "调整标题核心词位置", "核对主图与标题一致性"]},
        {"id": "t-campaign-scale", "title": "广告放量评估", "module": "推广", "default_priority": "P1", "checklist": [
            "确认实际 ROI > 目标线", "观察花费速度", "分阶段递增预算", "持续监控 CTR/CVR"]},
        {"id": "t-service", "title": "客服与售后巡检", "module": "合规", "default_priority": "P1", "checklist": [
            "检查有效回复率", "处理未回复咨询", "复盘差评与投诉"]},
    ]


# ----------------------------- 离线字段计算（供 API 使用） -----------------------------

def enrich_product(p: Product) -> dict:
    d = p.to_dict()
    cm = p.click_metrics()
    d.update({
        "margin": round(p.margin, 4),
        "effective_rate": round(p.effective_rate, 4),
        "effective_profit": p.effective_profit,
        "auto_profit": p.auto_profit,
        "has_cost_breakdown": p.has_cost_breakdown,
        "break_even_roi": p.break_even_roi,
        "target_roi": p.target_roi,
        "est_cpc_break_even": p.est_cpc_break_even,
        "cpa_benchmark": p.cpa_benchmark,
        "suggested_daily_budget": p.suggested_daily_budget,
        "ctr": cm["ctr"],
        "cvr": cm["cvr"],
    })
    return d


def load_products() -> list[dict]:
    if not os.path.exists(DB_PATH):
        return []
    try:
        with open(DB_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_products(items: list[dict]) -> None:
    with open(DB_PATH, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


def add_product(item: dict) -> dict:
    items = load_products()
    if "id" not in item or not item["id"]:
        item["id"] = "p" + str(int(__import__("time").time()))
    # 覆盖式更新
    idx = next((i for i, p in enumerate(items) if p.get("id") == item["id"]), None)
    if idx is None:
        items.append(item)
    else:
        items[idx] = item
    save_products(items)
    return item


def delete_product(pid: str) -> bool:
    items = load_products()
    new_items = [p for p in items if p.get("id") != pid]
    if len(new_items) == len(items):
        return False
    save_products(new_items)
    return True


def load_tasks() -> list[dict]:
    if not os.path.exists(TASKS_PATH):
        return []
    try:
        with open(TASKS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_tasks(items: list[dict]) -> None:
    with open(TASKS_PATH, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


# ----------------------------- 关键词库 -----------------------------

KEYWORDS_PATH = os.path.join(DATA_DIR, "keywords.json")

# 种子词（从现有商品标题 + 门后挂钩类目提炼，作为初始储备）
SEED_KEYWORDS = [
    # 核心词
    ("门后挂钩", "核心词", "现有商品标题"),
    ("挂衣钩", "核心词", "现有商品标题"),
    ("挂衣架", "核心词", "现有商品标题"),
    ("挂钩", "核心词", "现有商品标题"),
    ("置物架", "核心词", "现有商品标题"),
    ("门后收纳", "核心词", "品类拓展"),
    ("挂架", "核心词", "现有商品标题"),
    ("衣钩", "核心词", "现有商品标题"),
    # 属性词
    ("免打孔", "属性词", "现有商品标题"),
    ("免钉", "属性词", "现有商品标题"),
    ("无痕", "属性词", "现有商品标题"),
    ("打孔", "属性词", "现有商品标题"),
    ("加粗加厚", "属性词", "现有商品标题"),
    ("强力", "属性词", "现有商品标题"),
    ("铁艺", "属性词", "品类拓展"),
    ("壁挂", "属性词", "品类拓展"),
    # 场景词
    ("宿舍", "场景词", "现有商品标题"),
    ("卧室", "场景词", "现有商品标题"),
    ("卫生间", "场景词", "现有商品标题"),
    ("客厅", "场景词", "品类拓展"),
    ("门上", "场景词", "现有商品标题"),
    ("墙上", "场景词", "现有商品标题"),
    ("门后", "场景词", "现有商品标题"),
    # 规格词
    ("多钩", "规格词", "品类拓展"),
    ("五钩", "规格词", "品类拓展"),
    ("七钩", "规格词", "品类拓展"),
    ("单钩", "规格词", "品类拓展"),
    ("1个装", "规格词", "品类拓展"),
    ("4个装", "规格词", "品类拓展"),
]


# 产品线配置：产品名 -> 关联词表（高关联/中关联）。新增产品在此加配置即可。
PRODUCTS = {
    "门后挂钩": {
        "高": ["挂钩", "衣钩", "门后", "挂衣钩"],
        "中": ["挂衣架", "衣架", "收纳架", "置物架", "挂架", "挂衣"],
    },
}


def classify_keyword(word: str, category: str = "", product: str = "门后挂钩") -> str:
    """关联性规则：按产品判断关键词与该产品核心类目的匹配度。"""
    # 属性/场景/规格词是组合素材，默认中关联（单独出现非完整搜索词）
    if category in ("属性词", "场景词", "规格词"):
        return "中"
    cfg = PRODUCTS.get(product)
    if not cfg:
        return "中"  # 未知产品，无法判断关联性，默认中
    if any(t in word for t in cfg.get("高", [])):
        return "高"
    if any(t in word for t in cfg.get("中", [])):
        return "中"
    return "低"


def _seed_keywords() -> list[dict]:
    now = __import__("time").strftime("%Y-%m-%d %H:%M:%S")
    return [
        {
            "id": "kw_seed_%d" % i,
            "word": word,
            "category": cat,
            "source": src,
            "status": "待用",
            "notes": "",
            "created_at": now,
            "product": "门后挂钩",
            "shop": "拼多多",
            "hot": "热" if cat == "核心词" else "中",
            "relevance": classify_keyword(word, cat, "门后挂钩"),
        }
        for i, (word, cat, src) in enumerate(SEED_KEYWORDS)
    ]


def load_keywords() -> list[dict]:
    if not os.path.exists(KEYWORDS_PATH):
        items = _seed_keywords()
        save_keywords(items)
        return items
    try:
        with open(KEYWORDS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_keywords(items: list[dict]) -> None:
    with open(KEYWORDS_PATH, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


def add_keyword(item: dict) -> dict:
    items = load_keywords()
    if "id" not in item or not item["id"]:
        item["id"] = "kw" + str(int(__import__("time").time()))[-6:] + str(len(items))
    item.setdefault("product", "门后挂钩")
    item.setdefault("shop", "拼多多")
    item.setdefault("hot", "中")
    item.setdefault("relevance", classify_keyword(item.get("word", ""), item.get("category", ""), item.get("product", "门后挂钩")))
    # 去重：同词已存在则覆盖更新
    idx = next((i for i, k in enumerate(items) if k.get("word") == item.get("word")), None)
    if idx is None:
        items.append(item)
    else:
        items[idx] = item
    save_keywords(items)
    return item


def delete_keyword(kid: str) -> bool:
    items = load_keywords()
    new_items = [k for k in items if k.get("id") != kid]
    if len(new_items) == len(items):
        return False
    save_keywords(new_items)
    return True


if __name__ == "__main__":
    fixtures = [
        {"id": "p1", "name": "示例商品 A", "selling_price": 29.9, "gross_profit": 9.0,
         "ad_cost": 6.0, "refund_rate": 0.20, "ad_spend": 120.0, "orders": 10,
         "impressions": 5000, "clicks": 250, "sold": 12, "notes": "测试数据"},
    ]
    if not os.path.exists(DB_PATH):
        save_products(fixtures)
        print("已初始化示例数据 ->", DB_PATH)
    else:
        print("已有产品数据，跳过初始化。")
