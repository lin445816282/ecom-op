# 拼多多商品上架一键脚本

1688 抓取 → 定价 → 拼多多 CDP 自动上架 的完整流水线，一条命令从商品数据跑到提交。

## 目录

```
C:\tmp\pdd-publish\
├── publish.js           # 核心：读 config.json，自动填表提交
├── config.example.json  # 配置模板（婚礼横幅示例）
└── README.md
```

## 前置条件（CDP 实例必须已登录）

| 实例 | 端口 | 用途 |
|---|---|---|
| 拼多多嘉裕店 | 9232 | 上架目标（主账号"嘉裕工艺品"已登录） |
| 1688 登录实例 | 9238 | 抓取商品数据 |

检查实例存活：
```bash
"/mnt/d/Program Files/nodejs/node.exe" -e "require('http').get('http://127.0.0.1:9232/json',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(d.slice(0,200)))})"
```

## 使用流程（换商品上架）

### 第 1 步：抓 1688 商品（手动/半自动）

用 1688 登录实例 9238 抓商品数据（标题、进价、规格、主图），下载主图到 `C:\tmp\<商品目录>\`。

> 参考 skill `1688-product-scraping`（CDP 抓取 + 浏览器 fetch 下载图 + WebP 转码）。

### 第 2 步：写 config.json

复制 `config.example.json` 改字段：

| 字段 | 说明 |
|---|---|
| `categoryKeyword` | 类目搜索关键词（如"婚庆"、"宠物"、"家居"） |
| `categoryPath` | 完整类目路径（搜索后结果里选一个） |
| `title` | 商品标题 ≤60 字符 |
| `images` | 主图路径（≤10 张） |
| `specs[0]` | 规格1（type=类型名，values=值列表） |
| `specs[1]` | 规格2（同理） |
| `priceBySpec2` | 按规格2的值定价（pdd=拼单价，danmai=单买价） |
| `stock` | 库存（所有 SKU 统一） |
| `refPrice` | 参考价（> 最大单买价） |
| `previewImages` | 规格1 各值对应的预览图 |

### 第 3 步：一键上架

```bash
cd /mnt/c/tmp/pdd-publish
"/mnt/d/Program Files/nodejs/node.exe" "C:\tmp\pdd-publish\publish.js" "C:\tmp\pdd-publish\config.json"
```

脚本自动完成 8 步：选类目 → 传图 → 标题 → 规格 → 价格表 → 预览图 → 参考价 → 提交，每步打印进度，最后输出商品 ID。

## 关键坑（已踩过，勿再犯）

1. **规格值框 = `请输入规格名称`**（价格表才是 `请输入`，别填错）
2. **删除按钮是 A 标签** `div.delete-btn a`（坐标点不动）
3. **规格类型2 下拉要点开确认**再点选项
4. **预览图 file input 前 2 个是轮播图/辅助图**，后面才是 SKU 预览图
5. **价格表行顺序 = 笛卡尔积**（每「规格2数量」行一个「规格1」值）

## 定价参考

这次婚礼横幅的实际定价（进价→拼单价/单买价）：
- 21.6 → 39.9/49.9（≈1.85 倍，单买+10）
- 29 → 49.9/59.9
- 51 → 79.9/99.9（单买+20）
- 62.2 → 99.9/119.9

无固定公式，建议：拼单价 = 进价 × 1.5~1.85，单买价 = 拼单价 + 10~20，让毛利覆盖运费+推广。
