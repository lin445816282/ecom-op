# 电商运营工作台 · 部署运维

## 服务信息
- 本地服务：`8765`（FastAPI + SQLite）
- 生产地址：`https://www.ct256.cn/ecom-op/`
- 后端入口：`backend/api.py`（改后端须重启 uvicorn）
- 数据库：`data/catalog.db`

## 常见操作
- **改后端**：改完 `backend/` 下文件后重启 8765 服务
- **改前端**：`app.js` / `style.css` / `index.html` 刷新即生效（静态文件）
  - 电脑：`Ctrl+Shift+R` 强刷
  - 手机微信内置浏览器：`···` → 刷新
- **供应商图片**：`static/supplier_img/`（已 gitignore，可用 `extract_supplier_images.py` 从 Excel 重新提取）

## 数据源
- 供应商报价表：Excel 内嵌图片 → `extract_supplier_images.py` 提取
- 供应商 CSV：`import_suppliers.py` 导入
- 运费账单：`import_freight.py` 导入
