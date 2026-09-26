# -*- coding: utf-8 -*-
"""电商运营工作台：结构化运营知识与数据模型。

本模块只收录符合平台规则与法律法规的合规运营知识，
不包含刷单、改销量、异常价格、恶意比价规避、虚假宣传等高风险做法。
"""
from __future__ import annotations

import json
import os
import random
import subprocess
import time
import urllib.request
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
    platform_product_id: str = ""   # 平台商品ID（关联 catalog.products / 真实ROI）
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
            "platform_product_id": self.platform_product_id,
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
        {
            "id": "formula-sales",
            "title": "销售指标",
            "category": "关键公式",
            "summary": "评估团队业绩、判断活动效果、发现趋势与问题的核心口径。",
            "points": [
                "GMV（交易总额）= 订单数 × 客单价（例：150 单 × 75 元 = 11,250 元）",
                "客单价 = 销售额 ÷ 订单数（例：210,000 ÷ 1,200 = 175 元）",
                "UV 价值 = 销售额 ÷ 访问人数（例：48,000 ÷ 1,600 = 30 元，越高流量质量越好）",
                "月环比增长率 =（本月 − 上月）÷ 上月 × 100%（例：(320,000−280,000)÷280,000 ≈ 14.3%）",
            ],
            "sop": "1. 按月固定口径统计\n2. 与上月/同期对比\n3. 定位增长或下滑点",
        },
        {
            "id": "formula-profit",
            "title": "利润与成本",
            "category": "关键公式",
            "summary": "判断盈利能力、定价与成本控制的依据。",
            "points": [
                "利润 = 毛利 − 推广费 − 平台佣金 − 物流及包装成本（例：120,000−30,000−6,000−8,000 = 76,000 元）",
                "净利率 = 净利润 ÷ 销售额 × 100%（例：36,000 ÷ 200,000 = 18%，越高盈利能力越强）",
                "毛利率 =（销售额 − 成本）÷ 销售额 × 100%（例：(90,000−54,000)÷90,000 = 40%）",
                "盈亏平衡点 = 1 ÷ 毛利率（例：毛利率 30% → 1÷0.30 ≈ 3.33 倍，销售额达成本 3.33 倍开始盈利）",
                "定价倍率 = 售价 ÷ 成本（例：480 ÷ 160 = 3.0 倍）",
                "推广费率比 = 广告投入 ÷ 营业额 × 100%（例：45,000 ÷ 450,000 = 10%，越低广告效率越高）",
            ],
            "sop": "1. 逐项算成本\n2. 得出毛利/净利\n3. 结合毛利率判断是否可持续",
        },
        {
            "id": "formula-ad",
            "title": "推广效果",
            "category": "关键公式",
            "summary": "衡量广告获取流量与成交效率，指导出价和预算。",
            "points": [
                "PPC（单次点击成本）= 广告花费 ÷ 点击次数（例：5,000 ÷ 1,000 = 5 元/次，越低获客成本越低）",
                "ROI（投资回报率）= 成交金额 ÷ 广告花费（例：90,000 ÷ 15,000 = 6.0，越高收益越好）",
                "CPM（千次展示成本）= 广告花费 ÷ 展示量 × 1000（例：3,000 ÷ 100,000 × 1000 = 30 元/千次）",
                "eCPM（千次展示收益）= CTR × CVR × 出价 × 1000（例：0.07×0.05×2×1000 = 7 元/千次）",
                "CTR（点击率）= 点击量 ÷ 展示量 × 100%（例：1,200 ÷ 40,000 = 3%，反映广告吸引力）",
            ],
            "sop": "1. 记录花费/点击/展示/成交\n2. 逐项算 PPC/ROI/CTR\n3. 对比毛利判断是否放量",
        },
        {
            "id": "formula-conversion",
            "title": "用户转化与行为",
            "category": "关键公式",
            "summary": "衡量商品、详情页与直播间对用户的打动与承接能力。",
            "points": [
                "CVR（广告转化率）= 转化人数 ÷ 点击人数 × 100%（例：200 ÷ 2,500 = 8.0%）",
                "转化率 = 订单数 ÷ 访客数 × 100%（例：200 ÷ 8,000 = 2.5%，越高详情页越能打动用户）",
                "直播带货转化率 = 订单人数 ÷ 观看人数 × 100%（例：160 ÷ 4,000 = 4%）",
                "加购率 = 加购人数 ÷ 访客数 × 100%（例：720 ÷ 9,000 = 8%，反映吸引力与价格竞争力）",
                "涨粉率 = 新增粉丝数 ÷ 观看人数 × 100%（例：360 ÷ 6,000 = 6%）",
                "咨询率 = 咨询人数 ÷ 访客数 × 100%（例：210 ÷ 7,000 = 3%，越高兴趣越强需及时响应）",
                "访问深度 = 总浏览量 ÷ 访客数（例：36,000 ÷ 10,000 = 3.6 页/人）",
                "曝光进入率 = 进入直播间人数 ÷ 曝光人数 × 100%（例：480 ÷ 15,000 = 3.2%，反映封面/标题吸引力）",
            ],
            "sop": "1. 按周/月统计转化链路\n2. 定位点击→加购→成交短板\n3. 针对性优化主图/详情/直播",
        },
        {
            "id": "kw-sources",
            "title": "关键词来源清单（7大来源）",
            "category": "关键词库",
            "summary": "按优先级排序的词库来源，区分「直接进词库」和「素材拆解」，所有新词先进备用池验证。",
            "points": [
                "① 平台官方搜索源（最高优先）：搜索下拉/联想词、拼多多搜索词分析、淘宝生意参谋。自带搜索量/点击率，直接导入备用池。",
                "② 竞品标题&引流词：不整词入库，AI 分词拆成核心/属性/卖点/营销词；完整标题提取为模板。",
                "③ 自家店铺入店词（价值最高）：访客搜索词/成交词/广告词，权重直接拉高。",
                "④ 评价/问大家（痛点词宝库）：反向变卖点（易生锈→不易生锈），适合标题钩子。",
                "⑤ 类目词表/平台属性库：颜色/尺寸/材质/人群，填充属性词/材质词，几乎不违规。",
                "⑥ 第三方工具词库（谨慎）：数据有延迟，仅补充素材，权重不可采信。",
                "⑦ AI 同义词扩充（仅多样性）：全部进备用池，测试后再定权重。",
            ],
            "sop": "1. 多来源采集词\n2. 自动清洗去重标准化\n3. AI 分词打词角色 + 预筛初始权重\n4. 新词进备用池\n5. 生成标题上架测试\n6. 拉投产数据回流迭代权重",
        },
        {
            "id": "formula-risk",
            "title": "运营与风险监控",
            "category": "关键公式",
            "summary": "监控页面承接、售后、商品结构健康度的风险指标。",
            "points": [
                "跳失率 = 跳失人数 ÷ 访问人数 × 100%（例：1,900 ÷ 6,000 ≈ 31.7%，越低页面吸引力越强）",
                "退货率 = 退货订单数 ÷ 总订单数 × 100%（例：28 ÷ 800 = 3.5%，反映售后体验与商品匹配度）",
                "纠纷计入率 = 30 天内纠纷订单数 ÷ 30 天支付订单数 × 100%（例：20 ÷ 350 ≈ 5.7%）",
                "动销率 = 近 30 天实际销售商品数 ÷ 在售商品总数 × 100%（例：110 ÷ 160 ≈ 68.8%，越高商品结构越健康）",
                "商品点击率 = 商品被点击次数 ÷ 商品被展现次数 × 100%（例：630 ÷ 2,100 = 30%，影响推荐权重）",
            ],
            "sop": "1. 定期统计跳失/退货/纠纷\n2. 排查滞销与问题商品\n3. 优化主图标题与售后流程",
        },
        {
            "id": "newbie-select",
            "title": "新手选品：先从自己懂的入手",
            "category": "新手入门",
            "summary": "新手不用研究花里胡哨的选品方法，先从身边找：老家特产、平时喜欢研究的、长期用过买过懂一点的东西。",
            "points": [
                "从身边找：老家有什么特产 / 平时喜欢研究什么 / 长期用过买过、懂一点的东西。",
                "熟悉的东西做起来才顺，别人来问你也接得住，买家能感受到你真懂。",
                "别一上来囤货：能一件代发先代发，卖得动再慢慢补货，卖不动马上换。",
                "先测试 → 再补货；先验证市场，再放大投入。",
            ],
            "sop": "1. 列出身边熟悉、用过的品类\n2. 挑 1 个最懂的\n3. 一件代发上架\n4. 小量测试\n5. 有稳定出单再考虑囤货",
        },
        {
            "id": "newbie-dropship",
            "title": "一件代发与货源筛选",
            "category": "新手入门",
            "summary": "抖店后台服务市场找铺货工具（如爱用铺货），绑定店铺后去 1688 找货源，先跑通流程比一次选中爆款更重要。",
            "points": [
                "进后台服务市场装铺货工具，绑定店铺后去 1688 找货源。",
                "先选对类目，再按条件筛：抖音电子面单 / 包邮 / 7 天无理由 / 一件代发 / 48 小时发货。",
                "商家类型优先看工厂型商家。",
                "别看到便宜就上，先看供应商靠不靠谱。",
            ],
            "sop": "1. 服务市场装铺货工具\n2. 绑定店铺\n3. 选类目\n4. 按条件筛 1688 货源\n5. 上架测试\n流程：选类目 → 筛条件 → 看供应商 → 上架测试",
        },
        {
            "id": "newbie-feedback",
            "title": "自己回客服，反馈就是产品经理",
            "category": "新手入门",
            "summary": "前期有人咨询、售后先自己回。客户问的每个问题，都在告诉你商品哪里没讲清楚。",
            "points": [
                "客服话术：您好～请问有什么可以帮您吗？",
                "所有人都在问同一个问题 → 详情页没写清楚。",
                "很多人犹豫同一个地方 → 卖点没讲透。",
                "边回客户边改商品，客户反馈 = 免费的产品经理。",
            ],
            "sop": "1. 自己回客服\n2. 记录高频问题\n3. 改详情页 / 卖点\n4. 复看是否还有人问\n流程：客户提问 → 发现问题 → 修改商品",
        },
        {
            "id": "newbie-mindset",
            "title": "新手心态：跑通比爆单重要",
            "category": "新手入门",
            "summary": "电商不是商品一挂就坐等赚钱。前期单少、起量慢很正常，别焦虑别人爆单，每天把该做的事做好。",
            "points": [
                "做电商不是把商品一挂就坐等赚钱。",
                "前期单少、起量慢，很正常。",
                "别天天刷别人「3 天起店」「7 天爆单」然后自己焦虑。",
                "别人几天做起来，跟你没关系；你每天把选品、上架、优化、回客户、看数据、测试做好。",
            ],
            "sop": "1. 固定节奏做该做的事\n2. 看数据\n3. 持续优化\n4. 不和别人比速度",
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
        import time, random
        item["id"] = "p" + str(int(time.time() * 1000)) + str(random.randint(0, 999))
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


# ----------------------------- 运营日志 -----------------------------

LOGS_PATH = os.path.join(DATA_DIR, "logs.json")


def load_logs() -> list[dict]:
    if not os.path.exists(LOGS_PATH):
        return []
    try:
        with open(LOGS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_logs(items: list[dict]) -> None:
    with open(LOGS_PATH, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


def add_log(item: dict) -> dict:
    items = load_logs()
    if "id" not in item or not item["id"]:
        item["id"] = "log" + str(int(__import__("time").time()))
    # 覆盖式更新
    idx = next((i for i, t in enumerate(items) if t.get("id") == item["id"]), None)
    if idx is None:
        items.append(item)
    else:
        items[idx] = item
    save_logs(items)
    return item


def delete_log(lid: str) -> bool:
    items = load_logs()
    new_items = [t for t in items if t.get("id") != lid]
    if len(new_items) == len(items):
        return False
    save_logs(new_items)
    return True


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


# 关键词新字段默认值（标题生成结构化元数据，向后兼容旧数据）
KEYWORD_DEFAULTS = {
    "weight": 5,               # 0-10 权重，0=禁用不参与生成
    "pool_type": "main",       # main主池 / spare备用池 / black黑名单
    "platform_scope": "all",   # all / pdd / taobao
    "mutually_exclude": [],    # 互斥词列表（命中 A 则禁抽 B）
    "max_occur": 1,            # 单条标题最大出现次数
    # ---- 数据维度（权重体系核心，预筛打分 + 线上数据验证用）----
    "search_volume": 0,        # 搜索量（平台行业数据，预筛用）
    "competition": 0,          # 竞争度 0-100（越高越红海）
    "ctr": 0.0,                # 真实点击率（0-1，线上数据）
    "cvr": 0.0,                # 真实转化率（0-1，线上数据）
    "roi": 0.0,                # 投产比（成交金额/广告花费）
}


def normalize_keyword(item: dict) -> dict:
    """给关键词补全新字段默认值（旧数据无这些字段）。"""
    for k, v in KEYWORD_DEFAULTS.items():
        if k not in item or item[k] is None:
            item[k] = list(v) if isinstance(v, list) else v
    return item


def load_keywords() -> list[dict]:
    if not os.path.exists(KEYWORDS_PATH):
        items = _seed_keywords()
        save_keywords(items)
        return items
    try:
        with open(KEYWORDS_PATH, "r", encoding="utf-8") as f:
            items = json.load(f)
        return [normalize_keyword(k) for k in items]
    except Exception:
        return []


def save_keywords(items: list[dict]) -> None:
    with open(KEYWORDS_PATH, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


def add_keyword(item: dict) -> dict:
    items = load_keywords()
    if "id" not in item or not item["id"]:
        import uuid
        item["id"] = "kw" + uuid.uuid4().hex[:10]
    # 兜底：如果传入的 id 与现有词重复（历史脏数据），强制换新 id
    while any(k.get("id") == item["id"] for k in items):
        import uuid
        item["id"] = "kw" + uuid.uuid4().hex[:10]
    item.setdefault("product", "门后挂钩")
    item.setdefault("shop", "拼多多")
    item.setdefault("hot", "中")
    item.setdefault("relevance", classify_keyword(item.get("word", ""), item.get("category", ""), item.get("product", "门后挂钩")))
    normalize_keyword(item)
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


def clean_keywords() -> dict:
    """批量清洗：去重 + 文本标准化 + 脏词标记（移 black 池）。返回统计。"""
    import re
    items = load_keywords()
    # 1. 文本标准化：全角空格/标点转半角，去多余空格
    for k in items:
        w = (k.get("word") or "").strip()
        w = w.replace("\u3000", " ").replace("\uff0c", ",").replace("\u3002", ".")
        w = " ".join(w.split())
        k["word"] = w
    # 2. 去重：完全相同词只保留第一个
    seen = {}
    deduped = []
    dup_count = 0
    for k in items:
        w = k.get("word")
        if not w:
            continue
        if w in seen:
            dup_count += 1
            continue
        seen[w] = True
        deduped.append(k)
    # 3. 脏词标记：超长(>30字) 或 纯非中文 → black 池
    dirty_count = 0
    for k in deduped:
        w = k.get("word", "")
        has_cjk = bool(re.search(r"[\u4e00-\u9fff]", w))
        if len(w) > 30 or (len(w) > 1 and not has_cjk):
            k["pool_type"] = "black"
            dirty_count += 1
    save_keywords(deduped)
    return {"total": len(deduped), "deduped": dup_count, "dirty": dirty_count}


def batch_update_keywords(ids: list, fields: dict) -> int:
    """批量更新关键词字段（打标签/池子迁移/权重）。返回更新数量。"""
    items = load_keywords()
    updated = 0
    for k in items:
        if ids and k.get("id") not in ids:
            continue
        for f, v in fields.items():
            if f in KEYWORD_DEFAULTS or f in ("category", "status", "hot", "relevance", "notes", "product", "shop", "source"):
                k[f] = v
        normalize_keyword(k)
        updated += 1
    save_keywords(items)
    return updated


# ----------------------------- 权重体系：预筛打分 + 动态权重 -----------------------------

# 广告法极限词（命中即黑名单，不参与标题生成）
AD_ILLEGAL_WORDS = [
    "最", "第一", "唯一", "顶级", "极品", "国家级", "世界级", "史无前例",
    "100%", "百分百", "绝对", "无敌", "最佳", "领先", "销量第一", "冠军",
    "全网最低", "极致", "巅峰", "永久", "万能", "特效", "纯天然", "无副作用",
]

# 特殊词角色：这类词搜索量低但负责提升点击率，判定用 CTR 而非搜索量
SPECIAL_ROLES = ("营销词", "痛点词", "功能卖点", "卖点词", "人群", "季节时效", "材质")


def _is_illegal_word(word: str) -> bool:
    """命中广告法极限词 → 违禁。"""
    return any(il in word for il in AD_ILLEGAL_WORDS)


def score_keyword(item: dict) -> dict:
    """预筛打分：新词入库前，按搜索量/竞争度/相关性/合规 → 初始权重(0-10) + 建议池。

    规则（来自方案：备用池初始权重示例）：
    - 高搜索 + 低竞争 = 蓝海词 → 7~9
    - 行业通用基础词 → 4~6
    - 长尾小众词 → 1~3
    - 搜索量=0 → 0（禁用，仅保留词库）
    - 命中广告法极限词 → 直接黑名单，weight=0
    返回 {weight, pool_type, reason}
    """
    word = item.get("word", "")
    category = item.get("category", "")
    sv = int(item.get("search_volume", 0) or 0)
    comp = int(item.get("competition", 0) or 0)
    relevance = item.get("relevance", "中")

    # 1. 合规校验：命中极限词 → 黑名单
    if _is_illegal_word(word):
        return {"weight": 0, "pool_type": "black", "reason": "命中广告法极限词，移黑名单"}

    # 2. 跨类目/低关联 → 直接丢弃
    if relevance == "低":
        return {"weight": 0, "pool_type": "black", "reason": "与类目关联度低，丢弃"}

    # 3. 搜索量=0 → 若有热度（1688联想词等按热度采集的词），按热度保底，不直接置0
    if sv <= 0:
        hot = item.get("hot", "")
        hot_weight = {"热": 6, "中": 4, "长尾": 3}.get(hot, 0)
        if hot_weight > 0:
            return {"weight": hot_weight, "pool_type": "spare",
                    "reason": f"无搜索量但热度{hot}，按热度保底{hot_weight}"}
        return {"weight": 0, "pool_type": "spare", "reason": "搜索量为0，置0观察"}

    # 4. 蓝海判定：高搜索 + 低竞争
    base = 0
    reason = []
    if sv >= 10000:
        base = 6
        reason.append("搜索量≥1万")
    elif sv >= 1000:
        base = 5
        reason.append("搜索量1千-1万")
    elif sv >= 100:
        base = 3
        reason.append("搜索量100-1000")
    else:
        base = 2
        reason.append("搜索量<100")

    # 竞争度修正
    if comp < 30:
        base += 2
        reason.append("低竞争(蓝海)+2")
    elif comp < 70:
        base += 0
        reason.append("中竞争")
    else:
        base -= 1
        reason.append("高竞争(红海)-1")

    # 词角色修正：核心主词高价值，属性/材质稳定中等
    if category == "核心词":
        base += 1
        reason.append("核心主词+1")
    elif category in ("属性词", "材质", "规格词"):
        base += 0
    elif category in SPECIAL_ROLES:
        # 营销/痛点/卖点词：搜索量低但点击意向强，保底中等
        base = max(base, 4)
        reason.append("特殊词(看CTR)保底4")

    weight = max(0, min(10, base))
    pool = "main" if weight >= 4 else "spare"
    return {"weight": weight, "pool_type": pool, "reason": "，".join(reason)}


def rescore_all_keywords() -> dict:
    """批量重跑预筛打分（仅对 spare 池或未上线词；main 池已上线词保留人工权重）。"""
    items = load_keywords()
    scored = 0
    for k in items:
        if k.get("pool_type", "main") == "main":
            continue  # 已上线词不重打分，靠线上数据动态迭代
        r = score_keyword(k)
        k["weight"] = r["weight"]
        k["pool_type"] = r["pool_type"]
        scored += 1
    save_keywords(items)
    return {"scored": scored}


def update_weight_by_metrics(item: dict, ctr_avg: float, cvr_avg: float) -> dict:
    """公式化动态权重：基础分 + CTR加分 + CVR加分 + ROI加分 - 惩罚扣分，钳位 0-10。

    用于主词池已上线词，依据店铺真实数据（ctr/cvr/roi 字段）迭代权重。
    ctr_avg/cvr_avg = 类目均值（所有标题的加权平均）。
    返回 {weight, delta, reason}
    """
    base = int(item.get("weight", 5) or 0)
    ctr = float(item.get("ctr", 0) or 0)
    cvr = float(item.get("cvr", 0) or 0)
    roi = float(item.get("roi", 0) or 0)
    category = item.get("category", "")

    delta = 0
    reasons = []
    # CTR 加分（高于类目均值）
    if ctr_avg > 0 and ctr > 0:
        if ctr >= ctr_avg * 1.3:
            delta += 2
            reasons.append(f"CTR {ctr:.1%} 显著高于均值 {ctr_avg:.1%} +2")
        elif ctr >= ctr_avg:
            delta += 1
            reasons.append(f"CTR {ctr:.1%} 高于均值 {ctr_avg:.1%} +1")
        elif ctr <= ctr_avg * 0.5:
            delta -= 2
            reasons.append(f"CTR {ctr:.1%} 显著低于均值 {ctr_avg:.1%} -2")
        elif ctr < ctr_avg:
            delta -= 1
            reasons.append(f"CTR {ctr:.1%} 低于均值 {ctr_avg:.1%} -1")
    # CVR 加分
    if cvr_avg > 0 and cvr > 0:
        if cvr >= cvr_avg * 1.3:
            delta += 2
            reasons.append(f"CVR {cvr:.1%} 显著高于均值 {cvr_avg:.1%} +2")
        elif cvr >= cvr_avg:
            delta += 1
            reasons.append(f"CVR {cvr:.1%} 高于均值 {cvr_avg:.1%} +1")
        elif cvr <= cvr_avg * 0.5:
            delta -= 2
            reasons.append(f"CVR {cvr:.1%} 显著低于均值 {cvr_avg:.1%} -2")
        elif cvr < cvr_avg:
            delta -= 1
            reasons.append(f"CVR {cvr:.1%} 低于均值 {cvr_avg:.1%} -1")
    # ROI 加分
    if roi > 0:
        if roi >= 3:
            delta += 1
            reasons.append(f"ROI {roi:.1f} ≥3 +1")
        elif roi < 1:
            delta -= 1
            reasons.append(f"ROI {roi:.1f} <1 亏损 -1")
    # 特殊词（营销/痛点/卖点）只看 CTR，不看搜索量
    if category in SPECIAL_ROLES and ctr > 0:
        # 这类词价值在点击率，CTR 高直接拉权重
        if ctr >= 0.03:
            delta += 1
            reasons.append("特殊词高CTR +1")
        elif ctr < 0.01:
            delta -= 1
            reasons.append("特殊词低CTR -1")

    new_weight = max(0, min(10, base + delta))
    if not reasons:
        reasons.append("无线上数据，维持")
    return {"weight": new_weight, "delta": delta, "reason": "；".join(reasons)}


# 标题模板库（占位符对应 category 词角色）
TITLE_TEMPLATES = [
    {"id": "tpl1", "name": "核心+属性+场景", "pattern": "{核心词}{属性词}{场景词}"},
    {"id": "tpl2", "name": "核心+属性+规格", "pattern": "{核心词}{属性词}{规格词}"},
    {"id": "tpl3", "name": "属性+核心+场景", "pattern": "{属性词}{核心词}{场景词}"},
    {"id": "tpl4", "name": "核心+场景+属性+规格", "pattern": "{核心词}{场景词}{属性词}{规格词}"},
    {"id": "tpl5", "name": "核心+属性+属性+场景", "pattern": "{核心词}{属性词}{属性词}{场景词}"},
]


def _weighted_pick(pool, exclude_words=()):
    """按 weight 加权随机抽取，排除 exclude_words（词文本）。"""
    pool = [k for k in pool if k.get("word") not in exclude_words and k.get("weight", 5) > 0]
    if not pool:
        return None
    weights = [max(1, int(k.get("weight", 5))) for k in pool]
    total = sum(weights)
    r = random.uniform(0, total)
    for i, k in enumerate(pool):
        r -= weights[i]
        if r <= 0:
            return k
    return pool[-1]


def _has_repeat(title, words):
    """检测词表词是否在标题中重复出现（避免「免打孔免打孔」）。"""
    for w in words:
        if len(w) >= 2 and title.count(w) > 1:
            return True
    return False


def generate_titles(core, n=10, platform="all", template_ids=None):
    """模板+结构化词库的加权随机标题生成（权重/互斥/max_occur/长度校验）。"""
    import re
    n = max(1, min(50, int(n or 10)))  # 钳位 1-50，防超大请求
    kws = load_keywords()
    # 过滤：main 池 + weight>0 + 平台匹配
    pool = [k for k in kws if k.get("pool_type", "main") == "main" and k.get("weight", 5) > 0]
    if platform != "all":
        pool = [k for k in pool if k.get("platform_scope", "all") in ("all", platform)]
    by_cat = {}
    for k in pool:
        by_cat.setdefault(k.get("category", ""), []).append(k)
    templates = [t for t in TITLE_TEMPLATES if not template_ids or t["id"] in template_ids] or TITLE_TEMPLATES
    titles = set()
    guard = 0
    while len(titles) < n and guard < 500:
        guard += 1
        tpl = random.choice(templates)
        tokens = re.findall(r"\{([^}]+)\}", tpl["pattern"])
        parts = []
        picked = []   # 已选词对象
        used = {}     # 词文本 → 出现次数
        ok = True
        for role in tokens:
            if role == "核心词":
                parts.append(core)
                continue
            cand = _weighted_pick(by_cat.get(role, []), exclude_words=[p["word"] for p in picked])
            if cand is None:
                ok = False
                break
            w = cand.get("word", "")
            # max_occur 检查
            if used.get(w, 0) >= cand.get("max_occur", 1):
                ok = False
                break
            # 互斥检查：cand 的 mutually_exclude 命中已选词，或已选词的 mutually_exclude 命中 cand
            conflict = any(me in [p["word"] for p in picked] for me in cand.get("mutually_exclude", []))
            if not conflict:
                conflict = any(w in p.get("mutually_exclude", []) for p in picked)
            if conflict:
                ok = False
                break
            parts.append(w)
            picked.append(cand)
            used[w] = used.get(w, 0) + 1
        if not ok:
            continue
        t = "".join(parts)
        if 6 <= len(t) <= 30 and not _has_repeat(t, [p["word"] for p in picked]):
            titles.add(t)
    return list(titles)


def feedback_title(title, performance):
    """标题表现回流：拆解标题关键词，调整 weight（good +1 / bad -1，0-10 夹逼）。

    用子串匹配（词库词 ∈ 标题），高表现标题里的词权重 +1，低表现 -1。
    """
    items = load_keywords()
    delta = 1 if performance == "good" else -1
    matched = 0
    for k in items:
        w = k.get("word", "")
        if len(w) >= 2 and w in title:
            k["weight"] = max(0, min(10, int(k.get("weight", 5)) + delta))
            matched += 1
    save_keywords(items)
    return {"matched": matched, "delta": delta}


# ----------------------------- 1688 搜索联想词采集（CDP） -----------------------------

NODE_EXE = "/mnt/d/Program Files/nodejs/node.exe"
CDP_EVAL_JS = r"C:\tmp\cdp_eval.js"
EDGE_RESTART_PS1 = r"C:\tmp\restart_edge2.ps1"
_1688_SEARCH_URL = "https://s.1688.com/selloffer/offer_search.htm?keywords={kw}"


def _cdp_eval(js, timeout=30):
    """通过 node.exe + cdp_eval.js 在 Edge 里执行 JS，返回 value（失败返回 None）。"""
    try:
        r = subprocess.run([NODE_EXE, CDP_EVAL_JS], input=js,
                           capture_output=True, text=True, timeout=timeout)
        d = json.loads(r.stdout)
        return d["result"]["value"]
    except Exception:
        return None


def _edge_cdp_alive():
    """Edge CDP（9222）是否可用。"""
    return _cdp_eval("(() => 'OK')()", timeout=8) == "OK"


def _start_edge_cdp():
    """启动 Edge CDP（独立 profile，9222）。"""
    try:
        subprocess.run(["powershell.exe", "-ExecutionPolicy", "Bypass",
                        "-File", EDGE_RESTART_PS1],
                       capture_output=True, timeout=60)
    except Exception:
        pass
    time.sleep(2)


def _hot_of(rank):
    """联想词排序 → 热度分档：前3热，4-8中，9+长尾。"""
    if rank <= 3:
        return "热"
    if rank <= 8:
        return "中"
    return "长尾"


def _navigate_1688(word):
    """导航到 1688 搜索页（用首个核心词）。"""
    import urllib.parse
    kw = urllib.parse.quote(word)
    js = f"(() => {{ location.href = '{_1688_SEARCH_URL.format(kw=kw)}'; return 'nav'; }})()"
    _cdp_eval(js, timeout=15)
    time.sleep(5)


def _check_1688_login():
    """检查 1688 是否已登录。返回 (ok, errmsg)。

    1688 登录态失效时会跳转 login.taobao.com，搜索框 #alisearch-input 不存在，
    导致联想词静默采不到。这里提前检测，返回明确错误而非 0 个词。
    """
    js = ("(() => JSON.stringify({href: location.href, "
          "hasInput: !!document.querySelector('#alisearch-input')}))()")
    v = _cdp_eval(js, timeout=8)
    if v:
        try:
            d = json.loads(v)
            href = d.get("href", "")
            if "login" in href.lower() or not d.get("hasInput"):
                return False, "1688 登录态失效（已跳转登录页），请扫码登录后重试"
            return True, ""
        except Exception:
            pass
    return True, ""  # 检测失败不阻塞（避免误杀正常采集）



def _collect_1688_suggest(word):
    """采集单个核心词的联想词，返回 [(词, 排序), ...]（排序越前越热）。

    优先从 .suggestion-item 的 data-aplus-report 属性解析 suggests（完整干净），
    fallback 到 textContent（过滤「复制下拉词」杂质）。空结果重试 3 次（导航后页面偶发未就绪）。
    """
    js_set = f'''(() => {{
      const input = document.querySelector('#alisearch-input');
      if (!input) return 'NO_INPUT';
      input.focus();
      const ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      ns.call(input, '{word}');
      input.dispatchEvent(new Event('input', {{bubbles:true}}));
      input.dispatchEvent(new Event('keyup', {{bubbles:true}}));
      return 'OK';
    }})()'''
    js_read = '''(() => {
      const items = [...document.querySelectorAll('.suggestion-item')];
      const repEl = items.find(el => el.getAttribute('data-aplus-report'));
      if (repEl) {
        const rep = repEl.getAttribute('data-aplus-report') || '';
        const m = rep.match(/suggests=([^&]+)/);
        if (m) {
          try {
            const words = decodeURIComponent(m[1]).split(';').filter(w => w && w.trim());
            if (words.length) return JSON.stringify(words);
          } catch(e) {}
        }
      }
      const raw = items.map(el => (el.textContent||'').replace(/\\s+/g,'').replace(/复制下拉词/g,'')).filter(w => w);
      return JSON.stringify(raw);
    })()'''

    for attempt in range(3):
        _cdp_eval(js_set, timeout=15)
        time.sleep(2.5 if attempt == 0 else 3.0)
        v = _cdp_eval(js_read, timeout=15)
        items = []
        if v:
            try:
                items = json.loads(v)
            except Exception:
                items = []
        result = []
        # 优先完整核心词匹配（联想词包含完整核心词且非核心词本身）
        for idx, w in enumerate(items):
            if word in w and w != word:
                result.append((w, idx + 1))
        # 完整匹配为空 → 退化为尾词匹配（后3字/后2字核心名词）。
        # 长尾核心词（如「水管门把手」「复古书籍摆件」）1688 只返回核心名词级联想词
        # （含「门把手」「摆件」不含完整词），完整匹配会全被过滤成 0。
        if not result and len(word) >= 4:
            seen = set()
            for sl in (3, 2):
                suffix = word[-sl:]
                for idx, w in enumerate(items):
                    if suffix in w and w != word and w not in seen:
                        seen.add(w)
                        result.append((w, idx + 1))
                if result:
                    break
        if result:
            return result
    return []


def collect_1688_keywords(core_words, product="门后挂钩"):
    """1688 搜索联想词采集 → 入库（长尾词，含热度排序 + 关联性）。

    参数 core_words：核心词列表（如 ["门后挂钩", "挂衣钩"]）。
    参数 product：商品归属（默认「门后挂钩」）。
    返回 {collected: [...], added: n, skipped: n, error: str|None}
    """
    # 1. 确保 Edge CDP 可用（无则启动）
    if not _edge_cdp_alive():
        _start_edge_cdp()
        if not _edge_cdp_alive():
            return {"collected": [], "added": 0, "skipped": 0,
                    "error": "Edge CDP 启动失败（9222 端口不可用），请检查 Windows Edge"}

    words = [w.strip() for w in core_words if w and w.strip()]
    if not words:
        return {"collected": [], "added": 0, "skipped": 0, "error": "核心词不能为空"}

    # 2. 导航到 1688 搜索页（首个词）
    _navigate_1688(words[0])
    login_ok, login_err = _check_1688_login()
    if not login_ok:
        return {"collected": [], "added": 0, "skipped": 0, "error": login_err}

    # 3. 逐词采集
    all_words = {}  # word -> {src, hot}
    for word in words:
        sugs = _collect_1688_suggest(word)
        for w, rank in sugs:
            hot = _hot_of(rank)
            if w not in all_words:
                all_words[w] = {"src": word, "hot": hot}
            else:
                old = all_words[w]
                if hot == "热" or (hot == "中" and old["hot"] == "长尾"):
                    all_words[w] = {"src": word, "hot": hot}
        time.sleep(1.0)

    # 全部词都没采到 → 再检测一次登录态（可能采集过程中失效跳登录页）
    if not all_words:
        login_ok2, login_err2 = _check_1688_login()
        if not login_ok2:
            return {"collected": [], "added": 0, "skipped": 0, "error": login_err2}

    # 4. 入库（长尾词，source=1688联想词，notes=核心词）
    # 新词进备用池（spare），初始权重按热度映射：热6/中4/长尾3（保守，等线上数据迭代）
    hot_weight = {"热": 6, "中": 4, "长尾": 3}
    added = 0
    skipped = 0
    collected = []
    for w, meta in all_words.items():
        item = {
            "word": w, "category": "长尾词", "source": "1688联想词",
            "status": "待用", "notes": f"核心词:{meta['src']}", "hot": meta["hot"],
            "product": product, "shop": "拼多多",
            "pool_type": "spare", "weight": hot_weight.get(meta["hot"], 3),
        }
        # 已存在则跳过（不覆盖现有词的分类/权重）
        existing = [k for k in load_keywords() if k.get("word") == w]
        if existing:
            skipped += 1
            continue
        add_keyword(item)
        added += 1
        collected.append({"word": w, "hot": meta["hot"], "src": meta["src"]})

    return {"collected": collected, "added": added, "skipped": skipped, "error": None}


# ----------------------------- 竞品标题 AI 分词拆解（DeepSeek） -----------------------------

def _load_keys_env() -> dict:
    """读 ~/.keys.env 环境变量（DeepSeek key 等）。"""
    env = {}
    p = os.path.expanduser("~/.keys.env")
    if os.path.isfile(p):
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


DEEPSEEK_API_KEY = _load_keys_env().get("DEEPSEEK_API_KEY", "")


def split_competitor_title(title):
    """AI 拆解竞品标题 → 词角色词组（核心词/属性词/材质/卖点/营销词/场景词）。

    返回 {words: [{word, role}], template: str, error: str|None}
    """
    import re
    title = (title or "").strip()
    if not title:
        return {"words": [], "template": "", "error": "标题不能为空"}
    if not DEEPSEEK_API_KEY:
        return {"words": [], "template": "", "error": "未配置 DeepSeek API key"}

    prompt = (
        "你是电商标题分词专家。把下面的商品标题拆解成词角色词组，用于关键词库和标题模板生成。\n"
        f"标题：{title}\n\n"
        "词角色枚举（只能选这些）：核心主词、属性词、材质、功能卖点、场景、营销词、规格词。\n"
        "规则：\n"
        "1. 核心主词 = 商品是什么（如：门后挂钩、挂衣钩、置物架）\n"
        "2. 属性词 = 修饰特征（免打孔、无痕、强力、加粗加厚、铁艺）\n"
        "3. 材质 = 材料（不锈钢、实木、塑料、亚克力）\n"
        "4. 功能卖点 = 解决什么问题（承重、防滑、可折叠）\n"
        "5. 场景 = 使用地点/场合（卧室、宿舍、卫生间、厨房）\n"
        "6. 营销词 = 促销/钩子词（清仓、爆款、新款、买一送一）\n"
        "7. 规格词 = 数量/尺寸（五钩、4个装、加大号）\n\n"
        "只输出 JSON 对象，格式：{\"words\":[{\"word\":\"词\",\"role\":\"核心主词\"}],\"template\":\"{核心主词}+{属性词}+{场景}\"}。"
        "词用简短词组（2-6字），不要把整段标题当一个词。不要输出 markdown 代码块。"
    )
    body = json.dumps({
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "stream": False,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.deepseek.com/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        },
    )
    try:
        resp = json.loads(urllib.request.urlopen(req, timeout=60).read())
        content = resp["choices"][0]["message"]["content"]
    except Exception as e:
        return {"words": [], "template": "", "error": f"DeepSeek 调用失败：{e}"}

    m = re.search(r"\{.*\}", content, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group(0))
            words = data.get("words", [])
            template = data.get("template", "")
            # 过滤非法词角色 + 规范词
            valid_roles = {"核心主词", "属性词", "材质", "功能卖点", "场景", "营销词", "规格词"}
            cleaned = []
            for w in words:
                word = (w.get("word") or "").strip()
                role = (w.get("role") or "").strip()
                if word and role in valid_roles:
                    cleaned.append({"word": word, "role": role})
            return {"words": cleaned, "template": template, "error": None}
        except Exception:
            pass
    return {"words": [], "template": "", "error": f"AI 输出解析失败：{content[:200]}"}


# 词角色 → 关键词库 category 映射
ROLE_TO_CATEGORY = {
    "核心主词": "核心词",
    "属性词": "属性词",
    "材质": "属性词",
    "功能卖点": "长尾词",
    "场景": "场景词",
    "营销词": "长尾词",
    "规格词": "规格词",
}


def import_split_words(title, words):
    """把拆解出的词导入关键词库（新词进备用池），返回 {added, skipped}。"""
    added = 0
    skipped = 0
    imported = []
    for w in words:
        word = w.get("word", "").strip()
        role = w.get("role", "")
        category = ROLE_TO_CATEGORY.get(role, "长尾词")
        if not word:
            continue
        # 已存在跳过（不覆盖）
        existing = [k for k in load_keywords() if k.get("word") == word]
        if existing:
            skipped += 1
            continue
        item = {
            "word": word, "category": category, "source": "竞品标题",
            "status": "待用", "notes": f"拆解自:{title}", "hot": "中",
            "product": "门后挂钩", "shop": "拼多多",
            "pool_type": "spare", "weight": 4,
        }
        add_keyword(item)
        added += 1
        imported.append({"word": word, "role": role, "category": category})
    return {"added": added, "skipped": skipped, "imported": imported}


def split_review_painpoints(text):
    """AI 拆解竞品评价/问大家文本 → 痛点词 + 反转卖点词。

    输入：评价文本（多行，可含多条评价）
    返回 {pairs: [{pain, selling}], summary: str, error: str|None}
    pain = 负面痛点词（生锈/易脱落），selling = 正面反转卖点词（防锈/牢固）
    """
    import re
    text = (text or "").strip()
    if not text:
        return {"pairs": [], "summary": "", "error": "评价文本不能为空"}
    if not DEEPSEEK_API_KEY:
        return {"pairs": [], "summary": "", "error": "未配置 DeepSeek API key"}

    prompt = (
        "你是电商竞品评价分析专家。下面是一段竞品商品的买家评价/问大家文本，请提炼出买家抱怨的痛点，并反转为可用于标题的正面卖点词。\n"
        f"评价文本：\n{text[:3000]}\n\n"
        "规则：\n"
        "1. 痛点词 = 买家抱怨的负面问题，简短词组（如：生锈、易脱落、掉色、承重不够、有异味）\n"
        "2. 卖点词 = 把痛点反转成正面表述（如：生锈→防锈不生锈、易脱落→牢固不掉、承重不够→承重强）\n"
        "3. 每个痛点对应一个卖点，卖点词要能在标题里直接使用（2-6字，正面、具体）\n"
        "4. 只提炼高频、真实、可落地的痛点，不要臆造\n"
        "5. summary = 一句话概括竞品主要短板\n\n"
        '只输出 JSON 对象，格式：{"pairs":[{"pain":"生锈","selling":"防锈不生锈"}],"summary":"竞品主要短板是..."}。'
        "不要输出 markdown 代码块。"
    )
    body = json.dumps({
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "stream": False,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.deepseek.com/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        },
    )
    try:
        resp = json.loads(urllib.request.urlopen(req, timeout=60).read())
        content = resp["choices"][0]["message"]["content"]
    except Exception as e:
        return {"pairs": [], "summary": "", "error": f"DeepSeek 调用失败：{e}"}

    m = re.search(r"\{.*\}", content, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group(0))
            pairs = data.get("pairs", [])
            summary = data.get("summary", "")
            cleaned = []
            for p in pairs:
                pain = (p.get("pain") or "").strip()
                selling = (p.get("selling") or "").strip()
                if pain and selling:
                    cleaned.append({"pain": pain, "selling": selling})
            return {"pairs": cleaned, "summary": summary, "error": None}
        except Exception:
            pass
    return {"pairs": [], "summary": "", "error": f"AI 输出解析失败：{content[:200]}"}


def import_painpoint_words(text, pairs):
    """把痛点反推的卖点词导入关键词库（卖点词进备用池，痛点词进痛点分类）。

    卖点词 → category=功能卖点（可参与标题生成）
    痛点词 → category=痛点词（仅作竞品短板参考，不进标题生成）
    返回 {added, skipped, imported}。
    """
    added = 0
    skipped = 0
    imported = []
    existing_words = {k.get("word") for k in load_keywords()}
    for p in pairs:
        pain = (p.get("pain") or "").strip()
        selling = (p.get("selling") or "").strip()
        # 卖点词
        if selling and selling not in existing_words:
            add_keyword({
                "word": selling, "category": "功能卖点", "source": "竞品评价",
                "status": "待用", "notes": f"痛点反推:{pain}｜{text[:20]}", "hot": "中",
                "product": "门后挂钩", "shop": "拼多多",
                "pool_type": "spare", "weight": 4,
            })
            existing_words.add(selling)
            added += 1
            imported.append({"word": selling, "role": "卖点词", "category": "功能卖点", "from_pain": pain})
        elif selling:
            skipped += 1
        # 痛点词（单独存，供参考）
        if pain and pain not in existing_words:
            add_keyword({
                "word": pain, "category": "痛点词", "source": "竞品评价",
                "status": "待用", "notes": f"竞品痛点｜{text[:20]}", "hot": "低",
                "product": "门后挂钩", "shop": "拼多多",
                "pool_type": "spare", "weight": 1,
            })
            existing_words.add(pain)
            added += 1
            imported.append({"word": pain, "role": "痛点词", "category": "痛点词", "from_pain": pain})
    return {"added": added, "skipped": skipped, "imported": imported}


def expand_synonyms(core_word):
    """AI 同义词/长尾变体扩充：给定核心词，生成近义词 + 长尾组合 + 场景词。

    返回 {synonyms: [{word}], variants: [{word}], scenes: [{word}], error: str|None}
    """
    import re
    core_word = (core_word or "").strip()
    if not core_word:
        return {"synonyms": [], "variants": [], "scenes": [], "error": "核心词不能为空"}
    if not DEEPSEEK_API_KEY:
        return {"synonyms": [], "variants": [], "scenes": [], "error": "未配置 DeepSeek API key"}

    prompt = (
        "你是电商关键词拓展专家。给定一个核心词，生成同义词和长尾变体，用于关键词库和标题生成。\n"
        f"核心词：{core_word}\n\n"
        "规则：\n"
        "1. 同义词 = 核心词的近义/同义表达（换个说法，2-6字），如「门后挂钩」→「门后挂架」「门上挂钩」「免打孔挂钩」\n"
        "2. 长尾词 = 核心词 + 修饰/场景/人群/材质的长尾组合（4-10字），如「门后挂钩免打孔」「卧室门后挂钩」「不锈钢门后挂钩」\n"
        "3. 场景词 = 核心词适用的使用场景（2-4字），如「卧室」「浴室」「宿舍」「厨房」\n"
        "4. 每个词简短、真实、可搜索，不要臆造不存在的词，不要重复\n"
        "5. 数量：同义词 3-5 个，长尾词 5-10 个，场景词 3-5 个\n\n"
        '只输出 JSON 对象，格式：{"synonyms":["词1","词2"],"variants":["词1","词2"],"scenes":["词1","词2"]}。'
        "不要输出 markdown 代码块。"
    )
    body = json.dumps({
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.5,
        "stream": False,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.deepseek.com/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        },
    )
    try:
        resp = json.loads(urllib.request.urlopen(req, timeout=60).read())
        content = resp["choices"][0]["message"]["content"]
    except Exception as e:
        return {"synonyms": [], "variants": [], "scenes": [], "error": f"DeepSeek 调用失败：{e}"}

    m = re.search(r"\{.*\}", content, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group(0))
            def _clean(arr):
                return [(w or "").strip() for w in (arr or []) if (w or "").strip()]
            return {
                "synonyms": _clean(data.get("synonyms")),
                "variants": _clean(data.get("variants")),
                "scenes": _clean(data.get("scenes")),
                "error": None,
            }
        except Exception:
            pass
    return {"synonyms": [], "variants": [], "scenes": [], "error": f"AI 输出解析失败：{content[:200]}"}


def import_expanded_words(core_word, words):
    """把 AI 扩充的词导入关键词库（新词进备用池）。

    words: [{word, role}]，role ∈ 同义词/长尾词/场景词
    同义词 → 核心词(weight5)、长尾词 → 长尾词(weight3)、场景词 → 场景词(weight4)
    返回 {added, skipped, imported}。
    """
    ROLE_MAP = {
        "同义词": ("核心词", 5),
        "长尾词": ("长尾词", 3),
        "场景词": ("场景词", 4),
    }
    added = 0
    skipped = 0
    imported = []
    existing_words = {k.get("word") for k in load_keywords()}
    for w in words:
        word = (w.get("word") or "").strip()
        role = (w.get("role") or "长尾词").strip()
        if not word:
            continue
        # 过滤：AI 偶尔把核心词本身当同义词返回，跳过
        if word == core_word:
            skipped += 1
            continue
        category, weight = ROLE_MAP.get(role, ("长尾词", 3))
        if word in existing_words:
            skipped += 1
            continue
        add_keyword({
            "word": word, "category": category, "source": "AI同义词",
            "status": "待用", "notes": f"同义词扩充:{core_word}", "hot": "长尾",
            "product": "门后挂钩", "shop": "拼多多",
            "pool_type": "spare", "weight": weight,
        })
        existing_words.add(word)
        added += 1
        imported.append({"word": word, "role": role, "category": category})
    return {"added": added, "skipped": skipped, "imported": imported}


# ----------------------------- 标题投放记录表（标题 → 曝光/点击/成交/花费） -----------------------------

TITLE_PERF_PATH = os.path.join(DATA_DIR, "title_perf.json")


def load_title_perf() -> list[dict]:
    if not os.path.exists(TITLE_PERF_PATH):
        return []
    try:
        with open(TITLE_PERF_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_title_perf(items: list[dict]) -> None:
    with open(TITLE_PERF_PATH, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


def add_title_perf(item: dict) -> dict:
    """新增/覆盖一条标题投放记录。自动算 ctr/cvr/roi。"""
    items = load_title_perf()
    if "id" not in item or not item["id"]:
        item["id"] = "tp" + str(int(__import__("time").time())) + str(len(items))
    title = (item.get("title") or "").strip()
    imp = int(item.get("impressions", 0) or 0)
    clk = int(item.get("clicks", 0) or 0)
    ords = int(item.get("orders", 0) or 0)
    gmv = float(item.get("gmv", 0) or 0)
    spend = float(item.get("ad_spend", 0) or 0)
    item["title"] = title
    item["impressions"] = imp
    item["clicks"] = clk
    item["orders"] = ords
    item["gmv"] = gmv
    item["ad_spend"] = spend
    item["ctr"] = round(clk / imp, 4) if imp else 0.0
    item["cvr"] = round(ords / clk, 4) if clk else 0.0
    item["roi"] = round(gmv / spend, 4) if spend else 0.0
    idx = next((i for i, t in enumerate(items) if t.get("id") == item["id"]), None)
    if idx is None:
        items.append(item)
    else:
        items[idx] = item
    save_title_perf(items)
    return item


def delete_title_perf(tid: str) -> bool:
    items = load_title_perf()
    new_items = [t for t in items if t.get("id") != tid]
    if len(new_items) == len(items):
        return False
    save_title_perf(new_items)
    return True


def class_baselines() -> dict:
    """类目均值：所有标题的加权平均 CTR/CVR/ROI（特殊词判定 + 公式化权重的基准）。"""
    perfs = load_title_perf()
    total_imp = sum(t.get("impressions", 0) or 0 for t in perfs)
    total_clk = sum(t.get("clicks", 0) or 0 for t in perfs)
    total_ords = sum(t.get("orders", 0) or 0 for t in perfs)
    total_gmv = sum(t.get("gmv", 0) or 0 for t in perfs)
    total_spend = sum(t.get("ad_spend", 0) or 0 for t in perfs)
    ctr_avg = round(total_clk / total_imp, 4) if total_imp else 0.0
    cvr_avg = round(total_ords / total_clk, 4) if total_clk else 0.0
    roi_avg = round(total_gmv / total_spend, 4) if total_spend else 0.0
    return {"ctr_avg": ctr_avg, "cvr_avg": cvr_avg, "roi_avg": roi_avg,
            "total_impressions": total_imp, "total_clicks": total_clk,
            "total_orders": total_ords, "total_gmv": total_gmv, "total_spend": total_spend}


def aggregate_word_metrics() -> dict:
    """按词聚合表现：统计每个词库词出现在哪些标题里，加权平均出该词的 CTR/CVR/ROI。

    特殊词（营销/痛点/卖点）的价值在此体现：用「含该词标题的平均CTR」判断，不看搜索量。
    返回 {word: {impressions, clicks, orders, gmv, spend, ctr, cvr, roi, title_count}}
    """
    perfs = load_title_perf()
    kws = load_keywords()
    words = {k.get("word", ""): k for k in kws if len(k.get("word", "")) >= 2}
    agg = {}
    for t in perfs:
        title = t.get("title", "")
        if not title:
            continue
        # 找出标题里包含的所有词库词
        for w, kw in words.items():
            if w in title:
                a = agg.setdefault(w, {
                    "impressions": 0, "clicks": 0, "orders": 0,
                    "gmv": 0.0, "spend": 0.0, "title_count": 0,
                    "category": kw.get("category", ""),
                    "current_weight": kw.get("weight", 5),
                })
                a["impressions"] += t.get("impressions", 0) or 0
                a["clicks"] += t.get("clicks", 0) or 0
                a["orders"] += t.get("orders", 0) or 0
                a["gmv"] += t.get("gmv", 0) or 0
                a["spend"] += t.get("ad_spend", 0) or 0
                a["title_count"] += 1
    for w, a in agg.items():
        a["ctr"] = round(a["clicks"] / a["impressions"], 4) if a["impressions"] else 0.0
        a["cvr"] = round(a["orders"] / a["clicks"], 4) if a["clicks"] else 0.0
        a["roi"] = round(a["gmv"] / a["spend"], 4) if a["spend"] else 0.0
    return agg


# ----------------------------- AI 建议 + 人工审核（HITL） -----------------------------

SUGGESTIONS_PATH = os.path.join(DATA_DIR, "weight_suggestions.json")


def load_suggestions() -> list[dict]:
    if not os.path.exists(SUGGESTIONS_PATH):
        return []
    try:
        with open(SUGGESTIONS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_suggestions(items: list[dict]) -> None:
    with open(SUGGESTIONS_PATH, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


def generate_weight_suggestions() -> dict:
    """AI 计算权重变更建议（不直接改主词库，生成待审核建议）。

    基于标题投放记录 + 词聚合表现 + 类目均值，算出每个词的权重调整建议。
    返回 {suggestions: [...], baseline: {...}, generated: n}
    """
    baseline = class_baselines()
    agg = aggregate_word_metrics()
    suggestions = []
    now = __import__("time").strftime("%Y-%m-%d %H:%M:%S")
    for word, a in agg.items():
        item = {"word": word, "category": a["category"], "ctr": a["ctr"],
                "cvr": a["cvr"], "roi": a["roi"], "weight": a["current_weight"]}
        r = update_weight_by_metrics(item, baseline["ctr_avg"], baseline["cvr_avg"])
        # 长期 0 曝光 → 直接置 0，移出主池
        if a["impressions"] == 0:
            r = {"weight": 0, "delta": -int(a["current_weight"]), "reason": "长期0曝光，置0"}
        if r["delta"] == 0:
            continue  # 无变化不生成建议
        suggestions.append({
            "id": "sug_" + word.replace(" ", ""),
            "word": word,
            "category": a["category"],
            "current_weight": a["current_weight"],
            "suggested_weight": r["weight"],
            "delta": r["delta"],
            "reason": r["reason"],
            "ctr": a["ctr"],
            "cvr": a["cvr"],
            "roi": a["roi"],
            "title_count": a["title_count"],
            "status": "pending",
            "created_at": now,
        })
    save_suggestions(suggestions)
    return {"suggestions": suggestions, "baseline": baseline, "generated": len(suggestions)}


def apply_suggestions(ids: list) -> dict:
    """人工确认：把选中建议的权重写入主词库，标记 applied。"""
    sugs = load_suggestions()
    items = load_keywords()
    applied = 0
    for s in sugs:
        if ids and s.get("id") not in ids:
            continue
        if s.get("status") != "pending":
            continue
        for k in items:
            if k.get("word") == s.get("word"):
                k["weight"] = s.get("suggested_weight", 5)
                if s.get("suggested_weight", 5) == 0:
                    k["pool_type"] = "spare"  # 置0 移出主池
                break
        s["status"] = "applied"
        applied += 1
    save_keywords(items)
    save_suggestions(sugs)
    return {"applied": applied}


def reject_suggestions(ids: list) -> dict:
    """人工驳回建议。"""
    sugs = load_suggestions()
    rejected = 0
    for s in sugs:
        if ids and s.get("id") not in ids:
            continue
        if s.get("status") != "pending":
            continue
        s["status"] = "rejected"
        rejected += 1
    save_suggestions(sugs)
    return {"rejected": rejected}


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
