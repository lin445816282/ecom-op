# -*- coding: utf-8 -*-
"""初始化错误知识库：建表 + 录入已知错误类型（幂等）。"""
import catalog

catalog.init_db()

SEED = [
    {
        "error_type": "图片带logo/水印被驳回",
        "description": "1688原图带logo/店招/二维码，拼多多风控判定外部平台信息，商品被驳回",
        "skill_name": "pdd-goods-publish-cdp",
        "solution": "上架前去水印/换无水印图（系统图片处理环节缺失，需人工或OCR检测）",
    },
    {
        "error_type": "1688 httpx直连被x5sec风控拦截",
        "description": "无登录态直连返回 captcha 跳转页，系统回退 mock 假数据（标题=1688商品-id）",
        "skill_name": "1688-product-scraping",
        "solution": "必须带 1688 登录态 CDP 抓取，任何 httpx/requests 无 cookie 直连必挂",
    },
    {
        "error_type": "规格值填错框",
        "description": "规格值误填到价格表 placeholder=请输入 框，值连在一起",
        "skill_name": "pdd-goods-publish-cdp",
        "solution": "规格值框 placeholder=请输入规格名称，价格表才是 请输入",
    },
    {
        "error_type": "删除按钮坐标点击无效",
        "description": "拼多多规格值删除按钮坐标点不动",
        "skill_name": "pdd-goods-publish-cdp",
        "solution": "删除按钮是 A 标签 div.delete-btn a，用 element.click()",
    },
    {
        "error_type": "规格类型2下拉未打开就填值",
        "description": "下拉没打开，款式值误填到颜色规格，表格行错乱",
        "skill_name": "pdd-goods-publish-cdp",
        "solution": "点 Select 后确认 .ST_dropdownPanel 打开再点选项",
    },
    {
        "error_type": "价格表第1行库存未填",
        "description": "表格虚拟滚动没渲染完，填价格表时第1行库存错位",
        "skill_name": "pdd-goods-publish-cdp",
        "solution": "填价格表前 scroll + sleep 等表格完全渲染",
    },
    {
        "error_type": "规格预览图映射错位",
        "description": "预览图 file input slice(2) 映射错位，最后一行预览图没传",
        "skill_name": "pdd-goods-publish-cdp",
        "solution": "传完预览图自检错误计数，缺哪行补传哪行",
    },
]

for s in SEED:
    rec = catalog.add_error(s["error_type"], s["description"], s["skill_name"], s["solution"])
    print("已录入:", rec.get("error_type"), "id=", rec.get("id"))

print("\n当前错误库总数:", len(catalog.query_errors()))
