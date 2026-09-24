/* 电商运营工作台前端逻辑 */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n, d=2) => (n === Infinity || n === null || n === undefined || Number.isNaN(n)) ? '—' : Number(n).toLocaleString('zh-CN', {maximumFractionDigits:d, minimumFractionDigits:d});
const fmtPct = (n) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : (Number(n)*100).toFixed(2)+'%';
const todayCN = () => new Intl.DateTimeFormat('zh-CN', {dateStyle:'full'}).format(new Date());

const VIEWS = {
  dashboard: {title:'运营总览', sub:'把资料里的经验，变成每天可执行的运营动作。'},
  guide: {title:'操作手册', sub:'从第一次打开，到每天跑完一套运营动作。'},
  products: {title:'商品投产', sub:'记录售价、毛利与广告数据，自动计算保本/目标 ROI。'},
  catalog: {title:'商品库', sub:'平台 + 电商层级真实商品数据（平台 → 店铺 → 商品 → SKU）。'},
  titleopt: {title:'标题优化', sub:'挑选无订单商品优化标题，跟踪近7天访问效果。'},
  suppliers: {title:'供应商', sub:'采购侧报价 · 供货价 / 零售价 / 商品图片，支持搜索与导入导出。'},
  knowledge: {title:'运营知识库', sub:'只保留合规、可持续的起店与推广方法论。'},
  calendar: {title:'选品日历', sub:'按月提前布局应季商品，建议提前 2-4 周预热。'},
  keywords: {title:'关键词库', sub:'储备核心词、属性词、场景词、规格词，用于标题优化与选品拓词。'},
  tasks: {title:'SOP 任务', sub:'按模块创建每日任务，落地执行并跟踪完成度。'},
  douyin: {title:'抖店运营', sub:'上架 ≠ 入池。先查流量，再优化标题、核对新品标。'},
  logs: {title:'运营日志', sub:'每天一条：日期+商品+数据+结论+动作，按天集中追溯。'},
};

const state = { view:'dashboard', shop:'拼多多', products:[], knowledge:[], calendar:[], templates:[], tasks:[], keywords:[], promotionHistory:[], logs:[] };

// 店铺过滤辅助（当前店铺视角）
const shopProducts = () => state.products.filter(p => (p.shop||'拼多多') === state.shop);
const shopKeywords = () => state.keywords.filter(k => (k.shop||'拼多多') === state.shop);
const shopTasks = () => state.tasks.filter(t => (t.shop||'拼多多') === state.shop);
const shopLogs = () => state.logs.filter(l => (l.shop||'拼多多') === state.shop).sort((a,b) => (b.date||'').localeCompare(a.date||''));

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

const BASE = location.pathname.startsWith('/ecom-op') ? '/ecom-op' : '';

async function api(path, method='GET', body) {
  const opt = {method, headers:{'Content-Type':'application/json'}};
  if (body !== undefined) opt.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opt);
  if (!res.ok) {
    let msg = `请求失败 ${res.status}`;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch(e) {}
    throw new Error(msg);
  }
  return res.json();
}

// 图片大图预览弹框（点击缩略图弹出，点遮罩/✕关闭）
function showImageLightbox(src) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:1000;display:flex;align-items:center;justify-content:center;padding:12px';
  const box = document.createElement('div');
  box.style.cssText = 'position:relative;max-width:96vw;max-height:96vh;display:flex;align-items:center;justify-content:center';
  box.innerHTML = `
    <img src="${esc(src)}" style="max-width:96vw;max-height:90vh;object-fit:contain;border-radius:10px;box-shadow:0 12px 48px rgba(0,0,0,.55);background:#fff">
    <button style="position:absolute;top:-15px;right:-15px;width:34px;height:34px;border-radius:50%;border:none;background:#fff;color:#333;font-size:20px;line-height:1;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.35)">✕</button>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  box.querySelector('button').onclick = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };
}

// 自定义二次确认弹窗（替代原生 confirm，微信内置浏览器可用）
function confirmDialog(msg, opts = {}) {
  const { title = '确认操作', confirmText = '确认删除', cancelText = '取消', danger = true } = opts;
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:999;display:flex;align-items:center;justify-content:center;padding:24px';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:16px;padding:24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.22)';
    box.innerHTML = `
      <div style="font-size:15px;font-weight:700;color:#17203a;margin-bottom:8px">${esc(title)}</div>
      <div style="font-size:14px;color:#4b5677;line-height:1.6;margin-bottom:22px;word-break:break-all">${msg}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn" style="padding:8px 18px">${esc(cancelText)}</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" style="padding:8px 18px">${esc(confirmText)}</button>
      </div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    const close = val => { overlay.remove(); resolve(val); };
    box.querySelectorAll('button')[0].onclick = () => close(false);
    box.querySelectorAll('button')[1].onclick = () => close(true);
    overlay.onclick = e => { if (e.target === overlay) close(false); };
  });
}

// 自定义输入弹窗（替代原生 prompt，微信内置浏览器可用）
// fields: [{key, label, value, placeholder}]，确认返回 {key:value,...}，取消返回 null
function promptDialog(fields, opts = {}) {
  const { title = '请输入', confirmText = '确定', cancelText = '取消' } = opts;
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:999;display:flex;align-items:center;justify-content:center;padding:24px';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:16px;padding:24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.22)';
    box.innerHTML = `
      <div style="font-size:15px;font-weight:700;color:#17203a;margin-bottom:16px">${esc(title)}</div>
      ${fields.map((f, i) => {
        if (f.type === 'select') {
          const opts = f.options || [];
          return `
        <div style="margin-bottom:12px">
          <label style="display:block;font-size:12px;color:#66708a;font-weight:600;margin-bottom:5px">${esc(f.label)}</label>
          <select data-pf="${i}" style="width:100%;padding:9px 12px;border:1px solid #e4e7f1;border-radius:9px;font-size:14px;box-sizing:border-box;background:#fff">
            ${opts.map(o => `<option value="${esc(o.value)}" ${o.value === f.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
          </select>
        </div>`;
        }
        return `
        <div style="margin-bottom:12px">
          <label style="display:block;font-size:12px;color:#66708a;font-weight:600;margin-bottom:5px">${esc(f.label)}</label>
          <input data-pf="${i}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" style="width:100%;padding:9px 12px;border:1px solid #e4e7f1;border-radius:9px;font-size:14px;box-sizing:border-box">
        </div>`;
      }).join('')}
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
        <button class="btn" style="padding:8px 18px">${esc(cancelText)}</button>
        <button class="btn primary" style="padding:8px 18px">${esc(confirmText)}</button>
      </div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    const close = val => { overlay.remove(); resolve(val); };
    const btns = box.querySelectorAll('button');
    btns[0].onclick = () => close(null);
    btns[1].onclick = () => {
      const result = {};
      fields.forEach((f, i) => { result[f.key] = box.querySelector(`[data-pf="${i}"]`).value.trim(); });
      close(result);
    };
    box.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') btns[1].click(); });
    });
    overlay.onclick = e => { if (e.target === overlay) close(null); };
    setTimeout(() => box.querySelector('input')?.focus(), 50);
  });
}

// 批量修改模板说明文档（只读弹窗）
function showModifyDoc() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:999;display:flex;align-items:center;justify-content:center;padding:24px';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;padding:26px;max-width:560px;width:100%;max-height:82vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.22)';
  box.innerHTML = `
    <div style="font-size:16px;font-weight:700;color:#17203a;margin-bottom:14px">📄 批量修改模板说明文档</div>
    <div style="font-size:13px;color:#4b5677;line-height:1.85">
      <div style="margin-bottom:14px"><b>① 批量修改标题</b><br>
        列：商品ID（必填）｜商品名称｜改后商品名称<br>
        <span style="color:#66708a">· 系统以商品ID确定信息唯一性<br>· 标注【必填】字段为必填，其余为选项或有默认值；为空则直接跳过不处理<br>· 仅支持导出/导入 1.5w 条数据，更多请通过筛选查询后操作</span></div>
      <div style="margin-bottom:14px"><b>② 批量修改价格</b><br>
        列：商品ID（必填）｜商品名称｜SKUID（必填，注意不是SKU编码）｜规格名称｜单买价｜拼单价｜规格编码<br>
        <span style="color:#66708a">· 系统以商品ID+SkuId确定信息唯一性<br>· 价格的单位为元，最多支持两位小数<br>· 拼单价需比单买价低至少1元，单买价需低于参考价<br>· 改价后的 SKU 单买价高于市场价时，市场价自动调整为单买价+1元<br>· SKUID 需通过批量导出功能导出后获取<br>· 仅支持导出/导入 1.5w 条数据</span></div>
      <div style="margin-bottom:14px"><b>③ 批量修改库存</b><br>
        列：商品ID（必填）｜商品名称｜SKUID（必填，注意不是SKU编码）｜规格名称｜库存增减｜规格编码<br>
        <span style="color:#66708a">· 系统以商品ID+SkuId确定信息唯一性，仅支持库存数量增/减调整<br>· SKUID 需通过批量导出功能导出后获取<br>· 库存增加填正整数（如 10），减少填负整数（如 -10）<br>· 仅支持导出/导入 1.5w 条数据</span></div>
      <div><b>④ 批量修改商品编码</b><br>
        列：商品ID（必填）｜商品名称｜商品编码｜改后商品编码<br>
        <span style="color:#66708a">· 系统以商品ID确定信息唯一性<br>· 标注【必填】字段为必填，其余为选项或有默认值；为空则直接跳过不处理<br>· 仅支持导出/导入 1.5w 条数据</span></div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:18px">
      <button class="btn primary" style="padding:8px 22px">关闭</button>
    </div>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  box.querySelector('button').onclick = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };
}

// 订单导出字段说明文档（只读弹窗）
function showOrdersDoc() {
  const fields = [
    ['订单号', '订单唯一编号，导入时以此去重（同号覆盖更新）'],
    ['订单状态', '已支付 / 已发货 / 已完成 / 已取消 等'],
    ['商品数量(件)', '该订单购买的商品总件数'],
    ['支付时间', '买家实际付款时间'],
    ['确认收货时间', '买家确认收货时间，未确认则为空'],
    ['商品id', '平台商品ID，用于关联商品库'],
    ['商品规格', 'SKU 规格名称（如 白色-大号）'],
    ['售后状态', '无售后 / 退款中 / 已退款 等'],
    ['用户实付金额(元)', '买家实际支付金额（含运费）'],
    ['商家实收金额(元)', '商家实际到账金额（扣平台费用后）'],
    ['快递单号', '物流运单号'],
    ['快递公司', '承运快递公司名称'],
    ['省', '收货省份（拼多多导出可能脱敏为 ****）'],
    ['市', '收货城市'],
    ['区', '收货区县'],
    ['订单来源', '自然搜索 / 推广 / 活动 等'],
  ];
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:999;display:flex;align-items:center;justify-content:center;padding:24px';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;padding:26px;max-width:640px;width:100%;max-height:82vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.22)';
  box.innerHTML = `
    <div style="font-size:16px;font-weight:700;color:#17203a;margin-bottom:6px">📋 订单导出字段说明</div>
    <div style="font-size:12px;color:#66708a;margin-bottom:14px">共 ${fields.length} 个字段，与「⬇ 订单」导出的 CSV 列一一对应。</div>
    <div class="table-wrap"><table>
      <thead><tr><th style="width:170px">字段名</th><th>说明</th></tr></thead>
      <tbody>${fields.map(([name, desc]) => `
        <tr>
          <td style="font-weight:600;color:#17203a">${esc(name)}</td>
          <td style="color:#4b5677;font-size:13px">${esc(desc)}</td>
        </tr>`).join('')}
      </tbody></table></div>
    <div style="display:flex;justify-content:flex-end;margin-top:18px">
      <button class="btn primary" style="padding:8px 22px">关闭</button>
    </div>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  box.querySelector('button').onclick = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };
}


// 从修改记录构建「待处理」映射：key=商品ID 或 商品ID|SKUID，value={field: new_value}
function buildModMap() {
  const m = {};
  for (const mod of (catalogCache.mods || [])) {
    if (mod.status === 'done') continue;
    const key = mod.platform_sku_id ? `${mod.platform_product_id}|${mod.platform_sku_id}` : mod.platform_product_id;
    (m[key] = m[key] || {})[mod.field] = mod.new_value;
  }
  return m;
}

// 刷新修改记录缓存 + 重渲染列表（徽标、红字标记、数量）
async function refreshModsCount() {
  try {
    const [counts, list] = await Promise.all([
      api('/api/catalog/modifications/counts'),
      api('/api/catalog/modifications'),
    ]);
    catalogCache.modCounts = counts || {};
    catalogCache.mods = list.items || [];
    paintCatalog();
  } catch (e) {}
}

// 有待处理修改时点击按钮弹出的操作面板（导出模板 / 标注已处理）
function showModifyAction(key, n) {
  const labels = { title: '改标题', price: '改价格', stock: '改库存', code: '改编码' };
  const label = labels[key] || key;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:999;display:flex;align-items:center;justify-content:center;padding:24px';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;padding:24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.22)';
  box.innerHTML = `
    <div style="font-size:15px;font-weight:700;color:#17203a;margin-bottom:8px">${label}：${n} 条待处理</div>
    <div style="font-size:13px;color:#66708a;line-height:1.7;margin-bottom:20px">
      导出模板后，可将这 ${n} 条修改标注为「已处理」，按钮计数归零。<br>
      <span style="color:#b0b8c8">已处理的修改不再出现在导出模板里（记录仍保留在清单中）。</span>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
      <button class="btn" data-act-export>⬇ 导出模板</button>
      <button class="btn primary" data-act-done>✅ 标注已处理</button>
      <button class="btn" data-act-close>取消</button>
    </div>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  box.querySelector('[data-act-close]').onclick = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };
  box.querySelector('[data-act-export]').onclick = () => {
    window.open(BASE + `/api/catalog/export?type=modify-${key}`, '_blank');
  };
  box.querySelector('[data-act-done]').onclick = async () => {
    const ok = await confirmDialog(`确定将「${label}」的 ${n} 条待处理修改标注为已处理吗？`, { title: '标注已处理', confirmText: '标注已处理' });
    if (!ok) return;
    try {
      const r = await api('/api/catalog/modifications/mark-done', 'POST', { field: key });
      toast(`已标注 ${r.done} 条为已处理`);
      close();
      refreshModsCount();
    } catch (err) { toast(err.message); }
  };
}

// 修改记录管理弹窗（查看 / 删除单条 / 清空 / 导出清单）
async function showModList() {
  let items = [];
  try {
    const r = await api('/api/catalog/modifications');
    items = r.items || [];
  } catch (e) { items = []; }
  const FIELD_LABEL = { title: '改标题', code: '改编码', dan_price: '单买价', pin_price: '拼单价', stock: '库存增减' };
  const fieldColor = f => ({ title: '#1890ff', code: '#722ed1', dan_price: '#fa8c16', pin_price: '#fa8c16', stock: '#52c41a' }[f] || '#1890ff');
  const pendingCount = items.filter(m => m.status !== 'done').length;
  const rowsHtml = items.length ? items.map(m => `
    <div style="display:flex;align-items:center;gap:8px;padding:9px 4px;border-bottom:1px solid #f0f2f8;font-size:12.5px;flex-wrap:wrap">
      <span class="tag" style="background:${fieldColor(m.field)};color:#fff">${FIELD_LABEL[m.field] || m.field}</span>
      ${m.status === 'done' ? '<span class="tag" style="background:#c4cbe0;color:#fff">已处理</span>' : '<span class="tag" style="background:#fff3e0;color:#e65100;border:1px solid #ffe0b2">待处理</span>'}
      <span style="font-weight:600;color:#26306a;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(m.product_name || '')}">${esc(m.product_name || m.platform_product_id)}</span>
      ${m.spec_name ? `<span style="color:#66708a">${esc(m.spec_name)}</span>` : ''}
      <span style="color:#b0b8c8">${esc(m.old_value || '—')} →</span>
      <span style="color:#e5484d;font-weight:600">${esc(m.new_value)}</span>
      <span style="margin-left:auto;color:#b0b8c8;font-size:11px">${esc((m.created_at || '').slice(5, 16))}</span>
      <button class="btn xs danger" data-mod-del="${m.id}">🗑️</button>
    </div>`).join('') : '<div class="empty" style="padding:20px">暂无修改记录</div>';

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:999;display:flex;align-items:center;justify-content:center;padding:24px';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;padding:22px;max-width:640px;width:100%;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.22)';
  box.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div style="font-size:16px;font-weight:700;color:#17203a">📝 修改记录（待处理 ${pendingCount} / 共 ${items.length}）</div>
      <button class="btn subtle sm" data-mod-export>⬇ 导出清单</button>
    </div>
    <div style="overflow-y:auto;flex:1;min-height:100px">${rowsHtml}</div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px">
      ${items.length ? '<button class="btn danger sm" data-mod-clear>清空全部</button>' : ''}
      <button class="btn primary sm" data-mod-close>关闭</button>
    </div>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  const close = () => overlay.remove();

  box.querySelector('[data-mod-close]').onclick = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };
  const exportBtn = box.querySelector('[data-mod-export]');
  if (exportBtn) exportBtn.onclick = () => window.open(BASE + '/api/catalog/export?type=modifications', '_blank');
  box.querySelectorAll('[data-mod-del]').forEach(b => b.onclick = async () => {
    try { await api(`/api/catalog/modifications/${b.dataset.modDel}`, 'DELETE'); toast('已删除该条'); } catch (err) { toast(err.message); }
    close(); refreshModsCount(); showModList();
  });
  const clearBtn = box.querySelector('[data-mod-clear]');
  if (clearBtn) clearBtn.onclick = async () => {
    const ok = await confirmDialog('确定清空全部修改记录吗？清空后导出模板将不再带出新值。', { title: '清空修改记录', confirmText: '清空' });
    if (!ok) return;
    try { await api('/api/catalog/modifications/clear', 'POST'); toast('已清空'); } catch (err) { toast(err.message); }
    close(); refreshModsCount(); showModList();
  };
}

// CSV 导入弹窗（选店铺 + 选类型 + 下载模板 + 上传文件 + 导入）
async function showImportDialog(defaultType = 'products') {
  const tree = catalogCache.tree || [];
  const shops = [];
  for (const pl of tree) {
    for (const sh of (pl.shops || [])) shops.push({ id: sh.id, label: `${pl.name} · ${sh.name}` });
  }
  if (!shops.length) { toast('请先新增店铺'); return; }

  const TYPE_HINT = {
    products: '新建或更新商品。表头：商品ID / 商品名称 / 货号编码',
    skus: '回填 SKU 价格与库存（商品需已存在）。表头：商品ID / SKUID / 规格名称 / 规格编码 / 单买价 / 拼单价 / 库存',
    orders: '导入订单流水。表头：订单号 / 订单状态 / 商品数量(件) / 支付时间 / … / 省 / 市 / 区',
    promotions: '导入推广数据。表头：商品ID / 商品名称 / 推广场景 / … / 曝光量 / 点击量',
  };

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:999;display:flex;align-items:center;justify-content:center;padding:24px';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;padding:24px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.22)';
  box.innerHTML = `
    <div style="font-size:16px;font-weight:700;color:#17203a;margin-bottom:16px">⬆ 导入 CSV / XLSX</div>
    <div class="imp-row"><label>目标店铺</label>
      <select id="imp-shop">${shops.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}</select>
    </div>
    <div class="imp-row"><label>导入类型</label>
      <select id="imp-type">
        <option value="products">商品列表</option>
        <option value="skus">SKU 价格库存</option>
        <option value="orders" ${defaultType === 'orders' ? 'selected' : ''}>订单</option>
        <option value="promotions">推广</option>
      </select>
    </div>
    <div class="imp-row"><label>CSV / XLSX 文件</label>
      <input type="file" id="imp-file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
    </div>
    <div class="imp-hint" id="imp-hint">${TYPE_HINT[defaultType] || TYPE_HINT.products}</div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap">
      <button class="btn" data-imp-template>⬇ 下载模板</button>
      <button class="btn primary" data-imp-go>导入</button>
      <button class="btn" data-imp-close>取消</button>
    </div>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  box.querySelector('[data-imp-close]').onclick = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };

  const typeSel = box.querySelector('#imp-type');
  const shopSel = box.querySelector('#imp-shop');
  const fileInput = box.querySelector('#imp-file');
  const hint = box.querySelector('#imp-hint');

  typeSel.onchange = () => { hint.textContent = TYPE_HINT[typeSel.value] || ''; };

  box.querySelector('[data-imp-template]').onclick = () => {
    window.open(BASE + '/api/catalog/template?type=' + typeSel.value, '_blank');
  };

  box.querySelector('[data-imp-go]').onclick = async () => {
    const file = fileInput.files[0];
    if (!file) { toast('请先选择 CSV 或 XLSX 文件'); return; }
    const isXlsx = /\.xlsx?$/i.test(file.name);
    let payload;
    if (isXlsx) {
      const b64 = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
        fr.onerror = () => reject(new Error('文件读取失败'));
        fr.readAsDataURL(file);
      });
      payload = { type: typeSel.value, shop_id: parseInt(shopSel.value), format: 'xlsx', data: b64 };
    } else {
      const csvText = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(new Error('文件读取失败'));
        fr.readAsText(file, 'utf-8');
      });
      payload = { type: typeSel.value, shop_id: parseInt(shopSel.value), format: 'csv', csv: csvText };
    }
    const btn = box.querySelector('[data-imp-go]');
    btn.disabled = true; btn.textContent = '⏳ 导入中…';
    try {
      const r = await api('/api/catalog/import', 'POST', payload);
      if (r.ok) {
        toast(`导入成功：${r.imported} 条，跳过 ${r.skipped} 条`);
        close();
        renderCatalog();
      } else {
        toast('导入失败：' + (r.error || '未知'));
        btn.disabled = false; btn.textContent = '导入';
      }
    } catch (err) {
      toast(err.message);
      btn.disabled = false; btn.textContent = '导入';
    }
  };
}

function setNav(active) {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === active));
}

function setView(view) {
  state.view = view;
  setNav(view);
  $$('.view').forEach(v => v.hidden = true);
  $(`#view-${view}`).hidden = false;
  $('#page-title').textContent = VIEWS[view].title;
  $('#page-subtitle').textContent = VIEWS[view].sub;
  if (view === 'dashboard') renderDashboard();
  if (view === 'guide') renderGuide();
  if (view === 'products') renderProducts();
  if (view === 'catalog') renderCatalog();
  if (view === 'titleopt') renderTitleOptView();
  if (view === 'suppliers') renderSuppliersView();
  if (view === 'knowledge') renderKnowledge();
  if (view === 'calendar') renderCalendar();
  if (view === 'keywords') renderKeywords();
  if (view === 'tasks') renderTasks();
  if (view === 'douyin') renderDouyin();
  if (view === 'logs') renderLogs();
}

/* ---------------- 操作手册 ---------------- */
function renderGuide() {
  $('#view-guide').innerHTML = `
    <section class="hero">
      <div>
        <h2>每天只做 5 步</h2>
        <p>这套工作台不是“看完的文档”，而是当日执行清单。先把商品录准，再按信号决定加预算、拖价还是暂停，最后把动作落到 SOP 任务里打勾。</p>
      </div>
      <div>
        <button class="cta" data-nav="products">第 1 步：录入商品</button>
        <button class="cta" data-nav="tasks" style="margin-left:8px">第 5 步：建今日任务</button>
      </div>
    </section>

    <div class="panel" style="margin-bottom:16px">
      <div class="panel-header"><h2>先理解 3 个数字</h2><span class="badge">判断标准</span></div>
      <div class="stats-grid" style="margin-bottom:0">
        <div class="stat-card"><div class="label">利润率</div><div class="value" style="font-size:20px">毛利÷到手价</div><div class="hint">低于 15% 先别急着投广告，先改定价或压成本</div></div>
        <div class="stat-card"><div class="label">保本 ROI</div><div class="value" style="font-size:20px">1÷(利润率×有效成交率)</div><div class="hint">实际 ROI 低于它，就在亏钱</div></div>
        <div class="stat-card"><div class="label">成交花费上限</div><div class="value" style="font-size:20px">毛利×有效成交率</div><div class="hint">单件广告费超过它，别继续加</div></div>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="panel">
        <div class="panel-header"><h2>日常操作链路</h2></div>
        <div class="guide-steps">
          <div class="guide-step"><b>01</b><div><h3>录商品，算底线</h3><p>在「商品投产」填入到手售价、单件毛利、售后率。先把保本 ROI 和目标 ROI 算出来。</p></div></div>
          <div class="guide-step"><b>02</b><div><h3>小预算冷启动</h3><p>用「日预算建议」跑 2-3 天，别一上来放大花费。记录曝光、点击、成交件数。</p></div></div>
          <div class="guide-step"><b>03</b><div><h3>看 CTR 和 CVR</h3><p>CTR 低改主图/标题，CVR 低看详情页、SKU 和价格。先修内功，再谈放量。</p></div></div>
          <div class="guide-step"><b>04</b><div><h3>对标成交花费上限</h3><p>周期数据回来后，看「成交花费」是否低于上限。低于就考虑放量，高于就拖价或暂停。</p></div></div>
          <div class="guide-step"><b>05</b><div><h3>每天建 SOP 任务</h3><p>到「SOP 任务」创建：曝光测试、链接体检、客服巡检、合规自检，做完就勾掉。</p></div></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h2>每个页面的用途</h2></div>
        <table>
          <tr><th style="width:30%">页面</th><th>拿来做什么</th></tr>
          <tr><td class="num">运营总览</td><td>看商品数、平均利润率、广告花费、今日任务完成度</td></tr>
          <tr><td class="num">商品投产</td><td>新增/编辑商品，自动算保本 ROI、目标 ROI、日预算</td></tr>
          <tr><td class="num">知识库</td><td>查起店、测款、定价、主图、标题、推广、客服等方法</td></tr>
          <tr><td class="num">选品日历</td><td>按月份和节日提前 2-4 周布局应季商品</td></tr>
          <tr><td class="num">SOP 任务</td><td>从模板生成当天任务，勾选完成并跟踪</td></tr>
        </table>
        <div class="callout">数据保存在本机的 <code>data/products.json</code> 和 <code>data/tasks.json</code>，不进数据库，也不会上传。</div>
      </div>
    </div>

    <div class="grid cols-2" style="margin-top:16px">
      <div class="panel">
        <div class="panel-header"><h2>什么时候该做什么</h2></div>
        <table>
          <tr><th>信号</th><th>动作</th></tr>
          <tr><td>CTR 低（如 &lt; 3%）</td><td>先换主图、标题，不要加钱</td></tr>
          <tr><td>CVR 低、有点击不成交</td><td>修详情页、SKU 描述、价格或评价</td></tr>
          <tr><td>实际 ROI &lt; 保本 ROI</td><td>暂停或拖价，别为了“量”亏钱</td></tr>
          <tr><td>实际 ROI &gt; 目标 ROI</td><td>分阶段递增预算，逐步放量</td></tr>
          <tr><td>差评/客诉增多</td><td>回到知识库和 SOP，先把客服、合规、售后修好</td></tr>
        </table>
      </div>

      <div class="panel">
        <div class="panel-header"><h2>新手快速上手</h2></div>
        <div class="guide-steps">
          <div class="guide-step"><b>A</b><div><h3>只开一个品</h3><p>先别铺一堆 SKU，把 1 个品的毛利、售价、广告数据录准，跑通完整链路。</p></div></div>
          <div class="guide-step"><b>B</b><div><h3>毛利要真实</h3><p>到手价记得扣掉优惠，毛利记得扣掉成本、快递、运费险、平台扣点，底数错了后面全错。</p></div></div>
          <div class="guide-step"><b>C</b><div><h3>先守合规线</h3><p>不低价引流、不虚假宣传、不导流、不刷单。工作台保留的都是长期可持续的路径。</p></div></div>
          <div class="guide-step"><b>D</b><div><h3>每天固定复盘</h3><p>早上录数据建任务，晚上勾任务看 CTR/CVR/ROI，形成固定节奏。</p></div></div>
        </div>
      </div>
    </div>

    <div class="callout">
      建议今天就从「商品投产」录进第一个真实商品，再到「SOP 任务」建一条「广告冷启动测试」任务。数据越真实，后面放量判断越准。
    </div>
  `;
}

/* ---------------- 抖店运营 ---------------- */
function renderDouyin() {
  $('#view-douyin').innerHTML = `
    <section class="hero">
      <div>
        <h2>抖店新品启动</h2>
        <p>上架 ≠ 入池。新手没流量，先别急着怀疑选品——先查商品有没有曝光，再优化标题、核对新品标。核心只有两个动作：<b>优化标题</b> + <b>检查新品标</b>。</p>
      </div>
      <button class="cta" data-nav="knowledge">查关键公式</button>
    </section>

    <div class="grid cols-2">
      <div class="panel">
        <div class="panel-header"><h2>① 先查新品有没有流量</h2><span class="badge">第一步 · 自查</span></div>
        <div class="guide-steps">
          <div class="guide-step"><b>路径</b><div><h3>官方自查路径</h3><p>电商罗盘 → 商品卡数据 → 商品卡列表，时间切「实时」或看近 7 天。</p></div></div>
          <div class="guide-step"><b>看</b><div><h3>重点看什么</h3><p>有没有曝光、访问、点击；上架了多少、真正开始跑数据的有多少。</p></div></div>
          <div class="guide-step"><b>判</b><div><h3>查完怎么判断</h3><p><span class="tag green">A 有曝光有访问</span> 继续观察、优化转化。<br><span class="tag red">B 几乎没曝光没访问</span> 别傻等，进入下一步优化。</p></div></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h2>② 检查新品标 + 正确启动</h2><span class="badge">第二步 · 基础</span></div>
        <div class="guide-steps">
          <div class="guide-step"><b>去哪</b><div><h3>在哪看新品标</h3><p>商品成长 / 商品优化成长 → 看刚上架商品有没有新品标签。</p></div></div>
          <div class="guide-step"><b>为什么</b><div><h3>为什么要看</h3><p>新品阶段是平台观察测试期，有新品身份更容易拿到搜索、商城流量测试机会。</p></div></div>
          <div class="guide-step"><b>别慌</b><div><h3>不要理解错</h3><p>有标 ≠ 一定爆单，没标 ≠ 完全没机会，它只是必须检查的基础动作。</p></div></div>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:16px">
      <div class="panel-header"><h2>正确启动流程</h2><span class="badge">不是「上架 → 等单」</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px">
        <span class="tag blue">上架商品</span>→<span class="tag">查曝光数据</span>→<span class="tag">优化标题</span>→<span class="tag">查新品标</span>→<span class="tag">做基础动销</span>→<span class="tag">继续看数据</span>→<span class="tag green">再优化</span>
      </div>
      <div class="callout" style="margin-bottom:0">⭐ 不是谁上架最多，而是谁能把上架的商品真正跑起来。</div>
    </div>

    <div class="panel" style="margin-top:16px">
      <div class="panel-header"><h2>③ 标题优化怎么做</h2><span class="badge">第三步 · 改词</span></div>
      <div class="guide-steps">
        <div class="guide-step"><b>找词</b><div><h3>先去哪里找词</h3><p>搜索运营 → 行业搜索词，看当前类目用户正在搜的关键词。</p></div></div>
        <div class="guide-step"><b>改谁</b><div><h3>先改哪些商品</h3><p>近 7 天曝光低、访问少、刚上架的新品。已有流量的老链接先别乱动。</p></div></div>
        <div class="guide-step"><b>怎么改</b><div><h3>标题要改什么</h3><p>删掉没人搜的、过时的、与商品不匹配的词；换成相关、又有搜索需求的词。</p></div></div>
      </div>
      <table style="margin-top:8px">
        <tr><th style="width:20%">类型</th><th>冷门词（删）</th><th>行业热词（换）</th></tr>
        <tr><td class="num">示例</td><td>超美的 · 网红同款 · 2020新款</td><td><span class="tag green">显瘦</span> <span class="tag green">春季新款</span> <span class="tag green">纯棉透气</span></td></tr>
      </table>
      <div class="callout" style="margin-bottom:0">⚠ 尽量手动选商品，别一上来全店自动改——老链接本就有曝光，大范围乱改会影响原有搜索表现。稳一点更安全。</div>
    </div>

    <div class="panel" style="margin-top:16px">
      <div class="panel-header"><h2>④ 总结：先做这 2 个动作</h2><span class="badge">核心心法</span></div>
      <div class="stats-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:14px">
        <div class="stat-card"><div class="label">动作 1</div><div class="value" style="font-size:20px">优化标题</div><div class="hint">让平台清楚商品是什么、该推给谁</div></div>
        <div class="stat-card"><div class="label">动作 2</div><div class="value" style="font-size:20px">检查新品标</div><div class="hint">确认拿到新品身份，更容易进流量测试</div></div>
      </div>
      <div class="callout" style="margin-bottom:0">💡 先别急着怀疑选品，先查新品有没有真正跑起来。顺序是「上架 → 检查 → 优化」，不是「上架 → 等单」。</div>
    </div>
  `;
  $$('#view-douyin [data-nav]').forEach(b => b.onclick = () => setView(b.dataset.nav));
}

/* ---------------- 运营日志 ---------------- */
function renderLogs() {
  const list = shopLogs();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const prodNames = [...new Set(shopProducts().map(p=>p.name))];
  const conclColor = c => {
    if (/继续|健康|放量|达标|稳定|入池|有流量/.test(c||'')) return 'green';
    if (/暂停|停|亏|超限|下滑|没流量|无曝光/.test(c||'')) return 'red';
    if (/改|优化|拖价|测试|观察|降/.test(c||'')) return 'amber';
    return 'blue';
  };
  const logHTML = l => `
    <div class="k-card">
      <div class="cat">${esc(l.date||'')} · ${esc(l.shop||'拼多多')}</div>
      <h3>${esc(l.product||'未指定商品')}</h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px">
        ${l.impressions ? `<span class="tag gray">曝光 ${fmt(l.impressions,0)}</span>`:''}
        ${l.clicks ? `<span class="tag gray">点击 ${fmt(l.clicks,0)}</span>`:''}
        ${l.sold ? `<span class="tag gray">成交 ${fmt(l.sold,0)}</span>`:''}
        ${l.orders ? `<span class="tag gray">订单 ${fmt(l.orders,0)}</span>`:''}
        ${l.ad_spend ? `<span class="tag gray">广告 ¥${fmt(l.ad_spend)}</span>`:''}
      </div>
      ${l.conclusion ? `<span class="tag ${conclColor(l.conclusion)}">${esc(l.conclusion)}</span>`:''}
      ${l.actions ? `<div class="k-sop" style="margin-top:10px">${esc(l.actions)}</div>`:''}
      <div style="margin-top:10px;text-align:right"><button class="btn sm danger" onclick="window.__delLog && window.__delLog('${esc(l.id)}')">删除</button></div>
    </div>`;

  $('#view-logs').innerHTML = `
    <div class="panel">
      <div class="panel-header"><h2>＋ 记一条运营日志</h2><span class="badge">本地持久化</span></div>
      <form id="log-form">
        <div class="field-row">
          <div class="field"><label>日期</label><input name="date" type="date" value="${todayStr}"></div>
          <div class="field"><label>商品</label><input name="product" list="log-products" placeholder="选择或输入商品名"></div>
        </div>
        <datalist id="log-products">${prodNames.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
        <div class="field-row">
          <div class="field"><label>曝光</label><input name="impressions" type="number" value="0"></div>
          <div class="field"><label>点击</label><input name="clicks" type="number" value="0"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>成交件数</label><input name="sold" type="number" value="0"></div>
          <div class="field"><label>订单数</label><input name="orders" type="number" value="0"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>广告花费（元）</label><input name="ad_spend" type="number" step="0.01" value="0"></div>
          <div class="field"><label>结论（继续/暂停/改主图…）</label><input name="conclusion" placeholder="例：继续 / 拖价 / 改主图"></div>
        </div>
        <div class="field"><label>动作明细（做了什么）</label><input name="actions" placeholder="例：出价1.5→1.4，换主图"></div>
        <div class="form-actions"><button type="submit" class="btn primary">保存日志</button></div>
      </form>
    </div>

    <div class="panel" style="margin-top:16px">
      <div class="panel-header"><h2>日志流水</h2><span class="badge">${list.length} 条</span></div>
      ${list.length ? `<div class="card-grid">${list.map(logHTML).join('')}</div>` : '<div class="empty"><div class="big">📓</div>还没有日志，从上面记第一条。</div>'}
    </div>
  `;

  const form = $('#log-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = { id: 'log'+Date.now(), shop: state.shop };
    fd.forEach((v,k)=> body[k]=v);
    try {
      await api('/api/logs','POST',body);
      await loadAll();
      renderLogs();
      toast('日志已保存');
    } catch(err){ toast(err.message); }
  });

  window.__delLog = async id => {
    if (!confirm('删除这条日志？')) return;
    try {
      await api(`/api/logs/${id}`,'DELETE');
      state.logs = state.logs.filter(l=>l.id!==id);
      renderLogs();
      toast('已删除');
    } catch(err){ toast(err.message); }
  };
}

/* ---------------- 总览 ---------------- */
function trendSVG(history) {
  const data = (history || []).slice(-14);
  if (!data.length) return '<div class="empty">暂无推广历史数据（等 cron 跑几次就有）</div>';
  const W = 620, H = 220, L = 46, R = 14, T = 18, B = 34;
  const maxExp = Math.max(1, ...data.map(d => (d.total && d.total.exp) || 0));
  const maxCost = Math.max(1, ...data.map(d => (d.total && d.total.cost) || 0));
  const n = data.length;
  const x = i => L + (W - L - R) * (n === 1 ? 0.5 : i / (n - 1));
  const y = (v, max) => T + (H - T - B) * (1 - v / max);
  const pts = (key, max) => data.map((d, i) => `${x(i).toFixed(1)},${y((d.total && d.total[key]) || 0, max).toFixed(1)}`).join(' ');
  const expPts = pts('exp', maxExp);
  const costPts = pts('cost', maxCost);
  const labels = data.map((d, i) => `<text x="${x(i).toFixed(1)}" y="${H - 10}" font-size="10" fill="#8a94a6" text-anchor="middle">${(d.ts||'').slice(5,10).replace('-','/')}</text>`).join('');
  const grid = [0.25, 0.5, 0.75].map(r => `<line x1="${L}" y1="${(T+(H-T-B)*r).toFixed(1)}" x2="${W-R}" y2="${(T+(H-T-B)*r).toFixed(1)}" stroke="#eef0f3" stroke-width="1"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
    ${grid}
    <polyline points="${expPts}" fill="none" stroke="#1f6cff" stroke-width="2"/>
    <polyline points="${costPts}" fill="none" stroke="#f59e0b" stroke-width="2"/>
    ${labels}
  </svg>`;
}

async function renderDashboard() {
  const p = shopProducts();
  const count = p.length;
  const avgMargin = count ? p.reduce((s,x)=>s+x.margin,0)/count : 0;
  let totalAdSpend = p.reduce((s,x)=>s+(x.ad_spend||0),0);
  let totalOrders = p.reduce((s,x)=>s+(x.orders||0),0);
  const risky = p.filter(x => x.break_even_roi!==Infinity && x.break_even_roi > 3.5).length;
  const done = shopTasks().filter(t=>t.done).length;

  // 拉真实经营数据（商品库 catalog），按当前店铺平台匹配
  let ov = null;
  try {
    const resp = await api('/api/catalog/platform-overview');
    ov = (resp.items || []).find(x => x.name === state.shop) || null;
  } catch (e) {}

  const realHTML = ov ? `
    <div class="panel" style="margin-bottom:16px">
      <div class="panel-header"><h2>📊 真实经营数据（${esc(state.shop)}）</h2><span class="badge">商品库</span></div>
      <div class="stats-grid">
        <div class="stat-card"><div class="label">真实商品数</div><div class="value">${ov.products}</div><div class="hint">catalog 商品库</div></div>
        <div class="stat-card"><div class="label">SKU 数</div><div class="value">${ov.skus}</div><div class="hint">规格明细</div></div>
        <div class="stat-card"><div class="label">订单数</div><div class="value">${ov.orders}</div><div class="hint">已导入订单</div></div>
        <div class="stat-card"><div class="label">GMV（元）</div><div class="value">¥${fmt(ov.gmv)}</div><div class="hint">买家实付</div></div>
      </div>
    </div>
  ` : '';

  $('#view-dashboard').innerHTML = `
    <section class="hero">
      <div>
        <h2>今日运营工作台</h2>
        <p>先测款、后内功、小预算冷启动，再用真实成交数据决定放量还是拖价。所有指标都围绕“到手价毛利”和“保本投产”做判断，避免烧钱买亏损流量。</p>
      </div>
      <button class="cta" data-nav="products">＋ 新增商品投产</button>
    </section>

    ${realHTML}

    <div class="stats-grid">
      <div class="stat-card"><div class="label">商品数</div><div class="value">${count}</div><div class="hint">当前录入 SKU</div></div>
      <div class="stat-card"><div class="label">平均利润率</div><div class="value">${fmtPct(avgMargin)}</div><div class="hint">单件毛利 / 到手价</div></div>
      <div class="stat-card"><div class="label">周期广告花费</div><div class="value">¥${fmt(totalAdSpend)}</div><div class="hint">${totalOrders} 笔订单</div></div>
      <div class="stat-card"><div class="label">高保本 ROI 商品</div><div class="value">${risky}</div><div class="hint">保本 ROI &gt; 3.5，需优化毛利或客单</div></div>
    </div>

    <div class="grid cols-2">
      <div class="panel">
        <div class="panel-header"><h2>核心指标公式</h2><span class="badge">自动计算</span></div>
        <table>
          <tr><td>利润率</td><td class="num">单件毛利 ÷ 实际到手售价</td></tr>
          <tr><td>有效成交率</td><td class="num">1 − 售后率</td></tr>
          <tr><td>保本投产比</td><td class="num">1 ÷ (利润率 × 有效成交率)</td></tr>
          <tr><td>目标投产比</td><td class="num">保本投产比 × 1.2（安全边际）</td></tr>
          <tr><td>单笔成交花费上限</td><td class="num">单件毛利 × 有效成交率</td></tr>
        </table>
        <div class="callout">售后率建议按类目保守估算：非标 30%、半标 20%、标品 15%。利润需扣除成本、快递、运费险、平台扣点。</div>
      </div>

      <div class="panel">
        <div class="panel-header"><h2>今日 SOP 完成度</h2><span class="badge">${done}/${shopTasks().length}</span></div>
        ${shopTasks().length ? `
          <div class="roi-meter" style="margin-bottom:12px"><i style="width:${(done/shopTasks().length*100).toFixed(1)}%"></i></div>
          <div>${shopTasks().filter(t=>!t.done).slice(0,5).map(t=>`<div class="task-row"><div class="task-body"><div class="task-title">${esc(t.title)}</div><div class="task-meta">${esc(t.module||'')}</div></div></div>`).join('')}</div>
        ` : `<div class="empty"><div class="big">✅</div>还没有任务，到「SOP 任务」里从模板快速创建。</div>`}
        <div class="form-actions"><button class="btn" data-nav="tasks">前往任务</button></div>
      </div>
    </div>

    <div class="panel" style="margin-top:16px">
      <div class="panel-header"><h2>📈 推广趋势（近 14 次）</h2><span class="badge">曝光 / 花费</span></div>
      <div style="display:flex;gap:16px;margin-bottom:8px;font-size:12px;color:var(--muted)">
        <span><span style="color:#1f6cff">●</span> 曝光量</span>
        <span><span style="color:#f59e0b">●</span> 花费(元)</span>
      </div>
      ${trendSVG(state.promotionHistory)}
    </div>
  `;
}

/* ---------------- 商品 ---------------- */
function productFormHTML(p={}) {
  const isNew = !p.id;
  const val = (k,d='') => p[k] ?? d;
  const shop = val('shop','拼多多');
  return `
    <div class="panel">
      <div class="panel-header"><h2>${isNew?'新增商品':'编辑商品'}</h2><span class="badge">本地持久化</span></div>
      <form id="product-form">
        <input type="hidden" name="id" value="${esc(val('id'))}">
        <div class="field-row">
          <div class="field"><label>商品名</label><input name="name" value="${esc(val('name'))}" placeholder="例如：夏季防晒帽"></div>
          <div class="field"><label>店铺</label>
            <select name="shop">
              <option value="拼多多" ${shop==='拼多多'?'selected':''}>拼多多</option>
              <option value="淘宝" ${shop==='淘宝'?'selected':''}>淘宝</option>
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>实际到手售价（元）</label><input name="selling_price" type="number" step="0.01" value="${val('selling_price')}" placeholder="29.9"></div>
          <div class="field"><label>单件广告花费（元，可空）</label><input name="ad_cost" type="number" step="0.01" value="${val('ad_cost',0)}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>售后率（0.15=15%）</label><input name="refund_rate" type="number" step="0.01" value="${val('refund_rate',0.15)}"></div>
          <div class="field"><label>备注</label><input name="notes" value="${esc(val('notes'))}" placeholder="类目/策略"></div>
        </div>
        <div class="field" style="margin-top:4px"><label>成本明细（填了自动算毛利，覆盖手填毛利）</label></div>
        <div class="field-row">
          <div class="field"><label>进货价</label><input name="cost" type="number" step="0.01" value="${val('cost',0)}"></div>
          <div class="field"><label>运费</label><input name="shipping" type="number" step="0.01" value="${val('shipping',0)}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>平台扣点率（0.006=0.6%）</label><input name="commission_rate" type="number" step="0.0001" value="${val('commission_rate',0)}"></div>
          <div class="field"><label>运费险</label><input name="freight_insurance" type="number" step="0.01" value="${val('freight_insurance',0)}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>单件毛利（元，不填成本时手填）</label><input name="gross_profit" type="number" step="0.01" value="${val('gross_profit')}" placeholder="9"></div>
          <div class="field"><label>填入后自动计算投产指标</label><input disabled value="自动"></div>
        </div>
        <div class="field" style="margin-top:4px"><label>周期表现（用于 CTR/CVR，可空）</label></div>
        <div class="field-row">
          <div class="field"><label>广告花费</label><input name="ad_spend" type="number" step="0.01" value="${val('ad_spend',0)}"></div>
          <div class="field"><label>订单数</label><input name="orders" type="number" value="${val('orders',0)}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>曝光</label><input name="impressions" type="number" value="${val('impressions',0)}"></div>
          <div class="field"><label>点击</label><input name="clicks" type="number" value="${val('clicks',0)}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>成交件数</label><input name="sold" type="number" value="${val('sold',0)}"></div>
          <div class="field"><label>填入后自动计算三类投产指标</label><input disabled value="自动"></div>
        </div>
        <div class="form-actions">
          <button type="reset" class="btn">重置</button>
          <button type="submit" class="btn primary">保存商品</button>
        </div>
      </form>
    </div>`;
}

function productTableHTML() {
  const list = shopProducts();
  if (!list.length) {
    return `<div class="panel"><div class="empty"><div class="big">📦</div>暂无商品数据。可在上方新增，或用 CLI 导入 CSV。</div></div>`;
  }
  const rows = list.map(p => {
    const roi = p.break_even_roi;
    const roiColor = roi === Infinity ? 'red' : roi > 3.5 ? 'amber' : 'green';
    const rec = p.cpa_benchmark > 0 && p.ad_cost > 0 ? (p.ad_cost > p.cpa_benchmark ? 'red' : 'green') : 'blue';
    const recText = p.cpa_benchmark > 0 ? `广告费 ${fmt(p.ad_cost)} / 上限 ${fmt(p.cpa_benchmark)}` : '数据不足';
    const profitCell = p.has_cost_breakdown
      ? `<b>${fmt(p.effective_profit)}</b><div class="muted">自动算</div>`
      : `${fmt(p.gross_profit)}`;
    return `<tr>
      <td><b>${esc(p.name)}</b><div class="muted">${esc(p.shop||'拼多多')} · ${esc(p.notes||'—')}</div></td>
      <td class="num">${fmt(p.selling_price)}</td>
      <td class="num">${profitCell}</td>
      <td class="num">${fmtPct(p.margin)}</td>
      <td class="num">${fmtPct(p.refund_rate)}</td>
      <td class="num"><span class="tag ${roiColor}">${fmt(roi,3)}</span></td>
      <td class="num">${fmt(p.target_roi,3)}</td>
      <td class="num"><span class="tag ${rec}">${recText}</span></td>
      <td class="num">${fmt(p.suggested_daily_budget)}</td>
      <td class="num">${fmtPct(p.ctr)}</td>
      <td class="num">${fmtPct(p.cvr)}</td>
      <td class="num"><button class="btn sm" data-edit="${esc(p.id)}">编辑</button> <button class="btn sm danger" data-del="${esc(p.id)}">删除</button></td>
    </tr>`;
  }).join('');
  return `
    <div class="panel">
      <div class="panel-header"><h2>商品投产表</h2><button class="btn subtle" id="export-btn">导出 CSV</button></div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>商品</th><th>到手价</th><th>毛利</th><th>利润率</th><th>售后率</th>
          <th>保本 ROI</th><th>目标 ROI</th><th>成交花费</th><th>日预算建议</th><th>CTR</th><th>CVR</th><th>操作</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="callout">日预算建议=单件毛利×有效成交率×2。先用小预算验证，再按实际成交花费校准，不要在未验证前放大花费。</div>
    </div>`;
}

function renderProducts(editingProduct = null) {
  $('#view-products').innerHTML = productFormHTML(editingProduct || {}) + productTableHTML();
  const form = $('#product-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = {};
    fd.forEach((v,k)=> body[k]=v);
    try {
      await api('/api/products','POST',body);
      await loadAll();
      renderProducts();
      toast('商品已保存');
    } catch(err) { toast(err.message); }
  });
  $$('[data-edit]').forEach(b => b.onclick = () => {
    const p = shopProducts().find(x => x.id === b.dataset.edit);
    if (p) renderProducts(p);
  });
  $$('[data-del]').forEach(b => b.onclick = async () => {
    const p = shopProducts().find(x => x.id === b.dataset.del);
    const name = p ? p.name : '该商品';
    const ok = await confirmDialog(`删除「<b>${esc(name)}</b>」后不可恢复，确定删除吗？`, { title: '删除商品' });
    if (!ok) return;
    try { await api(`/api/products/${b.dataset.del}`,'DELETE'); await loadAll(); renderProducts(); toast('已删除'); }
    catch(err){ toast(err.message); }
  });
  const exp = $('#export-btn');
  if (exp) exp.onclick = () => window.open(BASE + '/api/products/export','_blank');
}

/* ---------------- 商品库（平台 + 电商层级） ---------------- */
const catalogCache = { tree: [], stats: {}, orders: [], analysis: null, filter: '', mods: [], modCounts: {}, goodsEffect: [], performance: null, perfAll: null, promoAnalysis: null, lowStock: [], selection: null, freight: null, freightMatch: null, freightRate: [], freightCompare: null, suppliers: [], supplierProducts: {}, freightMonth: '', freightShop: null, deleteMode: false, perfShop: null, perfRange: null, perfPreset: 'all', perfStatuses: [], orderStatuses: [], serverToday: '' };

// 日期工具：'YYYY-MM-DD' -> 本地 Date / Date -> 'YYYY-MM-DD'
const dToObj = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

// 快捷时间段：本周/上周/本月/上月 -> {start, end}（today 用服务器日期）
function rangeFor(key, today) {
  const t = dToObj(today);
  const dow = t.getDay(); // 0=周日
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  if (key === 'week') {
    const monday = new Date(t.getFullYear(), t.getMonth(), t.getDate() - mondayOffset);
    return { start: fmtDate(monday), end: today };
  }
  if (key === 'last_week') {
    const thisMonday = new Date(t.getFullYear(), t.getMonth(), t.getDate() - mondayOffset);
    const lastMonday = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7);
    const lastSunday = new Date(lastMonday.getFullYear(), lastMonday.getMonth(), lastMonday.getDate() + 6);
    return { start: fmtDate(lastMonday), end: fmtDate(lastSunday) };
  }
  if (key === 'month') {
    return { start: today.slice(0, 7) + '-01', end: today };
  }
  if (key === 'last_month') {
    const first = new Date(t.getFullYear(), t.getMonth() - 1, 1);
    const last = new Date(t.getFullYear(), t.getMonth(), 0);
    return { start: fmtDate(first), end: fmtDate(last) };
  }
  return null; // all
}

// 经营分析时间段/店铺查询串
const perfQs = () => {
  const parts = [];
  if (catalogCache.perfShop) parts.push(`shop_id=${catalogCache.perfShop}`);
  (catalogCache.perfStatuses || []).forEach(st => parts.push(`status=${encodeURIComponent(st)}`));
  const r = catalogCache.perfRange;
  if (r) {
    if (r.start) parts.push(`start=${r.start}`);
    if (r.end) parts.push(`end=${r.end}`);
  }
  return parts.length ? '?' + parts.join('&') : '';
};

// 重新拉取经营分析（performance + performance-all），按当前时间段/店铺筛选
async function reloadPerf() {
  const [perfResp, perfAllResp] = await Promise.all([
    api('/api/catalog/performance' + perfQs()),
    api('/api/catalog/performance-all' + perfQs()),
  ]);
  catalogCache.performance = perfResp || null;
  catalogCache.perfAll = perfAllResp || null;
  if (perfAllResp && perfAllResp.server_today) catalogCache.serverToday = perfAllResp.server_today;
  paintCatalog();
}

async function renderCatalog() {
  const el = $('#view-catalog');
  el.innerHTML = '<div class="empty"><div class="big">📦</div>加载中…</div>';
  try {
    const [stats, treeResp, ordersResp, analysis, modsResp, countsResp, geResp, perfResp, perfAllResp, promoResp, lowResp, selResp, freightResp, freightMatchResp, freightRateResp, freightCompareResp, suppliersResp, statusesResp] = await Promise.all([
      api('/api/catalog/stats'),
      api('/api/catalog/tree'),
      api('/api/catalog/orders?limit=5000'),
      api('/api/catalog/analysis'),
      api('/api/catalog/modifications'),
      api('/api/catalog/modifications/counts'),
      api('/api/catalog/goods-effect'),
      api('/api/catalog/performance' + perfQs()),
      api('/api/catalog/performance-all' + perfQs()),
      api('/api/catalog/promotions-analysis'),
      api('/api/catalog/low-stock'),
      api('/api/catalog/selection'),
      api('/api/catalog/freight'),
      api('/api/catalog/freight/match-analysis'),
      api('/api/catalog/freight-rate'),
      api('/api/catalog/freight-compare'),
      api('/api/catalog/suppliers'),
      api('/api/catalog/order-statuses'),
    ]);
    catalogCache.stats = stats;
    catalogCache.tree = treeResp.items || [];
    catalogCache.orders = ordersResp.items || [];
    catalogCache.analysis = analysis;
    catalogCache.mods = modsResp.items || [];
    catalogCache.modCounts = countsResp || {};
    catalogCache.goodsEffect = geResp.items || [];
    catalogCache.performance = perfResp || null;
    catalogCache.perfAll = perfAllResp || null;
    if (perfAllResp && perfAllResp.server_today) catalogCache.serverToday = perfAllResp.server_today;
    catalogCache.promoAnalysis = promoResp || null;
    catalogCache.lowStock = lowResp.items || [];
    catalogCache.selection = selResp || null;
    catalogCache.freight = freightResp || null;
    catalogCache.freightMatch = freightMatchResp || null;
    catalogCache.freightRate = freightRateResp.items || [];
    catalogCache.freightCompare = freightCompareResp || null;
    catalogCache.suppliers = suppliersResp.items || [];
    catalogCache.orderStatuses = (statusesResp && statusesResp.items) || [];
    paintCatalog();
  } catch (err) {
    el.innerHTML = `<div class="empty">❌ ${esc(err.message)}</div>`;
  }
}


async function renderSuppliersView() {
  const supEl = $('#view-suppliers');
  supEl.innerHTML = '<div class="empty"><div class="big">🏭</div>加载中…</div>';

  // 懒加载供应商列表（若商品库尚未加载过）
  if (!catalogCache.suppliers.length) {
    try {
      const resp = await api('/api/catalog/suppliers');
      catalogCache.suppliers = resp.items || [];
    } catch (err) {
      supEl.innerHTML = `<div class="empty">❌ ${esc(err.message)}</div>`;
      return;
    }
  }

  // 图片点击弹框预览（事件委托，只绑定一次）
  if (!supEl.dataset.bound) {
    supEl.dataset.bound = '1';
    supEl.addEventListener('click', e => {
      const img = e.target.closest('[data-lightbox]');
      if (img) showImageLightbox(img.dataset.lightbox);
    });
  }

  // 商品表格渲染（供应商内 / 搜索结果共用，showSupplier 控制是否显示供应商列）
  const supTableHTML = (items, showSupplier) => items.length
    ? `<div class="table-wrap"><table>
      <thead><tr>${showSupplier ? '<th>供应商</th>' : ''}<th>图</th><th>货号</th><th>名称</th><th>供货价</th><th>零售价</th><th>规格</th><th>颜色</th><th>重量</th></tr></thead>
      <tbody>${items.map(r => `<tr>
        ${showSupplier ? `<td class="sup-src">${esc(r.supplier_name || '')}</td>` : ''}
        <td class="sup-img-cell">${r.image ? `<img src="${BASE}/static/${esc(r.image)}" loading="lazy" alt="" data-lightbox="${BASE}/static/${esc(r.image)}">` : '<span class="sup-noimg">—</span>'}</td>
        <td>${esc(r.product_code || '')}</td>
        <td title="${esc(r.product_name)}">${esc((r.product_name || '').slice(0, 20))}${(r.product_name || '').length > 20 ? '…' : ''}</td>
        <td class="sup-price">${r.supply_price != null ? r.supply_price : '—'}</td>
        <td class="sup-price">${r.retail_price != null ? r.retail_price : '—'}</td>
        <td title="${esc(r.spec)}">${esc((r.spec || '').slice(0, 14))}</td>
        <td>${esc(r.color || '')}</td>
        <td>${r.weight != null ? r.weight : ''}</td>
      </tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">暂无商品</div>';

  // 渲染供应商列表
  const renderSupplierList = () => {
    const sups = catalogCache.suppliers || [];
    const listEl = supEl.querySelector('[data-sup-list]');
    if (!listEl) return;
    if (!sups.length) {
      listEl.innerHTML = '<div class="empty">暂无供应商数据。点「⬆ 导入」粘贴 CSV 导入。</div>';
      return;
    }
    listEl.innerHTML = sups.map(s => `
      <div class="sup-item">
        <div class="sup-head" data-sup-id="${s.id}">
          <span class="sup-fold">▸</span>
          <span class="sup-name">🏭 ${esc(s.name)}</span>
          <span class="sup-count">${s.product_count} 条</span>
          ${s.source ? `<span class="sup-src">${esc(s.source)}</span>` : ''}
        </div>
        <div class="sup-body" id="sup-body-${s.id}" hidden></div>
      </div>`).join('');
    listEl.querySelectorAll('[data-sup-id]').forEach(h => {
      h.onclick = async () => {
        const body = $('#sup-body-' + h.dataset.supId);
        const fold = h.querySelector('.sup-fold');
        const willOpen = body.hidden;
        body.hidden = !willOpen;
        if (fold) fold.textContent = willOpen ? '▾' : '▸';
        if (willOpen && !body.dataset.loaded) {
          body.dataset.loaded = '1';
          body.innerHTML = '<div class="empty">加载中…</div>';
          try {
            const resp = await api('/api/catalog/supplier-products?supplier_id=' + h.dataset.supId);
            body.innerHTML = supTableHTML(resp.items || [], false);
          } catch (e) {
            body.innerHTML = '<div class="empty">加载失败</div>';
          }
        }
      };
    });
  };

  // 初始渲染：工具栏 + 列表
  supEl.innerHTML = `
    <div class="sup-toolbar">
      <input class="sup-search" data-sup-search placeholder="🔍 搜索货号/名称/规格/供应商">
      <button class="btn sm" data-sup-import>⬆ 导入</button>
      <button class="btn sm" data-sup-export>⬇ 导出</button>
    </div>
    <div data-sup-list></div>`;
  renderSupplierList();

  // 搜索（防抖 300ms）
  let searchTimer;
  supEl.querySelector('[data-sup-search]').addEventListener('input', e => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    const listEl = supEl.querySelector('[data-sup-list]');
    if (!q) { renderSupplierList(); return; }
    searchTimer = setTimeout(async () => {
      listEl.innerHTML = '<div class="empty">搜索中…</div>';
      try {
        const resp = await api('/api/catalog/supplier-products?q=' + encodeURIComponent(q));
        const items = resp.items || [];
        listEl.innerHTML = items.length
          ? `<div class="sup-search-tip">🔍 找到 ${items.length} 条匹配</div>` + supTableHTML(items, true)
          : '<div class="empty">无匹配商品</div>';
      } catch (err) {
        listEl.innerHTML = '<div class="empty">搜索失败</div>';
      }
    }, 300);
  });

  // 导入
  supEl.querySelector('[data-sup-import]').onclick = async () => {
    const r = await promptDialog([{ key: 'csv', label: 'CSV 内容（粘贴，首行表头）', value: '', placeholder: '供应商名称,货号,商品名称,供货价,零售价,规格,颜色,重量(kg),箱规,库存,来源链接,备注\n示例供应商,S001,示例商品,10.5,29.9,大号,白色,0.5,,,\n…' }], { title: '导入供应商商品', confirmText: '导入' });
    if (!r) return;
    try {
      const res = await api('/api/catalog/supplier-import', 'POST', { csv: r.csv });
      toast(`导入成功：${res.imported} 条商品（${res.suppliers} 个供应商）`);
      const resp = await api('/api/catalog/suppliers');
      catalogCache.suppliers = resp.items || [];
      supEl.querySelector('[data-sup-search]').value = '';
      renderSupplierList();
    } catch (err) { toast(err.message); }
  };

  // 导出
  supEl.querySelector('[data-sup-export]').onclick = () => {
    window.open(BASE + '/api/catalog/export?type=supplier', '_blank');
  };
}

async function loadFreight(month, shop) {
  const q = [];
  if (month) q.push('month=' + encodeURIComponent(month));
  if (shop) q.push('shop_id=' + shop);
  catalogCache.freightMonth = month || '';
  catalogCache.freightShop = shop || null;
  try {
    const qs = q.length ? '?' + q.join('&') : '';
    const [fr, ma] = await Promise.all([
      api('/api/catalog/freight' + qs),
      api('/api/catalog/freight/match-analysis' + qs),
    ]);
    catalogCache.freight = fr;
    catalogCache.freightMatch = ma;
  } catch (e) { toast(e.message); return; }
  const freightEl = $('#catalog-freight');
  if (freightEl) renderFreightPanel(freightEl);
}

function renderFreightPanel(freightEl) {
  const fr = catalogCache.freight;
  if (!fr || fr.total <= 0) {
    freightEl.innerHTML = '<div class="empty">暂无运费账单。用 import_freight.py 导入快递账单 xlsx。</div>';
    return;
  }
  const months = (fr.monthly || []).map(m => m.ym);
  const shops = (catalogCache.tree || []).flatMap(x => x.shops || []);
  const filterBar = `
    <div class="freight-filter">
      <span class="ff-label">筛选</span>
      <select data-freight-month class="ff-select">
        <option value="">全部月份</option>
        ${months.map(m => `<option value="${m}" ${catalogCache.freightMonth === m ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
      <select data-freight-shop class="ff-select">
        <option value="">全部店铺</option>
        ${shops.map(s => `<option value="${s.id}" ${catalogCache.freightShop == s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
    </div>`;
  const provs = (fr.provinces || []).slice(0, 8);
  const maxProv = provs.length ? provs[0].n : 1;
  const ratio = fr.fee_gmv_ratio != null ? fr.fee_gmv_ratio + '%' : '—';
  const unmatched = fr.total - fr.matched;
  const fm = catalogCache.freightMatch;
  const anomalies = (fm && fm.anomalies) || [];
  const matchHTML = anomalies.length
    ? `
    <div class="callout" style="margin-bottom:10px">共 ${fm.total_groups} 组「相同 SKU+数量」，其中 ${fm.anomaly_total} 单运费偏离标准（多为重量差异）。</div>
    <div class="table-wrap"><table>
      <thead><tr><th>规格</th><th>标准运费</th><th>实际运费</th><th>差值</th><th>重量</th><th>目的地</th></tr></thead>
      <tbody>${anomalies.slice(0, 30).map(a => `
        <tr>
          <td title="${esc(a.spec)}">${esc((a.spec || '').slice(0, 16))}${(a.spec || '').length > 16 ? '…' : ''}</td>
          <td>¥${fmt(a.standard_fee)}</td>
          <td>¥${fmt(a.actual_fee)}</td>
          <td class="${a.diff > 0 ? 'stock-low' : ''}">${a.diff > 0 ? '+' : ''}${fmt(a.diff)}</td>
          <td>${a.weight != null ? a.weight + 'kg' : '—'}</td>
          <td>${esc(a.province)}${esc(a.city)}</td>
        </tr>`).join('')}
      </tbody></table></div>
    ${fm.anomaly_total > 30 ? `<div class="orders-more">仅显示前 30 条，共 ${fm.anomaly_total} 条异常单</div>` : ''}`
    : '<div class="empty">暂无异常运费（所有匹配单运费一致）</div>';
  const rates = catalogCache.freightRate || [];
  const rateHTML = rates.length ? rates.map(r => `
        <tr>
          <td title="${esc(r.provinces)}">${esc(r.region_group)}</td>
          <td>${r.w0_05 != null ? r.w0_05 : '—'}</td>
          <td>${r.w05_1 != null ? r.w05_1 : '—'}</td>
          <td>${r.w1_2 != null ? r.w1_2 : '/'}</td>
          <td>${r.w2_3 != null ? r.w2_3 : '/'}</td>
          <td>${r.first_price}</td>
          <td>${r.add_price}</td>
        </tr>`).join('') : '';
  const cmp = catalogCache.freightCompare;
  const cmpHTML = cmp && cmp.total_compared > 0 ? `
    <div class="perf-summary" style="margin-bottom:12px">
      <div class="perf-card"><div class="p-label">已对账</div><div class="p-value">${cmp.total_compared}</div></div>
      <div class="perf-card"><div class="p-label">相符</div><div class="p-value">${cmp.match}</div></div>
      <div class="perf-card"><div class="p-label">多收</div><div class="p-value" style="color:var(--red)">${cmp.over}</div></div>
      <div class="perf-card"><div class="p-label">少收</div><div class="p-value">${cmp.under}</div></div>
      <div class="perf-card"><div class="p-label">多收总额</div><div class="p-value" style="color:var(--red)">¥${fmt(cmp.over_amount)}</div></div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>规格</th><th>重量</th><th>标准</th><th>实际</th><th>差</th><th>目的地</th></tr></thead>
      <tbody>${cmp.items.slice(0, 20).map(x => `
        <tr>
          <td title="${esc(x.spec)}">${esc((x.spec || '').slice(0, 14))}${(x.spec || '').length > 14 ? '…' : ''}</td>
          <td>${x.weight}kg</td>
          <td>¥${fmt(x.standard)}</td>
          <td>¥${fmt(x.actual)}</td>
          <td class="${x.diff > 0 ? 'stock-low' : ''}">${x.diff > 0 ? '+' : ''}${fmt(x.diff)}</td>
          <td>${esc(x.province)}</td>
        </tr>`).join('')}
      </tbody></table></div>
    ${cmp.items.length > 20 ? `<div class="orders-more">仅显示前 20 条，共 ${cmp.items.length} 条</div>` : ''}`
    : '<div class="empty">暂无对账数据（需匹配订单且有重量）</div>';
  freightEl.innerHTML = filterBar + `
    <div class="perf-summary" style="margin-bottom:14px">
      <div class="perf-card"><div class="p-label">运费单数</div><div class="p-value">${fr.total}</div></div>
      <div class="perf-card"><div class="p-label">总运费</div><div class="p-value">¥${fmt(fr.total_fee)}</div></div>
      <div class="perf-card"><div class="p-label">匹配率</div><div class="p-value">${fr.match_rate}%</div></div>
      <div class="perf-card"><div class="p-label">平均运费</div><div class="p-value">¥${fr.avg_fee}</div></div>
      <div class="perf-card"><div class="p-label">运费/GMV</div><div class="p-value">${ratio}</div><div class="p-hint">匹配订单口径</div></div>
    </div>
    ${unmatched > 0 ? `<div class="callout">⚠️ 还有 ${unmatched} 单运费未匹配到订单（多为对应月份订单尚未导入）。补导订单后点「🔁 重新匹配」。</div>` : `<div class="callout" style="border-color:var(--green)">✅ 全部运费已匹配订单</div>`}
    <div style="display:flex;gap:8px;margin:10px 0 14px;flex-wrap:wrap">
      <button class="btn sm" data-freight-rematch>🔁 重新匹配</button>
      <button class="btn sm" data-freight-export>⬇ 导出运费</button>
    </div>
    <h4 style="margin:0 0 8px">🗺️ 目的地省份 TOP</h4>
    ${provs.length ? provs.map(p => `
      <div class="perf-bar-row">
        <span class="perf-date">${esc(p.province)}</span>
        <div class="perf-bar"><div class="perf-fill" style="width:${Math.max(Math.round(p.n / maxProv * 100), 2)}%"></div></div>
        <span class="perf-amt">${p.n}单</span>
      </div>`).join('') : '<div class="empty">暂无</div>'}
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--line)">
    <h4 style="margin:0 0 8px">🔍 匹配分析 <span class="perf-hint">相同 SKU+数量，标准运费 vs 异常</span></h4>
    ${matchHTML}
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--line)">
    <h4 style="margin:0 0 8px">📋 运费报价单 <span class="perf-hint">中通·嘉裕工艺品 2025-11-10</span></h4>
    <div class="table-wrap"><table>
      <thead><tr><th>地区</th><th>0-0.5kg</th><th>0.5-1kg</th><th>1-2kg</th><th>2-3kg</th><th>首重1kg</th><th>续重/kg</th></tr></thead>
      <tbody>${rateHTML}</tbody></table></div>
    <div class="perf-hint" style="margin:6px 0 0">附加票费：北京+1.5 / 上海+1 / 深圳·海南+0.5；「/」=该区间走首重+续重</div>
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--line)">
    <h4 style="margin:0 0 8px">💰 自动对账 <span class="perf-hint">实际运费 vs 报价单标准</span></h4>
    ${cmpHTML}`;
  freightEl.querySelector('[data-freight-month]').onchange = e => loadFreight(e.target.value, catalogCache.freightShop);
  freightEl.querySelector('[data-freight-shop]').onchange = e => loadFreight(catalogCache.freightMonth, e.target.value);
  freightEl.querySelector('[data-freight-rematch]').onclick = async () => {
    try {
      const r = await api('/api/catalog/freight/match', 'POST');
      toast(`重新匹配完成：新匹配 ${r.new_matched} 单（共 ${r.matched}/${r.total}）`);
      catalogCache.freight = await api('/api/catalog/freight');
      renderFreightPanel(freightEl);
    } catch (err) { toast(err.message); }
  };
  freightEl.querySelector('[data-freight-export]').onclick = () => {
    window.open(BASE + '/api/catalog/export?type=freight', '_blank');
  };
}


function paintCatalog() {
  const el = $('#view-catalog');
  const tree = catalogCache.tree;
  const stats = catalogCache.stats;
  const a = catalogCache.analysis || {};
  const f = (catalogCache.filter || '').toLowerCase();
  const modMap = buildModMap();

  // 平台→店铺层级元数据（供订单/访问/推广/库存/选品 5 面板统一分组）
  const shopMeta = {};
  const shopList = [];
  for (const pl of tree) {
    for (const sh of (pl.shops || [])) {
      shopMeta[sh.id] = { platform: pl.name, shop: sh.name };
      shopList.push({ id: sh.id, platform: pl.name, shop: sh.name });
    }
  }
  // 按平台归组：rows 每条用 keyFn 取 shop_id，输出 {平台名: [{shop, shopId, rows:[...]}]}
  const groupByPlatform = (rows, keyFn) => {
    const byShop = {};
    for (const r of rows) {
      const sid = keyFn(r);
      (byShop[sid] = byShop[sid] || []).push(r);
    }
    const byPlatform = {};
    for (const [sid, arr] of Object.entries(byShop)) {
      const meta = shopMeta[sid] || { platform: '未分类', shop: '未知店铺' };
      (byPlatform[meta.platform] = byPlatform[meta.platform] || []).push({ shop: meta.shop, shopId: Number(sid), rows: arr });
    }
    return byPlatform;
  };

  const pct = (n, total) => total ? Math.round(n / total * 100) : 0;
  const pricePct = pct(a.priced, a.total_skus);
  const stockPct = pct(a.stocked, a.total_skus);
  const codePct = pct(a.coded, a.total_products);
  const bar = (p, color) => `<div class="ov-bar"><div class="ov-fill" style="width:${p}%;background:${color}"></div></div>`;
  const barColor = p => p < 50 ? '#e74c3c' : p < 100 ? '#f39c12' : '#2ecc71';
  const series = Object.entries(a.series || {}).sort((x, y) => y[1] - x[1]);
  const topSkus = a.top_skus || [];
  const overview = `
    <div class="catalog-overview">
      <div class="ov-card">
        <h4>📊 数据完整度</h4>
        <div class="ov-row"><span>价格</span><b>${a.priced}/${a.total_skus}</b>${bar(pricePct, barColor(pricePct))}<em>${pricePct}%</em></div>
        <div class="ov-row"><span>库存</span><b>${a.stocked}/${a.total_skus}</b>${bar(stockPct, barColor(stockPct))}<em>${stockPct}%</em></div>
        <div class="ov-row"><span>货号</span><b>${a.coded}/${a.total_products}</b>${bar(codePct, barColor(codePct))}<em>${codePct}%</em></div>
      </div>
      <div class="ov-card">
        <h4>🏆 SKU 规模 Top</h4>
        ${topSkus.map((t, i) => `<div class="ov-top"><span class="ov-rank">${i + 1}</span><span class="ov-name" title="${esc(t.name)}">${esc(t.code || '无')} ${esc((t.name || '').slice(0, 13))}</span><span class="tag blue">${t.sku_count} SKU</span></div>`).join('') || '<div class="empty">无</div>'}
      </div>
      <div class="ov-card">
        <h4>🏷️ 货号系列</h4>
        <div class="ov-tags">${series.map(([k, v]) => `<span class="tag ${k === '无货号' ? 'red' : 'blue'}">${esc(k)} × ${v}</span>`).join('') || '<span class="empty">无</span>'}</div>
        <div class="ov-hint">Z=园艺装饰 · S=收纳 · G=园艺挂架</div>
      </div>
    </div>`;

  // 经营分析看板（销售概览 + 商品销量 TOP + 日趋势 + 地区）
  const perf = catalogCache.performance;
  // 汇总 + 各店铺对比表
  const perfAll = catalogCache.perfAll;
  let perfAllHTML = '';
  if (perfAll && perfAll.shops && perfAll.shops.length) {
    const pshops = perfAll.shops;
    // 店铺为行、指标为列（手机端更窄，横向滚动幅度小）
    const pcols = [
      ['GMV', s => '¥' + fmt(s.gmv || 0)],
      ['订单数', s => s.order_count || 0],
      ['有发货', s => s.shipped_count || 0],
      ['售后率', s => (s.aftersale_rate != null ? s.aftersale_rate + '%' : '—')],
      ['未发货退款', s => s.unshipped_refund || 0],
    ];
    const pcell = (summary) => pcols.map(([, fn]) => `<td>${fn(summary)}</td>`).join('');
    // 时间段快捷筛选（本周/上周/本月/上月/全部）+ 自定义日期段
    const preset = catalogCache.perfPreset || 'all';
    const rangeBtns = [['week', '本周'], ['last_week', '上周'], ['month', '本月'], ['last_month', '上月'], ['all', '全部']]
      .map(([k, label]) => `<button class="perf-rbtn ${preset === k ? 'active' : ''}" data-perf-range="${k}">${label}</button>`).join('');
    const curRange = catalogCache.perfRange || {};
    const customStart = (preset === 'custom' ? (curRange.start || '') : '');
    const customEnd = (preset === 'custom' ? (curRange.end || '') : '');
    const customHtml = `
        <span class="perf-custom-label">自定义</span>
        <input type="date" class="perf-date ${preset === 'custom' ? 'active' : ''}" data-perf-start value="${customStart}">
        <span class="perf-date-sep">~</span>
        <input type="date" class="perf-date ${preset === 'custom' ? 'active' : ''}" data-perf-end value="${customEnd}">`;
    perfAllHTML = `
    <div class="perf-shops">
      <div class="perf-shops-head">
        <h4>🏪 汇总 + 各店铺</h4>
        <div class="perf-range">${rangeBtns}${customHtml}</div>
      </div>
      <div class="perf-shop-scroll">
        <table class="perf-shop-table">
          <thead><tr><th>平台</th><th>店铺</th>${pcols.map(([l]) => `<th>${l}</th>`).join('')}</tr></thead>
          <tbody>
            <tr class="perf-shop-all"><td>—</td><td>全部</td>${pcell(perfAll.summary || {})}</tr>
            ${pshops.map(sh => `<tr><td>${esc(sh.platform)}</td><td>${esc(sh.shop_name)}</td>${pcell(sh.summary || {})}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }
  let perfHTML = '';
  if (perf && perf.summary) {
    const sm = perf.summary || {};
    const top = perf.top_products || [];
    const topShown = top.slice(0, 10);
    const topRest = top.slice(10);
    const daily = perf.daily_trend || [];
    const regions = perf.regions || [];
    const maxAmt = Math.max(...daily.map(d => d.amount || 0), 1);
    const dailySorted = [...daily].sort((a, b) => (b.amount || 0) - (a.amount || 0));
    const dailyTop = dailySorted.slice(0, 10);
    const dailyRest = dailySorted.slice(10);
    perfHTML = `
    <div class="perf-panel">
      <div class="perf-header">
        <h3 class="perf-title">📊 经营分析</h3>
        <select class="perf-shop-filter" data-perf-shop>
          <option value="" ${!catalogCache.perfShop ? 'selected' : ''}>全部店铺</option>
          ${tree.flatMap(x => x.shops || []).map(sh => `<option value="${sh.id}" ${catalogCache.perfShop == sh.id ? 'selected' : ''}>${esc(sh.name)}</option>`).join('')}
        </select>
        <div class="perf-status-chips">
          <button class="perf-sbtn ${(catalogCache.perfStatuses || []).length === 0 ? 'active' : ''}" data-perf-status="">全部</button>
          ${(catalogCache.orderStatuses || []).map(s => {
            const on = (catalogCache.perfStatuses || []).includes(s.status);
            return `<button class="perf-sbtn ${on ? 'active' : ''}" data-perf-status="${esc(s.status)}">${esc(s.status)}（${s.count}）</button>`;
          }).join('')}
        </div>
      </div>
      <div class="perf-summary">
        <div class="perf-card"><div class="p-label">GMV（实付）</div><div class="p-value">¥${fmt(sm.gmv)}</div></div>
        <div class="perf-card"><div class="p-label">订单数</div><div class="p-value">${sm.order_count}</div><div class="p-hint">有发货 ${sm.shipped_count} 单</div></div>
        <div class="perf-card"><div class="p-label">客单价</div><div class="p-value">¥${fmt(sm.avg_order)}</div></div>
        <div class="perf-card"><div class="p-label">件数</div><div class="p-value">${sm.item_count}</div></div>
        <div class="perf-card"><div class="p-label">售后率</div><div class="p-value">${sm.aftersale_rate}%</div><div class="p-hint">发货后售后 ${sm.aftersale_count} ÷ 有发货 ${sm.shipped_count} 单</div></div>
        <div class="perf-card"><div class="p-label">未发货退款</div><div class="p-value">${sm.unshipped_refund}</div><div class="p-hint">下单流失，不计售后</div></div>
      </div>
      <div class="perf-note" style="color:var(--red);font-weight:600">⚠️ 口径：GMV（实付）、订单数、件数 统计<b>全部订单状态</b>，包含「已发货退款」「已收货退款」「未发货退款」「已取消/关闭」（${sm.canceled || 0} 单）「待付款」「待发货」。已发货/已收货退款单仍计入 GMV 与订单数；未发货退款单独列「下单流失」，不计入售后率。</div>
      <div class="perf-note">📌 售后率 = 发货后售后 ÷ 有发货订单（来源：订单「订单状态 / 售后状态」字段）。</div>
      ${perfAllHTML}
      <div class="perf-cols">
        <div class="perf-col">
          <h4>🏆 商品销量 TOP${topRest.length ? `<span class="perf-hint">共 ${top.length} 个</span>` : ''}</h4>
          ${topShown.length ? topShown.map((t, i) => `
            <div class="perf-rank">
              <span class="perf-rk">${i + 1}</span>
              <span class="perf-name" title="${esc(t.name)}">${esc((t.name || '').slice(0, 13))}${(t.name || '').length > 13 ? '…' : ''}${t.code ? ' <em>' + esc(t.code) + '</em>' : ''}</span>
              <span class="perf-amt">¥${fmt(t.amount)}</span>
              <span class="perf-odr">${t.orders}单</span>
            </div>`).join('') : '<div class="empty">暂无订单</div>'}
          ${topRest.length ? `
            <button class="daily-more-btn" data-toggle-top data-count="${topRest.length}">展开其余 ${topRest.length} 个商品 ▾</button>
            <div class="top-rest" hidden>
              ${topRest.map((t, i) => `
                <div class="perf-rank">
                  <span class="perf-rk">${i + 11}</span>
                  <span class="perf-name" title="${esc(t.name)}">${esc((t.name || '').slice(0, 13))}${(t.name || '').length > 13 ? '…' : ''}${t.code ? ' <em>' + esc(t.code) + '</em>' : ''}</span>
                  <span class="perf-amt">¥${fmt(t.amount)}</span>
                  <span class="perf-odr">${t.orders}单</span>
                </div>`).join('')}
            </div>` : ''}
        </div>
        <div class="perf-col">
          <h4>📅 日趋势 <span class="perf-hint">金额 TOP${dailyTop.length}</span></h4>
          ${dailyTop.length ? dailyTop.map(d => `
            <div class="perf-bar-row">
              <span class="perf-date">${esc((d.date || '').slice(5))}</span>
              <div class="perf-bar"><div class="perf-fill" style="width:${Math.max(Math.round((d.amount || 0) / maxAmt * 100), 2)}%"></div></div>
              <span class="perf-amt">¥${fmt(d.amount)}</span>
            </div>`).join('') : '<div class="empty">暂无</div>'}
          ${dailyRest.length ? `
            <button class="daily-more-btn" data-toggle-daily data-count="${dailyRest.length}">展开其余 ${dailyRest.length} 天 ▾</button>
            <div class="daily-rest" hidden>
              ${dailyRest.map(d => `
                <div class="perf-bar-row">
                  <span class="perf-date">${esc((d.date || '').slice(5))}</span>
                  <div class="perf-bar"><div class="perf-fill" style="width:${Math.max(Math.round((d.amount || 0) / maxAmt * 100), 2)}%"></div></div>
                  <span class="perf-amt">¥${fmt(d.amount)}</span>
                </div>`).join('')}
            </div>` : ''}
        </div>
        <div class="perf-col">
          <h4>🗺️ 地区 TOP</h4>
          ${regions.length ? regions.map(r => `
            <div class="perf-rank">
              <span class="perf-name">${esc(r.province)}</span>
              <span class="perf-odr">${r.orders}单</span>
              <span class="perf-amt">¥${fmt(r.amount)}</span>
            </div>`).join('') : '<div class="empty">暂无</div>'}
        </div>
      </div>
    </div>`;
  }

  let html = `
    <div class="delete-toggle-bar">
      <label class="delete-toggle">
        <input type="checkbox" id="delete-mode" ${catalogCache.deleteMode ? 'checked' : ''}>
        <span class="delete-toggle-track"><span class="delete-toggle-thumb"></span></span>
        <span class="delete-toggle-label">🗑️ 删除模式</span>
      </label>
      <span class="delete-toggle-hint">${catalogCache.deleteMode ? '已开启 — 可删除平台/店铺' : '默认关闭，避免误删'}</span>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="label">平台</div><div class="value">${stats.platforms || 0}</div></div>
      <div class="stat-card"><div class="label">店铺</div><div class="value">${stats.shops || 0}</div></div>
      <div class="stat-card"><div class="label">商品 SPU</div><div class="value">${stats.products || 0}</div></div>
      <div class="stat-card"><div class="label">SKU</div><div class="value">${stats.skus || 0}</div><div class="hint">已标价 ${stats.sku_priced || 0} · 已设库存 ${stats.sku_stocked || 0}</div></div>
      <div class="stat-card"><div class="label">订单</div><div class="value">${stats.orders || 0}</div></div>
      <div class="stat-card"><div class="label">推广记录</div><div class="value">${stats.promotions || 0}</div><div class="hint">待导入</div></div>
    </div>
    ${overview}
    ${perfHTML}
    <div class="callout">📌 多平台真实数据（拼多多/京东/小红书/微信/淘宝/抖音，2026-09-23 导入）。推广数据待导入；商品访问明细仅拼多多已采集。</div>
    <div class="catalog-searchbar"><input id="catalog-search" class="search" placeholder="🔍 搜索商品名 / 商品ID / 货号…" value="${esc(catalogCache.filter)}"></div>
    <div id="catalog-body"></div>
    <div class="orders-panel">
      <div class="orders-panel-head" data-toggle-ge>
        <span class="orders-fold-icon">▸</span>
        <span class="orders-panel-title">📈 商品访问明细</span>
        <span class="orders-panel-count">${catalogCache.goodsEffect.length}</span>
        <span class="orders-panel-hint">点击展开 / 收起</span>
      </div>
      <div class="orders-panel-body" id="catalog-ge" hidden>
        <div class="ge-toolbar">
          <button class="btn primary sm" data-ge-collect>🔄 采集最新数据</button>
          <select id="ge-date-filter" class="ge-filter" title="按日期筛选">
            <option value="all">全部日期</option>
            <option value="today">今日</option>
            <option value="yesterday">昨日</option>
            <option value="7d">近7天</option>
            <option value="30d">近30天</option>
          </select>
          <span class="ge-hint">采集拼多多「商品数据·商品明细」，约需 30~60 秒</span>
        </div>
        <div id="catalog-ge-table"></div>
      </div>
    </div>
    <div class="orders-panel">
      <div class="orders-panel-head" data-toggle-orders>
        <span class="orders-fold-icon">▸</span>
        <span class="orders-panel-title">📋 订单记录</span>
        <span class="orders-panel-count">${catalogCache.orders.length}</span>
        <span class="orders-panel-hint">点击展开 / 收起</span>
        <button class="btn xs" data-orders-import title="导入订单 CSV">⬆ 导入</button>
        <button class="btn xs" data-orders-doc title="订单导出字段说明">📄 字段文档</button>
      </div>
      <div class="orders-panel-body" id="catalog-orders" hidden></div>
    </div>
    <div class="orders-panel">
      <div class="orders-panel-head" data-toggle-promo>
        <span class="orders-fold-icon">▸</span>
        <span class="orders-panel-title">📢 推广明细</span>
        <span class="orders-panel-count">${(catalogCache.promoAnalysis && catalogCache.promoAnalysis.summary && catalogCache.promoAnalysis.summary.count) || 0}</span>
        <span class="orders-panel-hint">点击展开 / 收起</span>
      </div>
      <div class="orders-panel-body" id="catalog-promo" hidden></div>
    </div>
    <div class="orders-panel">
      <div class="orders-panel-head" data-toggle-lowstock>
        <span class="orders-fold-icon">▸</span>
        <span class="orders-panel-title">⚠️ 库存预警</span>
        <span class="orders-panel-count">${catalogCache.lowStock.length}</span>
        <span class="orders-panel-hint">库存 ≤ 10 的 SKU</span>
      </div>
      <div class="orders-panel-body" id="catalog-lowstock" hidden></div>
    </div>
    <div class="orders-panel">
      <div class="orders-panel-head" data-toggle-selection>
        <span class="orders-fold-icon">▸</span>
        <span class="orders-panel-title">🎯 选品联动</span>
        <span class="orders-panel-count">${(catalogCache.selection && catalogCache.selection.summary && catalogCache.selection.summary.with_data) || 0}</span>
        <span class="orders-panel-hint">销量/访问/毛利/库存/ROI 综合建议</span>
      </div>
      <div class="orders-panel-body" id="catalog-selection" hidden></div>
    </div>
    <div class="orders-panel">
      <div class="orders-panel-head" data-toggle-freight>
        <span class="orders-fold-icon">▸</span>
        <span class="orders-panel-title">🚚 运费分析</span>
        <span class="orders-panel-count">${(catalogCache.freight && catalogCache.freight.total) || 0}</span>
        <span class="orders-panel-hint">快递账单 + 订单匹配</span>
      </div>
      <div class="orders-panel-body" id="catalog-freight" hidden></div>
    </div>`;

  el.innerHTML = html;
  const s = $('#catalog-search');
  s.oninput = () => { catalogCache.filter = s.value.trim(); paintCatalog(); };

  // 商品访问明细折叠切换
  const geToggle = el.querySelector('[data-toggle-ge]');
  if (geToggle) {
    geToggle.onclick = () => {
      const ob = $('#catalog-ge');
      const icon = geToggle.querySelector('.orders-fold-icon');
      const willOpen = ob.hidden;
      ob.hidden = !willOpen;
      icon.textContent = willOpen ? '▾' : '▸';
    };
  }

  // 订单记录折叠切换
  const ordersToggle = el.querySelector('[data-toggle-orders]');
  if (ordersToggle) {
    ordersToggle.onclick = () => {
      const ob = $('#catalog-orders');
      const icon = ordersToggle.querySelector('.orders-fold-icon');
      const willOpen = ob.hidden;
      ob.hidden = !willOpen;
      icon.textContent = willOpen ? '▾' : '▸';
    };
  }

  // 经营分析店铺筛选
  const perfShopFilter = el.querySelector('[data-perf-shop]');
  if (perfShopFilter) {
    perfShopFilter.onchange = async () => {
      const sid = perfShopFilter.value;
      catalogCache.perfShop = sid ? parseInt(sid) : null;
      try {
        await reloadPerf();
      } catch (err) {
        toast(err.message);
      }
    };
  }

  // 经营分析订单状态筛选（多选 chips）
  const perfStatusBtns = el.querySelectorAll('[data-perf-status]');
  perfStatusBtns.forEach(btn => {
    btn.onclick = async () => {
      const st = btn.dataset.perfStatus;
      const cur = catalogCache.perfStatuses || [];
      if (st === '') {
        catalogCache.perfStatuses = []; // 全部 → 清空多选
      } else {
        const idx = cur.indexOf(st);
        if (idx >= 0) cur.splice(idx, 1); else cur.push(st);
        catalogCache.perfStatuses = cur;
      }
      try {
        await reloadPerf();
      } catch (err) {
        toast(err.message);
      }
    };
  });

  // 经营分析时间段快捷筛选（本周/上周/本月/上月/全部）
  const rangeBtns = el.querySelectorAll('[data-perf-range]');
  rangeBtns.forEach(btn => {
    btn.onclick = async () => {
      const key = btn.dataset.perfRange;
      catalogCache.perfPreset = key;
      const today = catalogCache.serverToday || new Date().toISOString().slice(0, 10);
      catalogCache.perfRange = rangeFor(key, today);
      try {
        await reloadPerf();
      } catch (err) {
        toast(err.message);
      }
    };
  });

  // 自定义日期段（起止日期输入）
  const perfStart = el.querySelector('[data-perf-start]');
  const perfEnd = el.querySelector('[data-perf-end]');
  if (perfStart && perfEnd) {
    const applyCustom = async () => {
      const s = perfStart.value;
      const e = perfEnd.value;
      if (s && e && s > e) { toast('起始日期不能晚于结束日期'); return; }
      if (!s && !e) { // 都清空 = 全部
        catalogCache.perfPreset = 'all';
        catalogCache.perfRange = null;
      } else {
        catalogCache.perfPreset = 'custom';
        catalogCache.perfRange = { start: s || undefined, end: e || undefined };
      }
      try {
        await reloadPerf();
      } catch (err) {
        toast(err.message);
      }
    };
    perfStart.onchange = applyCustom;
    perfEnd.onchange = applyCustom;
  }

  // 删除模式开关
  const deleteMode = el.querySelector('#delete-mode');
  if (deleteMode) {
    deleteMode.onchange = () => {
      catalogCache.deleteMode = deleteMode.checked;
      paintCatalog();
    };
  }

  // 订单字段文档按钮（stopPropagation 避免触发展开）
  const ordersDocBtn = el.querySelector('[data-orders-doc]');
  if (ordersDocBtn) {
    ordersDocBtn.onclick = (e) => {
      e.stopPropagation();
      showOrdersDoc();
    };
  }

  // 订单导入按钮（stopPropagation 避免触发展开）
  const ordersImportBtn = el.querySelector('[data-orders-import]');
  if (ordersImportBtn) {
    ordersImportBtn.onclick = (e) => {
      e.stopPropagation();
      showImportDialog('orders');
    };
  }

  // 日趋势折叠切换
  const dailyToggle = el.querySelector('[data-toggle-daily]');
  if (dailyToggle) {
    dailyToggle.onclick = () => {
      const rest = el.querySelector('.daily-rest');
      if (!rest) return;
      const willOpen = rest.hidden;
      rest.hidden = !willOpen;
      dailyToggle.textContent = willOpen ? '收起 ▴' : `展开其余 ${dailyToggle.dataset.count || ''} 天 ▾`;
    };
  }

  // 商品销量 TOP 折叠切换
  const topToggle = el.querySelector('[data-toggle-top]');
  if (topToggle) {
    topToggle.onclick = () => {
      const rest = el.querySelector('.top-rest');
      if (!rest) return;
      const willOpen = rest.hidden;
      rest.hidden = !willOpen;
      topToggle.textContent = willOpen ? '收起 ▴' : `展开其余 ${topToggle.dataset.count || ''} 个商品 ▾`;
    };
  }

  // 推广明细折叠切换 + 渲染
  const promoToggle = el.querySelector('[data-toggle-promo]');
  const promoEl = $('#catalog-promo');
  if (promoToggle && promoEl) {
    promoToggle.onclick = () => {
      const willOpen = promoEl.hidden;
      promoEl.hidden = !willOpen;
      promoToggle.querySelector('.orders-fold-icon').textContent = willOpen ? '▾' : '▸';
    };
    const pa = catalogCache.promoAnalysis;
    if (pa && pa.summary && pa.summary.count > 0) {
      const sm = pa.summary;
      const top = pa.top_roi || [];
      const promoByPlatform = groupByPlatform(top, r => r.shop_id || 0);
      promoEl.innerHTML = `
        <div class="perf-summary" style="margin-bottom:14px">
          <div class="perf-card"><div class="p-label">推广计划</div><div class="p-value">${sm.count}</div></div>
          <div class="perf-card"><div class="p-label">总花费</div><div class="p-value">¥${fmt(sm.total_spend)}</div></div>
          <div class="perf-card"><div class="p-label">成交额</div><div class="p-value">¥${fmt(sm.amt)}</div></div>
          <div class="perf-card"><div class="p-label">平均ROI</div><div class="p-value">${sm.avg_roi != null ? sm.avg_roi : '—'}</div></div>
          <div class="perf-card"><div class="p-label">曝光/点击</div><div class="p-value">${sm.impressions}/${sm.clicks}</div></div>
        </div>
        ${Object.entries(promoByPlatform).map(([pname, shops]) => `
        <div class="orders-platform">
          <div class="orders-platform-head"><h4>🛒 ${esc(pname)}</h4></div>
          ${shops.map(sg => `
            <div class="orders-shop">
              <div class="orders-shop-head" data-toggle-order-shop>
                <span class="orders-shop-fold">▸</span>
                <h5>🏪 ${esc(sg.shop)} <span class="badge">${sg.rows.length} 条</span></h5>
              </div>
              <div class="orders-shop-body" hidden>
                <div class="table-wrap"><table>
                  <thead><tr><th>商品</th><th>花费</th><th>成交额</th><th>ROI</th><th>成交笔数</th><th>曝光</th><th>点击</th></tr></thead>
                  <tbody>${sg.rows.map(r => `
                    <tr>
                      <td title="${esc(r.product_name)}">${esc((r.product_name || '').slice(0, 16))}${(r.product_name || '').length > 16 ? '…' : ''}</td>
                      <td>¥${fmt(r.total_spend)}</td>
                      <td>¥${fmt(r.amt)}</td>
                      <td>${r.roi != null ? r.roi : '—'}</td>
                      <td>${r.deals}</td>
                      <td>${r.imp}</td>
                      <td>${r.clk}</td>
                    </tr>`).join('')}
                  </tbody></table></div>
              </div>
            </div>`).join('')}
        </div>`).join('')}`;
      // 推广明细内店铺折叠切换
      promoEl.querySelectorAll('[data-toggle-order-shop]').forEach(t => {
        t.onclick = () => {
          const shop = t.closest('.orders-shop');
          const body = shop.querySelector('.orders-shop-body');
          const icon = t.querySelector('.orders-shop-fold');
          const willOpen = body.hidden;
          body.hidden = !willOpen;
          icon.textContent = willOpen ? '▾' : '▸';
        };
      });
    } else {
      promoEl.innerHTML = '<div class="empty">暂无推广数据，点「⬆ 导入」导入推广 CSV</div>';
    }
  }

  // 库存预警折叠切换 + 渲染
  const lowToggle = el.querySelector('[data-toggle-lowstock]');
  const lowEl = $('#catalog-lowstock');
  if (lowToggle && lowEl) {
    lowToggle.onclick = () => {
      const willOpen = lowEl.hidden;
      lowEl.hidden = !willOpen;
      lowToggle.querySelector('.orders-fold-icon').textContent = willOpen ? '▾' : '▸';
    };
    const low = catalogCache.lowStock || [];
    if (!low.length) {
      lowEl.innerHTML = '<div class="empty">暂无低库存 SKU（库存 ≤ 10）</div>';
    } else {
      const lowByPlatform = groupByPlatform(low, r => r.shop_id || 0);
      lowEl.innerHTML = Object.entries(lowByPlatform).map(([pname, shops]) => `
        <div class="orders-platform">
          <div class="orders-platform-head"><h4>🛒 ${esc(pname)}</h4></div>
          ${shops.map(sg => `
            <div class="orders-shop">
              <div class="orders-shop-head" data-toggle-order-shop>
                <span class="orders-shop-fold">▸</span>
                <h5>🏪 ${esc(sg.shop)} <span class="badge">${sg.rows.length} 条</span></h5>
              </div>
              <div class="orders-shop-body" hidden>
                <div class="table-wrap"><table>
                  <thead><tr><th>商品</th><th>货号</th><th>规格</th><th>库存</th></tr></thead>
                  <tbody>${sg.rows.map(r => `
                    <tr>
                      <td title="${esc(r.name)}">${esc((r.name || '').slice(0, 16))}${(r.name || '').length > 16 ? '…' : ''}</td>
                      <td>${esc(r.code || '')}</td>
                      <td>${esc(r.spec_name || '')}</td>
                      <td><span class="stock-low">${r.stock}</span></td>
                    </tr>`).join('')}
                  </tbody></table></div>
              </div>
            </div>`).join('')}
        </div>`).join('');
      // 库存预警内店铺折叠切换
      lowEl.querySelectorAll('[data-toggle-order-shop]').forEach(t => {
        t.onclick = () => {
          const shop = t.closest('.orders-shop');
          const body = shop.querySelector('.orders-shop-body');
          const icon = t.querySelector('.orders-shop-fold');
          const willOpen = body.hidden;
          body.hidden = !willOpen;
          icon.textContent = willOpen ? '▾' : '▸';
        };
      });
    }
  }

  // 选品联动折叠切换 + 渲染
  const selToggle = el.querySelector('[data-toggle-selection]');
  const selEl = $('#catalog-selection');
  if (selToggle && selEl) {
    selToggle.onclick = () => {
      const willOpen = selEl.hidden;
      selEl.hidden = !willOpen;
      selToggle.querySelector('.orders-fold-icon').textContent = willOpen ? '▾' : '▸';
    };
    const sel = catalogCache.selection;
    const items = (sel && sel.items) || [];
    const summary = (sel && sel.summary) || {};
    if (!items.length) {
      selEl.innerHTML = '<div class="empty">暂无联动数据。有成交/访问/推广/成本任一数据后自动生成选品建议。</div>';
    } else {
      const labelBadge = {
        '主力爆款': 'sel-label sel-main',
        '潜力款': 'sel-label sel-potential',
        '滞销清仓': 'sel-label sel-slow',
        '亏损止损': 'sel-label sel-loss',
        '观察': 'sel-label sel-watch',
      };
      const labels = Object.entries(summary.labels || {}).map(([k, v]) =>
        `<span class="${labelBadge[k] || 'sel-label'}">${esc(k)} ${v}</span>`).join(' ');
      const selByPlatform = groupByPlatform(items, r => r.shop_id || 0);
      const selTable = rows => `
        <div class="table-wrap"><table>
          <thead><tr><th>商品</th><th>建议</th><th>成交</th><th>毛利</th><th>访问</th><th>ROI</th><th>原因</th></tr></thead>
          <tbody>${rows.map(r => `
            <tr>
              <td title="${esc(r.name)}">${esc((r.name || '').slice(0, 14))}${(r.name || '').length > 14 ? '…' : ''}${r.code ? ' <em>' + esc(r.code) + '</em>' : ''}</td>
              <td><span class="${labelBadge[r.label] || 'sel-label'}">${esc(r.label)}</span></td>
              <td>${r.orders}单</td>
              <td>${r.margin != null ? r.margin + '%' : '—'}</td>
              <td>${r.uv}</td>
              <td>${r.roi != null ? r.roi : '—'}</td>
              <td class="sel-reason">${esc(r.reason)}</td>
            </tr>`).join('')}
          </tbody></table></div>`;
      selEl.innerHTML = `
        <div class="sel-summary">${labels}</div>
        ${Object.entries(selByPlatform).map(([pname, shops]) => `
        <div class="orders-platform">
          <div class="orders-platform-head"><h4>🛒 ${esc(pname)}</h4></div>
          ${shops.map(sg => `
            <div class="orders-shop">
              <div class="orders-shop-head" data-toggle-order-shop>
                <span class="orders-shop-fold">▸</span>
                <h5>🏪 ${esc(sg.shop)} <span class="badge">${sg.rows.length} 条</span></h5>
              </div>
              <div class="orders-shop-body" hidden>${selTable(sg.rows)}</div>
            </div>`).join('')}
        </div>`).join('')}`;
      // 选品联动内店铺折叠切换
      selEl.querySelectorAll('[data-toggle-order-shop]').forEach(t => {
        t.onclick = () => {
          const shop = t.closest('.orders-shop');
          const body = shop.querySelector('.orders-shop-body');
          const icon = t.querySelector('.orders-shop-fold');
          const willOpen = body.hidden;
          body.hidden = !willOpen;
          icon.textContent = willOpen ? '▾' : '▸';
        };
      });
    }
  }

  // 运费分析折叠切换 + 渲染
  const freightToggle = el.querySelector('[data-toggle-freight]');
  const freightEl = $('#catalog-freight');
  if (freightToggle && freightEl) {
    freightToggle.onclick = () => {
      const willOpen = freightEl.hidden;
      freightEl.hidden = !willOpen;
      freightToggle.querySelector('.orders-fold-icon').textContent = willOpen ? '▾' : '▸';
    };
    renderFreightPanel(freightEl);
  }

  const body = $('#catalog-body');
  let bodyHtml = '';
  const mc = catalogCache.modCounts || {};
  const badge = k => { const n = mc[k] || 0; return `<span class="mod-badge" data-badge="${k}" ${n > 0 ? '' : 'style="display:none"'}>${n}</span>`; };
  bodyHtml += `<div class="catalog-toolbar">
    <button class="btn primary sm" data-add-platform>＋ 新增平台</button>
    <span class="catalog-export-group">
      <button class="btn sm" data-modify="title" title="导出批量修改标题模板">📝 改标题${badge('title')}</button>
      <button class="btn sm" data-modify="price" title="导出批量修改价格模板">💰 改价格${badge('price')}</button>
      <button class="btn sm" data-modify="stock" title="导出批量修改库存模板">📦 改库存${badge('stock')}</button>
      <button class="btn sm" data-modify="code" title="导出批量修改商品编码模板">🔢 改编码${badge('code')}</button>
      <button class="btn sm" data-modify-doc title="查看批量修改模板说明文档">📄 文档</button>
      <button class="btn sm" data-mod-list title="查看/管理已记录的修改">📝 修改记录(${catalogCache.mods.length})</button>
    </span>
    <span class="catalog-export-group">
      <button class="btn sm" data-export="products" title="导出商品列表 CSV">⬇ 商品表</button>
      <button class="btn sm" data-export="skus" title="导出 SKU 价格库存 CSV">⬇ SKU表</button>
      <button class="btn sm" data-export="orders" title="导出订单 CSV">⬇ 订单</button>
      <button class="btn sm" data-export="promotions" title="导出推广 CSV">⬇ 推广</button>
      <button class="btn sm primary" data-import title="导入 CSV（商品/SKU/订单/推广）">⬆ 导入</button>
    </span>
  </div>`;
  for (const pl of tree) {
    bodyHtml += `<div class="catalog-platform">
      <div class="catalog-platform-head">
        <h3>🛒 ${esc(pl.name)}</h3>
        <div class="catalog-head-actions">
          <button class="btn sm" data-add-shop="${pl.id}" title="新增店铺">＋店铺</button>
          <button class="btn sm" data-rename-platform="${pl.id}" title="重命名平台">✏️</button>
          ${catalogCache.deleteMode ? `<button class="btn sm danger" data-del-platform="${pl.id}" title="删除平台">🗑️</button>` : ''}
        </div>
      </div>`;
    for (const sh of (pl.shops || [])) {
      const products = (sh.products || []).filter(p =>
        !f || (p.name || '').toLowerCase().includes(f)
        || (p.platform_product_id || '').toLowerCase().includes(f)
        || (p.code || '').toLowerCase().includes(f));
      bodyHtml += `<div class="catalog-shop">
        <div class="catalog-shop-head">
          <div class="catalog-shop-toggle" data-toggle-shop="${sh.id}">
            <span class="catalog-fold-icon">▸</span>
            <h4>🏪 ${esc(sh.name)} <span class="badge">${products.length} 商品</span></h4>
          </div>
          <div class="catalog-head-actions">
            <button class="btn sm" data-rename-shop="${sh.id}" title="重命名店铺">✏️</button>
            ${catalogCache.deleteMode ? `<button class="btn sm danger" data-del-shop="${sh.id}" title="删除店铺">🗑️</button>` : ''}
          </div>
        </div>
        <div class="catalog-shop-body" hidden>
          <div class="catalog-product-list">`;
      for (const p of products) {
        const pm = modMap[p.platform_product_id] || {};
        const curName = pm.title != null ? pm.title : p.name;
        const curCode = pm.code != null ? pm.code : (p.code || '');
        const cost = p.cost_price != null ? p.cost_price : null;
        const minPrice = p.min_price != null ? p.min_price : null;
        const marginPct = (cost != null && minPrice != null && minPrice > 0) ? ((minPrice - cost) / minPrice * 100) : null;
        const codeHtml = pm.code != null
          ? `<span class="mod-new" title="待处理新编码">${esc(pm.code)}</span>`
          : esc(p.code || '无货号');
        const nameHtml = pm.title != null
          ? `<span class="mod-new" title="待处理新标题：${esc(pm.title)}">${esc(pm.title)}</span>`
          : esc(p.name);
        const statusHtml = p.status
          ? `<span class="prod-status status-${esc(p.status)}" data-status="${esc(p.status)}">${esc(p.status)}</span>`
          : `<span class="prod-status status-none" data-status="">未标状态</span>`;
        bodyHtml += `
            <div class="catalog-prod-row" data-pid="${p.id}" data-shop="${sh.id}" data-ppid="${esc(p.platform_product_id)}">
              <div class="catalog-prod-main">
                ${statusHtml}
                <span class="prod-code ${curCode ? '' : 'prod-code-empty'}">${codeHtml}</span>
                <span class="prod-name" title="${esc(curName)}">${nameHtml}</span>
                <span class="prod-id">${esc(p.platform_product_id)}</span>
                <span class="prod-sku-count"><span class="tag blue">${p.sku_count} SKU</span></span>
                ${cost != null ? `<span class="prod-cost" title="成本价">成本 ¥${fmt(cost)}</span>` : ''}
                ${marginPct != null ? `<span class="prod-margin ${marginPct < 0 ? 'neg' : ''}" title="毛利率 =（售价-成本）/售价">毛利 ${fmt(marginPct, 1)}%</span>` : ''}
                <span class="catalog-prod-actions">
                  <button class="btn xs" data-cost="${p.id}" data-ppid="${esc(p.platform_product_id)}" data-shop="${sh.id}" data-costval="${cost ?? ''}" title="设置成本价">💰成本</button>
                  <button class="btn xs" data-status-btn="${p.id}" data-ppid="${esc(p.platform_product_id)}" data-shop="${sh.id}" data-curstatus="${esc(p.status || '')}" title="设置商品状态">🏷️状态</button>
                  <button class="btn xs" data-mod-title="${p.id}" data-name="${esc(curName)}" title="修改标题">✏️标题</button>
                  <button class="btn xs" data-mod-code="${p.id}" data-code="${esc(curCode)}" title="修改商品编码">🔢编码</button>
                </span>
              </div>
              <div class="catalog-sku-list" hidden></div>
            </div>`;
      }
      bodyHtml += `</div></div></div>`;
    }
    bodyHtml += `</div>`;
  }
  body.innerHTML = bodyHtml || '<div class="empty">无匹配商品</div>';

  // ---- 平台/店铺增删改 ----
  const reload = () => renderCatalog();
  const allShops = () => tree.flatMap(x => x.shops || []);

  const addPlatformBtn = body.querySelector('[data-add-platform]');
  if (addPlatformBtn) addPlatformBtn.onclick = async () => {
    const r = await promptDialog([
      { key: 'code', label: '平台代码（英文，如 taobao）', placeholder: 'taobao' },
      { key: 'name', label: '平台名称（如 淘宝）', placeholder: '淘宝' },
    ], { title: '新增平台' });
    if (!r || !r.code || !r.name) return;
    try { await api('/api/catalog/platforms', 'POST', { code: r.code, name: r.name }); toast('平台已新增'); reload(); }
    catch (err) { toast(err.message); }
  };

  // CSV 导入弹窗
  const importBtn = body.querySelector('[data-import]');
  if (importBtn) importBtn.onclick = () => showImportDialog();

  // 批量修改模板导出按钮（有待处理修改时弹出操作面板）
  body.querySelectorAll('[data-modify]').forEach(b => b.onclick = () => {
    const key = b.dataset.modify;
    const n = (catalogCache.modCounts || {})[key] || 0;
    if (n > 0) showModifyAction(key, n);
    else toast('暂无待处理的修改');
  });

  // 批量修改模板说明文档弹窗
  const docBtn = body.querySelector('[data-modify-doc]');
  if (docBtn) docBtn.onclick = () => showModifyDoc();

  // 修改记录管理弹窗
  const modListBtn = body.querySelector('[data-mod-list]');
  if (modListBtn) modListBtn.onclick = () => showModList();

  // 商品行「改标题/改编码」按钮（stopPropagation 避免触发展开 SKU）
  body.querySelectorAll('[data-mod-title]').forEach(btn => btn.onclick = async (e) => {
    e.stopPropagation();
    const row = btn.closest('.catalog-prod-row');
    const shopId = row.dataset.shop;
    const ppid = row.dataset.ppid;
    const cur = btn.dataset.name;
    const r = await promptDialog([{ key: 'v', label: '新标题', value: cur, placeholder: '输入新标题' }], { title: '修改标题', confirmText: '保存' });
    if (!r || r.v === '' || r.v === cur) return;
    try {
      await api('/api/catalog/modifications', 'POST', { shop_id: parseInt(shopId), platform_product_id: ppid, field: 'title', new_value: r.v });
      toast('已记录标题修改'); refreshModsCount();
    } catch (err) { toast(err.message); }
  });

  body.querySelectorAll('[data-mod-code]').forEach(btn => btn.onclick = async (e) => {
    e.stopPropagation();
    const row = btn.closest('.catalog-prod-row');
    const shopId = row.dataset.shop;
    const ppid = row.dataset.ppid;
    const cur = btn.dataset.code;
    const r = await promptDialog([{ key: 'v', label: '新商品编码', value: cur, placeholder: '输入新编码' }], { title: '修改商品编码', confirmText: '保存' });
    if (!r || r.v === '' || r.v === cur) return;
    try {
      await api('/api/catalog/modifications', 'POST', { shop_id: parseInt(shopId), platform_product_id: ppid, field: 'code', new_value: r.v });
      toast('已记录编码修改'); refreshModsCount();
    } catch (err) { toast(err.message); }
  });

  // 成本价（本地字段，直接改库，不进修改记录）
  body.querySelectorAll('[data-cost]').forEach(btn => btn.onclick = async (e) => {
    e.stopPropagation();
    const shopId = btn.dataset.shop;
    const ppid = btn.dataset.ppid;
    const cur = btn.dataset.costval;
    const r = await promptDialog([{ key: 'v', label: '成本价（元，留空清空）', value: cur, placeholder: '如 12.50' }], { title: '设置成本价', confirmText: '保存' });
    if (!r) return;
    const val = r.v === '' ? null : parseFloat(r.v);
    if (r.v !== '' && isNaN(val)) { toast('成本价需为数字'); return; }
    try {
      await api('/api/catalog/product/cost', 'POST', { shop_id: parseInt(shopId), platform_product_id: ppid, cost_price: val });
      toast(val == null ? '已清空成本价' : `成本价已设为 ¥${fmt(val)}`);
      renderCatalog();
    } catch (err) { toast(err.message); }
  });

  // 商品状态标签（本地维护，6 选 1，可清除）
  const STATUS_OPTIONS = ['在售', '下架', '售罄', '清仓', '新品', '停推'];
  body.querySelectorAll('[data-status-btn]').forEach(btn => btn.onclick = async (e) => {
    e.stopPropagation();
    const shopId = btn.dataset.shop;
    const ppid = btn.dataset.ppid;
    const cur = btn.dataset.curstatus;
    const options = [
      { value: '', label: '（清除标签）' },
      ...STATUS_OPTIONS.map(s => ({ value: s, label: `${s}${s === cur ? '（当前）' : ''}` })),
    ];
    const r = await promptDialog([{ key: 'status', label: '商品状态', type: 'select', value: cur, options }], { title: '设置商品状态', confirmText: '保存' });
    if (!r) return;
    const val = r.status || '';
    try {
      await api('/api/catalog/product/status', 'POST', { shop_id: parseInt(shopId), platform_product_id: ppid, status: val });
      toast(val ? `状态已设为「${val}」` : '已清除状态标签');
      renderCatalog();
    } catch (err) { toast(err.message); }
  });

  // 导出按钮
  body.querySelectorAll('[data-export]').forEach(b => b.onclick = () => {
    window.open(BASE + `/api/catalog/export?type=${b.dataset.export}`, '_blank');
  });

  body.querySelectorAll('[data-add-shop]').forEach(b => b.onclick = async () => {
    const r = await promptDialog([{ key: 'name', label: '店铺名称', placeholder: '如 欧世艺' }], { title: '新增店铺' });
    if (!r || !r.name) return;
    try { await api('/api/catalog/shops', 'POST', { platform_id: parseInt(b.dataset.addShop), name: r.name }); toast('店铺已新增'); reload(); }
    catch (err) { toast(err.message); }
  });

  body.querySelectorAll('[data-rename-platform]').forEach(b => b.onclick = async () => {
    const pl = tree.find(x => x.id === parseInt(b.dataset.renamePlatform));
    const r = await promptDialog([{ key: 'name', label: '新名称', value: pl?.name || '' }], { title: '重命名平台' });
    if (!r || !r.name) return;
    try { await api(`/api/catalog/platforms/${b.dataset.renamePlatform}`, 'PUT', { name: r.name }); toast('已重命名'); reload(); }
    catch (err) { toast(err.message); }
  });

  body.querySelectorAll('[data-rename-shop]').forEach(b => b.onclick = async () => {
    const sh = allShops().find(s => s.id === parseInt(b.dataset.renameShop));
    const r = await promptDialog([{ key: 'name', label: '新名称', value: sh?.name || '' }], { title: '重命名店铺' });
    if (!r || !r.name) return;
    try { await api(`/api/catalog/shops/${b.dataset.renameShop}`, 'PUT', { name: r.name }); toast('已重命名'); reload(); }
    catch (err) { toast(err.message); }
  });

  body.querySelectorAll('[data-del-platform]').forEach(b => b.onclick = async () => {
    const pl = tree.find(x => x.id === parseInt(b.dataset.delPlatform));
    const ok = await confirmDialog(`删除平台「<b>${esc(pl?.name)}</b>」将<b>级联删除</b>其下所有店铺、商品、SKU、订单、推广数据，且不可恢复！确定删除吗？`, { title: '删除平台', confirmText: '确认删除' });
    if (!ok) return;
    try { const r = await api(`/api/catalog/platforms/${b.dataset.delPlatform}`, 'DELETE'); toast(`已删除：${r.shops}店铺 ${r.products}商品 ${r.skus}SKU`); reload(); }
    catch (err) { toast(err.message); }
  });

  body.querySelectorAll('[data-del-shop]').forEach(b => b.onclick = async () => {
    const sh = allShops().find(s => s.id === parseInt(b.dataset.delShop));
    const n = sh?.products?.length || 0;
    const ok = await confirmDialog(`删除店铺「<b>${esc(sh?.name)}</b>」将<b>级联删除</b>其下 ${n} 个商品及其 SKU、订单、推广数据，且不可恢复！确定删除吗？`, { title: '删除店铺', confirmText: '确认删除' });
    if (!ok) return;
    try { const r = await api(`/api/catalog/shops/${b.dataset.delShop}`, 'DELETE'); toast(`已删除：${r.products}商品 ${r.skus}SKU`); reload(); }
    catch (err) { toast(err.message); }
  });

  // 店铺折叠切换
  body.querySelectorAll('[data-toggle-shop]').forEach(t => t.onclick = () => {
    const shopDiv = t.closest('.catalog-shop');
    const shopBody = shopDiv.querySelector('.catalog-shop-body');
    const icon = t.querySelector('.catalog-fold-icon');
    const willOpen = shopBody.hidden;
    shopBody.hidden = !willOpen;
    icon.textContent = willOpen ? '▾' : '▸';
  });

  // 点击商品行展开 SKU
  body.querySelectorAll('.catalog-prod-main').forEach(main => {
    main.onclick = async () => {
      const row = main.parentElement;
      const list = row.querySelector('.catalog-sku-list');
      if (!list.hidden) { list.hidden = true; return; }
      list.hidden = false;
      list.innerHTML = '<div class="catalog-sku-loading">SKU 加载中…</div>';
      try {
        const shopId = row.dataset.shop;
        const ppid = row.dataset.ppid;
        const r = await api(`/api/catalog/skus?product_id=${row.dataset.pid}`);
        const skus = r.items || [];
        list.innerHTML = skus.length
          ? skus.map(sku => {
              const sm = modMap[`${ppid}|${sku.platform_sku_id}`] || {};
              const danHtml = sm.dan_price != null ? `<span class="mod-new">${esc(sm.dan_price)}</span>` : (sku.dan_price != null ? fmt(sku.dan_price) : '<i class="muted">未填</i>');
              const pinHtml = sm.pin_price != null ? `<span class="mod-new">${esc(sm.pin_price)}</span>` : (sku.pin_price != null ? fmt(sku.pin_price) : '<i class="muted">未填</i>');
              const stockNew = sm.stock != null ? (String(sm.stock).startsWith('-') ? sm.stock : '+' + sm.stock) : null;
              const stockHtml = stockNew != null ? `<span class="mod-new">${esc(stockNew)}</span>` : (sku.stock != null ? sku.stock : '<i class="muted">未填</i>');
              return `
              <div class="sku-row">
                <span class="sku-name">${esc(sku.spec_name || '—')}</span>
                <span class="tag gray">${esc(sku.spec_code || '')}</span>
                <span class="sku-price">单买价 ${danHtml}</span>
                <span class="sku-price">拼单价 ${pinHtml}</span>
                <span class="sku-price">库存 ${stockHtml}</span>
                <span class="sku-actions">
                  <button class="btn xs" data-sku-price="${esc(sku.platform_sku_id)}" data-dan="${esc(sm.dan_price ?? sku.dan_price ?? '')}" data-pin="${esc(sm.pin_price ?? sku.pin_price ?? '')}" data-spec="${esc(sku.spec_name || '')}" title="修改价格">💰改价</button>
                  <button class="btn xs" data-sku-stock="${esc(sku.platform_sku_id)}" data-stock="${sku.stock ?? ''}" data-spec="${esc(sku.spec_name || '')}" title="修改库存">📦改库存</button>
                </span>
              </div>`;
            }).join('')
          : '<div class="empty">无 SKU</div>';

        // SKU 改价（单买价 + 拼单价，可只填其一）
        list.querySelectorAll('[data-sku-price]').forEach(btn => btn.onclick = async (e) => {
          e.stopPropagation();
          const skuid = btn.dataset.skuPrice;
          const spec = btn.dataset.spec;
          const r2 = await promptDialog([
            { key: 'dan', label: `单买价（当前 ${btn.dataset.dan || '未填'}）`, value: btn.dataset.dan, placeholder: '新单买价，留空不改' },
            { key: 'pin', label: `拼单价（当前 ${btn.dataset.pin || '未填'}）`, value: btn.dataset.pin, placeholder: '新拼单价，留空不改' },
          ], { title: `改价：${spec}`, confirmText: '保存' });
          if (!r2 || (r2.dan === '' && r2.pin === '')) return;
          const dan = r2.dan === '' ? null : parseFloat(r2.dan);
          const pin = r2.pin === '' ? null : parseFloat(r2.pin);
          if ((dan !== null && isNaN(dan)) || (pin !== null && isNaN(pin))) { toast('价格需为数字'); return; }
          if (dan !== null && pin !== null && !(pin <= dan - 1)) { toast('拼单价需比单买价低至少 1 元'); return; }
          try {
            if (dan !== null) await api('/api/catalog/modifications', 'POST', { shop_id: parseInt(shopId), platform_product_id: ppid, platform_sku_id: skuid, field: 'dan_price', new_value: String(dan) });
            if (pin !== null) await api('/api/catalog/modifications', 'POST', { shop_id: parseInt(shopId), platform_product_id: ppid, platform_sku_id: skuid, field: 'pin_price', new_value: String(pin) });
            toast('已记录价格修改'); refreshModsCount();
          } catch (err) { toast(err.message); }
        });

        // SKU 改库存（增减值：增填正/减填负）
        list.querySelectorAll('[data-sku-stock]').forEach(btn => btn.onclick = async (e) => {
          e.stopPropagation();
          const skuid = btn.dataset.skuStock;
          const spec = btn.dataset.spec;
          const r2 = await promptDialog([
            { key: 'v', label: `库存增减（当前库存 ${btn.dataset.stock || '未填'}）`, value: '', placeholder: '增填正整数 / 减填负整数，如 10 或 -10' },
          ], { title: `改库存：${spec}`, confirmText: '保存' });
          if (!r2 || r2.v === '') return;
          const val = parseInt(r2.v);
          if (isNaN(val)) { toast('库存增减需为整数'); return; }
          try {
            await api('/api/catalog/modifications', 'POST', { shop_id: parseInt(shopId), platform_product_id: ppid, platform_sku_id: skuid, field: 'stock', new_value: String(val) });
            toast('已记录库存修改'); refreshModsCount();
          } catch (err) { toast(err.message); }
        });
      } catch (err) {
        list.innerHTML = `<div class="empty">❌ ${esc(err.message)}</div>`;
      }
    };
  });

  // 商品访问明细（拼多多商品数据·商品明细）
  const geTable = $('#catalog-ge-table');
  if (geTable) {
    const allGe = catalogCache.goodsEffect || [];
    // 以数据内最大日期为"今日"参照（不依赖浏览器时间）
    const maxDate = allGe.reduce((m, g) => (g.stat_date && g.stat_date > m) ? g.stat_date : m, '');
    const shiftDate = (ds, n) => {
      if (!ds) return '';
      const [y, mo, d] = ds.split('-').map(Number);
      const dt = new Date(y, mo - 1, d + n);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    };
    const matchGe = (ds) => {
      const f = catalogCache.geFilter || 'all';
      if (f === 'all') return true;
      if (!ds) return false;
      if (f === 'today') return ds === maxDate;
      if (f === 'yesterday') return ds === shiftDate(maxDate, -1);
      if (f === '7d') return ds >= shiftDate(maxDate, -6);
      if (f === '30d') return ds >= shiftDate(maxDate, -29);
      return true;
    };
    const renderGe = () => {
      const ge = allGe.filter(g => matchGe(g.stat_date));
      if (!ge.length) {
        geTable.innerHTML = '<div class="empty">该日期范围暂无数据，点「🔄 采集最新数据」获取</div>';
        return;
      }
      const geByPlatform = groupByPlatform(ge, g => g.shop_id || 0);
      geTable.innerHTML = Object.entries(geByPlatform).map(([pname, shops]) => `
        <div class="orders-platform">
          <div class="orders-platform-head"><h4>🛒 ${esc(pname)}</h4></div>
          ${shops.map(sg => `
            <div class="orders-shop">
              <div class="orders-shop-head" data-toggle-order-shop>
                <span class="orders-shop-fold">▸</span>
                <h5>🏪 ${esc(sg.shop)} <span class="badge">${sg.rows.length} 条</span></h5>
              </div>
              <div class="orders-shop-body" hidden>
                <div class="table-wrap"><table>
                  <thead><tr><th>商品</th><th>访客数</th><th>浏览量</th><th>成交金额</th><th>订单数</th><th>买家数</th><th>转化率</th><th>收藏数</th><th>日期</th></tr></thead>
                  <tbody>${sg.rows.map(g => {
                    const name = g.goods_name || '';
                    return `
                    <tr>
                      <td title="${esc(name)}">${esc(name.slice(0, 22))}${name.length > 22 ? '…' : ''}</td>
                      <td>${g.goods_uv != null ? g.goods_uv : '—'}</td>
                      <td>${g.goods_pv != null ? g.goods_pv : '—'}</td>
                      <td>${g.pay_ordr_amt != null ? '¥' + fmt(g.pay_ordr_amt) : '—'}</td>
                      <td>${g.pay_ordr_cnt != null ? g.pay_ordr_cnt : '—'}</td>
                      <td>${g.pay_ordr_usr_cnt != null ? g.pay_ordr_usr_cnt : '—'}</td>
                      <td>${g.goods_vcr != null ? fmt(g.goods_vcr, 2) + '%' : '—'}</td>
                      <td>${g.goods_fav_cnt != null ? g.goods_fav_cnt : '—'}</td>
                      <td>${esc(g.stat_date || '')}</td>
                    </tr>`;
                  }).join('')}
                  </tbody></table></div>
              </div>
            </div>`).join('')}
        </div>`).join('');
      // 访问明细内店铺折叠切换
      geTable.querySelectorAll('[data-toggle-order-shop]').forEach(t => {
        t.onclick = () => {
          const shop = t.closest('.orders-shop');
          const body = shop.querySelector('.orders-shop-body');
          const icon = t.querySelector('.orders-shop-fold');
          const willOpen = body.hidden;
          body.hidden = !willOpen;
          icon.textContent = willOpen ? '▾' : '▸';
        };
      });
    };
    renderGe();

    // 日期筛选下拉（只重绘表格，不折叠面板）
    const geFilter = el.querySelector('#ge-date-filter');
    if (geFilter) {
      geFilter.value = catalogCache.geFilter || 'all';
      geFilter.onchange = () => {
        catalogCache.geFilter = geFilter.value;
        renderGe();
      };
    }

    const collectBtn = el.querySelector('[data-ge-collect]');
    if (collectBtn) {
      collectBtn.onclick = async () => {
        collectBtn.disabled = true;
        collectBtn.textContent = '⏳ 采集中…（约 30~60 秒）';
        try {
          const r = await api('/api/catalog/goods-effect/collect', 'POST');
          if (r.ok) toast(`采集成功，共 ${r.count} 条`);
          else toast('采集失败：' + (r.error || '未知'));
        } catch (err) { toast(err.message); }
        collectBtn.disabled = false;
        collectBtn.textContent = '🔄 采集最新数据';
        renderCatalog();
      };
    }
  }

  // 订单记录（按平台 + 店铺层级分组，含无订单的新店铺）
  const ordersEl = $('#catalog-orders');
  if (ordersEl) {
    // 按 shop_id 分组
    const byShop = {};
    for (const o of catalogCache.orders) {
      const sid = o.shop_id || 0;
      (byShop[sid] = byShop[sid] || []).push(o);
    }
    // 遍历所有平台+店铺（含无订单的新店铺），订单按 shop_id 归入
    const byPlatform = {};
    for (const pl of tree) {
      for (const sh of (pl.shops || [])) {
        (byPlatform[pl.name] = byPlatform[pl.name] || []).push({ shop: sh.name, orders: byShop[sh.id] || [] });
      }
    }
    // 有订单但 shop_id 不在 tree 里的（如未分类），补到「未分类」平台
    for (const [sid, os] of Object.entries(byShop)) {
      const known = shopList.some(s => String(s.id) === String(sid));
      if (!known && os.length) {
        (byPlatform['未分类'] = byPlatform['未分类'] || []).push({ shop: '未知店铺', orders: os });
      }
    }

    const orderTable = os => {
      const MAX = 100;
      const shown = os.slice(0, MAX);
      const more = os.length - MAX;
      return `
      ${more > 0 ? `<div class="orders-more">仅显示最近 ${MAX} 单，共 ${os.length} 单（用「⬇ 订单」导出全部）</div>` : ''}
      <div class="table-wrap"><table>
        <thead><tr><th>订单号</th><th>状态</th><th>商品规格</th><th>省</th><th>市</th><th>区</th><th>实付</th><th>实收</th><th>快递公司</th><th>快递单号</th><th>支付时间</th><th>售后</th></tr></thead>
        <tbody>${shown.map(o => `
          <tr>
            <td class="orders-no">${esc(o.order_no)}</td>
            <td>${esc(o.status)}</td>
            <td>${esc(o.spec)}</td>
            <td>${esc(o.province || '')}</td>
            <td>${esc(o.city || '')}</td>
            <td>${esc(o.district || '')}</td>
            <td>¥${fmt(o.buyer_amount)}</td>
            <td>¥${fmt(o.seller_amount)}</td>
            <td>${esc(o.courier || '')}</td>
            <td class="orders-no">${esc(o.tracking_no || '')}</td>
            <td>${esc(o.pay_time)}</td>
            <td>${esc(o.aftersale_status)}</td>
          </tr>`).join('')}
        </tbody></table></div>`;
      };

    ordersEl.innerHTML = Object.entries(byPlatform).map(([pname, shops]) => `
      <div class="orders-platform">
        <div class="orders-platform-head"><h4>🛒 ${esc(pname)}</h4></div>
        ${shops.map(sg => `
          <div class="orders-shop">
            <div class="orders-shop-head" data-toggle-order-shop>
              <span class="orders-shop-fold">▸</span>
              <h5>🏪 ${esc(sg.shop)} <span class="badge">${sg.orders.length} 单</span></h5>
            </div>
            <div class="orders-shop-body" hidden>
              ${sg.orders.length ? orderTable(sg.orders) : '<div class="empty">暂无订单</div>'}
            </div>
          </div>`).join('')}
      </div>`).join('');

    // 订单记录内各店铺折叠切换
    ordersEl.querySelectorAll('[data-toggle-order-shop]').forEach(t => {
      t.onclick = () => {
        const shop = t.closest('.orders-shop');
        const body = shop.querySelector('.orders-shop-body');
        const icon = t.querySelector('.orders-shop-fold');
        const willOpen = body.hidden;
        body.hidden = !willOpen;
        icon.textContent = willOpen ? '▾' : '▸';
      };
    });
  }
}

/* ---------------- 知识库 ---------------- */
function renderKnowledge() {
  const cats = [...new Set(state.knowledge.map(k=>k.category))];
  const filter = (cat='all') => {
    if (cat==='all') return state.knowledge.map(kc);
    return state.knowledge.filter(k=>k.category===cat).map(kc);
  };
  const kc = k => `
    <div class="k-card">
      <div class="cat">${esc(k.category)}</div>
      <h3>${esc(k.title)}</h3>
      <p>${esc(k.summary)}</p>
      <ul>${k.points.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
      <div class="k-sop"><b>SOP：</b>${esc(k.sop)}</div>
    </div>`;
  $('#view-knowledge').innerHTML = `
    <div class="callout">以下方法已剔除刷单、改销量、异常 SKU 价格、规避比价等高风险动作，只保留长期可持续的合规运营路径。</div>
    <div class="tabs">
      <button class="tab active" data-cat="all">全部</button>
      ${cats.map(c=>`<button class="tab" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>
    <div class="card-grid" id="knowledge-grid">${filter('all').join('')}</div>`;
  $$('#view-knowledge .tab').forEach(t => t.onclick = () => {
    $$('#view-knowledge .tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    $('#knowledge-grid').innerHTML = filter(t.dataset.cat).join('');
  });
}

/* ---------------- 选品日历 ---------------- */
function renderCalendar() {
  const months = [...new Set(state.calendar.map(c=>c.month))];
  const m = month => {
    const nodes = state.calendar.filter(c=>c.month===month);
    return `<div class="month-col"><h3>${esc(month)}</h3>${nodes.map(n=>`<div class="node"><b>${esc(n.node)}</b><span>${esc(n.categories)}</span></div>`).join('')}</div>`;
  };
  $('#view-calendar').innerHTML = `
    <div class="callout">节点商品要提前 2-4 周上架并做基础内功，爆发前一周再加大预算；不要等节日当天才开始上链接。</div>
    <div class="calendar-wrap">${months.map(m).join('')}</div>`;
}

/* ---------------- 关键词库 ---------------- */
function renderKeywords() {
  const kws = shopKeywords();
  const cats = ['全部','核心词','属性词','场景词','规格词','长尾词'];
  const hotOpts = ['全部热度','热','中','长尾'];
  const relOpts = ['全部关联','高','中','低'];
  const counts = kws.reduce((a,k)=>{a[k.category]=(a[k.category]||0)+1;return a;},{});
  const hotCounts = kws.reduce((a,k)=>{a[k.hot]=(a[k.hot]||0)+1;return a;},{});
  const relCounts = kws.reduce((a,k)=>{a[k.relevance]=(a[k.relevance]||0)+1;return a;},{});
  const bestCount = kws.filter(k=>k.hot==='热' && k.relevance==='高').length;
  const kwProducts = ['全部产品', ...new Set(kws.map(k => k.product || '门后挂钩'))];  // 筛选 tab：只显示有关键词的商品归属
  const prodNames = [...new Set([...shopProducts().map(p => p.name), ...kws.map(k => k.product || '门后挂钩')])];  // 商品归属建议：商品模块商品名 + 关键词已有归属
  const prodCounts = kws.reduce((a,k)=>{const p=k.product||'门后挂钩';a[p]=(a[p]||0)+1;return a;},{});
  // 标题生成词表（含长尾词，充分利用数据资产）
  const coreWords = kws.filter(k=>k.category==='核心词' && k.status!=='弃用');
  const attrWords = kws.filter(k=>k.category==='属性词' && k.status!=='弃用');
  const sceneWords = kws.filter(k=>k.category==='场景词' && k.status!=='弃用');
  const specWords = kws.filter(k=>k.category==='规格词' && k.status!=='弃用');
  const longtailWords = kws.filter(k=>k.category==='长尾词' && k.status!=='弃用');
  // 热度 + 关联性加权：热+高关联的词更易被选中（替代纯随机）
  const hotW = {热:3, 中:2, 长尾:1};
  const relW = {高:3, 中:2, 低:1};
  const kScore = k => (hotW[k.hot]||1) + (relW[k.relevance]||1);
  const weightedPick = (arr, exclude='') => {
    const pool = arr.filter(k => k.word !== exclude);
    if (!pool.length) return '';
    const weights = pool.map(kScore);
    const total = weights.reduce((a,b)=>a+b,0);
    let r = Math.random() * total;
    for (let i=0;i<pool.length;i++){ r -= weights[i]; if (r<=0) return pool[i].word; }
    return pool[pool.length-1].word;
  };
  // 检测标题内是否有词表词重复出现（避免「免打孔免打孔」）
  const allWords = [...coreWords, ...attrWords, ...sceneWords, ...specWords, ...longtailWords];
  const hasDup = t => allWords.some(w => w.word.length>=2 && t.split(w.word).length>2);
  const genTitles = (core, n) => {
    // 真实标题结构：核心词前置 → 卖点属性 → 场景/规格
    const templates = [
      (a1,a2,sc,sp) => core + a1 + a2 + sc,
      (a1,a2,sc,sp) => core + a1 + sc + sp,
      (a1,a2,sc,sp) => a1 + core + a2 + sc,
      (a1,a2,sc,sp) => core + a1 + sp + sc,
      (a1,a2,sc,sp) => core + sc + a1 + sp,
    ];
    const titles = new Set();
    let guard = 0;
    while (titles.size < n && guard < 400) {
      guard++;
      const a1 = weightedPick(attrWords);
      const a2 = weightedPick(attrWords, a1);   // 去重：a2 排除 a1
      const sc = weightedPick(sceneWords);
      const sp = weightedPick(specWords);
      const t = templates[guard % templates.length](a1, a2, sc, sp);
      if (t.length <= 30 && t.length >= 6 && !hasDup(t)) titles.add(t);
    }
    return [...titles];
  };
  // 长尾词直推：热长尾词本身就是真实搜索词组，直接作为标题候选
  const longtailTitles = longtailWords
    .filter(k => k.hot==='热')
    .map(k => k.word)
    .filter(w => w.length >= 4 && w.length <= 30);
  const statusCls = s => ({'待用':'blue','在用':'green','弃用':'gray'}[s]||'blue');
  const hotCls = h => ({'热':'red','中':'amber','长尾':'gray'}[h]||'gray');
  const relCls = r => ({'高':'green','中':'blue','低':'gray'}[r]||'gray');

  const kwRow = k => {
    const dim = [];
    if ((k.search_volume||0) > 0) dim.push(`搜索量${k.search_volume}`);
    if ((k.competition||0) > 0) dim.push(`竞争${k.competition}`);
    if ((k.ctr||0) > 0) dim.push(`CTR ${(k.ctr*100).toFixed(1)}%`);
    if ((k.cvr||0) > 0) dim.push(`CVR ${(k.cvr*100).toFixed(1)}%`);
    if ((k.roi||0) > 0) dim.push(`ROI ${k.roi.toFixed(1)}`);
    const dimStr = dim.length ? ' · ' + dim.join(' · ') : '';
    const poolTag = k.pool_type === 'black' ? '<span class="tag" style="background:#333;color:#fff">黑名单</span>'
                  : k.pool_type === 'spare' ? '<span class="tag amber">备用池</span>'
                  : '<span class="tag green">主池</span>';
    const poolBtn = k.pool_type === 'spare'
      ? `<button class="btn sm" style="margin-left:4px" onclick="window.__kwPool && window.__kwPool('${k.id}','main')" title="迁入主池">→主池</button>`
      : (k.pool_type === 'main'
        ? `<button class="btn sm" style="margin-left:4px" onclick="window.__kwPool && window.__kwPool('${k.id}','spare')" title="移入备用池">→备用</button>`
        : `<button class="btn sm" style="margin-left:4px" onclick="window.__kwPool && window.__kwPool('${k.id}','spare')" title="移出黑名单">解除</button>`);
    return `
    <div class="task-row" style="align-items:center">
      <div class="task-body" style="flex:1">
        <div class="task-title">${esc(k.word)}</div>
        <div class="task-meta">${esc(k.source||'')} · ${esc(k.category||'')} · 权重${esc(k.weight!=null?k.weight:5)}${dimStr}</div>
      </div>
      ${poolTag}
      <span class="tag ${hotCls(k.hot)}" style="margin:0 4px" title="热度">🔥${esc(k.hot||'—')}</span>
      <span class="tag ${relCls(k.relevance)}" style="margin:0 4px" title="关联性">${esc(k.relevance||'—')}关联</span>
      <span class="tag ${statusCls(k.status)}">${esc(k.status||'待用')}</span>
      ${poolBtn}
      <button class="btn sm" style="margin-left:4px" onclick="window.__kwStatus && window.__kwStatus('${k.id}')">状态</button>
      <button class="btn sm danger" onclick="window.__delKw && window.__delKw('${k.id}')">删</button>
    </div>`;
  };

  // 筛选状态（产品 × 分类 × 热度 × 关联性 × 池）
  const f = {product:'全部产品', cat:'全部', hot:'全部热度', rel:'全部关联', pool:'全部池'};
  const applyFilter = () => kws.filter(k =>
    (f.product==='全部产品' || (k.product||'门后挂钩')===f.product) &&
    (f.cat==='全部' || k.category===f.cat) &&
    (f.hot==='全部热度' || k.hot===f.hot) &&
    (f.rel==='全部关联' || k.relevance===f.rel) &&
    (f.pool==='全部池' || (k.pool_type||'main')===f.pool)
  );
  const renderList = () => {
    const list = applyFilter();
    $('#kw-list').innerHTML = list.map(kwRow).join('') || '<div class="empty">暂无匹配关键词</div>';
    $('#kw-count').textContent = `匹配 ${list.length} 个`;
  };

  $('#view-keywords').innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card"><div class="label">关键词总数</div><div class="value">${kws.length}</div><div class="hint">已储备</div></div>
      <div class="stat-card"><div class="label">🔥 热词</div><div class="value">${hotCounts['热']||0}</div><div class="hint">搜索热度最高</div></div>
      <div class="stat-card"><div class="label">高关联</div><div class="value">${relCounts['高']||0}</div><div class="hint">核心类目词</div></div>
      <div class="stat-card"><div class="label">🔥 热 + 高关联</div><div class="value">${bestCount}</div><div class="hint">优先用于标题</div></div>
    </div>

    <div class="panel" style="margin-bottom:16px">
      <div class="panel-header"><h2>🔍 1688 联想词采集</h2><span class="badge">免费拓词源 · CDP 直采 · 自动入库</span></div>
      <div class="field-row">
        <div class="field" style="flex:1"><label>核心词（多个用逗号/空格分隔）</label>
          <input id="collect-words" placeholder="例如：门后挂钩 挂衣钩 置物架">
        </div>
        <div class="field"><label>常用核心词</label>
          <select id="collect-preset">
            <option value="">— 选择 —</option>
            <option value="门后挂钩 挂衣钩 挂衣架 衣钩 门后收纳 置物架">门后挂钩（全量）</option>
            <option value="免打孔挂钩 吸盘挂钩 铁艺挂钩">挂钩类型</option>
            <option value="收纳架 置物架 挂架">收纳架</option>
          </select>
        </div>
        <div class="field"><label>商品归属</label>
          <input id="collect-product" list="kw-prod-list" value="门后挂钩" placeholder="门后挂钩">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn primary" id="collect-btn">🔍 开始采集</button>
        <span class="task-meta" style="margin-left:8px">调用 Edge 浏览器采集 1688 搜索联想词，约 10 秒/词</span>
      </div>
      <div id="collect-result" style="margin-top:12px"></div>
    </div>

    <div class="panel" style="margin-bottom:16px">
      <div class="panel-header"><h2>🔬 竞品标题拆解</h2><span class="badge">AI 分词 · 拆词进备用池</span></div>
      <div class="field-row">
        <div class="field" style="flex:1"><label>竞品标题</label>
          <input id="split-title" placeholder="粘贴竞品标题，例如：门后挂钩免打孔强力不锈钢卧室挂衣钩加大号5钩">
        </div>
        <div class="field"><label>操作</label>
          <button class="btn primary" id="split-btn">🔬 AI 拆解</button>
        </div>
      </div>
      <div class="task-meta" style="margin-bottom:6px">AI 把标题拆成核心主词/属性词/材质/卖点/场景/规格词，可勾选导入备用池，标题结构自动提取为模板</div>
      <div id="split-result" style="margin-top:8px"></div>
    </div>

    <div class="panel" style="margin-bottom:16px">
      <div class="panel-header"><h2>💬 评价痛点词</h2><span class="badge">竞品评价 → 痛点反转卖点 · 进备用池</span></div>
      <div class="field-row">
        <div class="field" style="flex:1"><label>竞品评价 / 问大家文本</label>
          <textarea id="review-text" rows="3" placeholder="粘贴竞品评价或问大家内容，可多行多条。例如：&#10;买回来两周就生锈了，挂重东西会掉，钩子有点小，浴室门后粘不住会脱落&#10;问大家：会掉漆吗？承重多少？"></textarea>
        </div>
        <div class="field"><label>操作</label>
          <button class="btn primary" id="review-btn">💬 AI 拆痛点</button>
        </div>
      </div>
      <div class="task-meta" style="margin-bottom:6px">AI 提炼买家抱怨的痛点（生锈/易脱落），反转成标题可用的正面卖点词（防锈/牢固），卖点词进备用池、痛点词单独归档供参考</div>
      <div id="review-result" style="margin-top:8px"></div>
    </div>

    <div class="panel" style="margin-bottom:16px">
      <div class="panel-header"><h2>🧠 AI 同义词扩充</h2><span class="badge">核心词 → 同义词/长尾/场景 · 进备用池</span></div>
      <div class="field-row">
        <div class="field" style="flex:1"><label>核心词</label>
          <input id="expand-core" list="kw-expand-list" placeholder="例如：门后挂钩 / 置物架">
          <datalist id="kw-expand-list">${prodNames.map(p=>`<option value="${esc(p)}">`).join('')}</datalist>
        </div>
        <div class="field"><label>操作</label>
          <button class="btn primary" id="expand-btn">🧠 AI 扩充</button>
        </div>
      </div>
      <div class="task-meta" style="margin-bottom:6px">AI 生成核心词的近义词/同义表达 + 长尾组合 + 场景词，勾选导入备用池（同义词→核心词、长尾→长尾词、场景→场景词）</div>
      <div id="expand-result" style="margin-top:8px"></div>
    </div>

    <div class="grid cols-2">
      <div class="panel">
        <div class="panel-header"><h2>新增关键词</h2></div>
        <form id="kw-form">
          <div class="field-row">
            <div class="field"><label>关键词</label><input name="word" placeholder="例如：门后挂钩"></div>
            <div class="field"><label>分类</label>
              <select name="category">
                <option>核心词</option><option>属性词</option><option>场景词</option><option>规格词</option><option>长尾词</option>
              </select>
            </div>
          </div>
          <div class="field"><label>产品</label><input name="product" list="kw-prod-list" value="门后挂钩" placeholder="门后挂钩 / 工艺品">
            <datalist id="kw-prod-list">${prodNames.map(p=>`<option value="${esc(p)}">`).join('')}</datalist>
          </div>
          <div class="field"><label>来源（可选）</label><input name="source" placeholder="手动 / 拼多多 / 1688"></div>
          <div class="field-row">
            <div class="field"><label>搜索量（预筛用）</label><input name="search_volume" type="number" min="0" placeholder="0"></div>
            <div class="field"><label>竞争度 0-100（预筛用）</label><input name="competition" type="number" min="0" max="100" placeholder="50"></div>
          </div>
          <div class="form-actions"><button type="submit" class="btn primary">添加关键词</button><button type="button" class="btn sm" id="kw-score-btn" style="margin-left:8px">🎯 预筛打分预览</button></div>
        </form>
      </div>
      <div class="panel">
        <div class="panel-header"><h2>关键词列表</h2><span class="badge" id="kw-count"></span></div>
        <div class="tabs" id="kw-prod-tabs" style="margin-bottom:6px">
          ${kwProducts.map(p=>`<button class="tab ${p==='全部产品'?'active':''}" data-v="${esc(p)}">${esc(p)}${p==='全部产品'?'':` (${prodCounts[p]||0})`}</button>`).join('')}
        </div>
        <div class="tabs" id="kw-cat-tabs">
          ${cats.map(c=>`<button class="tab ${c==='全部'?'active':''}" data-v="${esc(c)}">${esc(c)}${c==='全部'?'':` (${counts[c]||0})`}</button>`).join('')}
        </div>
        <div class="tabs" id="kw-hot-tabs" style="margin-top:6px">
          ${hotOpts.map(h=>`<button class="tab ${h==='全部热度'?'active':''}" data-v="${esc(h)}">${h==='全部热度'?'热度':esc(h)}${h==='全部热度'?'':` (${hotCounts[h]||0})`}</button>`).join('')}
        </div>
        <div class="tabs" id="kw-rel-tabs" style="margin-top:6px">
          ${relOpts.map(r=>`<button class="tab ${r==='全部关联'?'active':''}" data-v="${esc(r)}">${r==='全部关联'?'关联':esc(r)}${r==='全部关联'?'':` (${relCounts[r]||0})`}</button>`).join('')}
        </div>
        <div class="tabs" id="kw-pool-tabs" style="margin-top:6px">
          ${['全部池','main','spare','black'].map(p=>`<button class="tab ${p==='全部池'?'active':''}" data-v="${p}">${p==='全部池'?'池':p==='main'?'主池':p==='spare'?'备用池':'黑名单'}</button>`).join('')}
        </div>
        <div style="margin-top:10px;display:flex;gap:8px">
          <button class="btn sm primary" id="kw-best-btn">🔥 热 + 高关联</button>
          <button class="btn sm" id="kw-clear-btn">清除筛选</button>
          <button class="btn sm" id="kw-clean-btn">🧹 批量清洗</button>
          <button class="btn sm" id="kw-spare-to-main-btn">⏫ 备用池全迁主池</button>
        </div>
        <div id="kw-list" style="margin-top:12px;max-height:360px;overflow-y:auto"></div>
      </div>
    </div>

    <div class="panel" style="margin-bottom:16px">
      <div class="panel-header"><h2>⚖️ 权重体系</h2><span class="badge">预筛打分 + 标题投放回流 + AI建议审核</span></div>
      <div class="field-row">
        <div class="field"><label>预筛打分</label>
          <button class="btn sm" id="kw-rescore-btn">🎯 批量重跑预筛（备用池词）</button>
          <div class="task-meta" style="margin-top:4px">按 搜索量/竞争度/相关性/合规 给备用池词算初始权重，蓝海词7-9、基础词4-6、长尾1-3、极限词进黑名单</div>
        </div>
        <div class="field"><label>AI 权重建议</label>
          <button class="btn sm primary" id="sug-generate-btn">🤖 生成建议</button>
          <button class="btn sm" id="sug-apply-btn" style="margin-left:6px">✅ 全部确认</button>
          <button class="btn sm" id="sug-reject-btn" style="margin-left:6px">❌ 全部驳回</button>
          <div class="task-meta" style="margin-top:4px">基于标题投放数据，AI 算权重变更建议（不直接改库），人工一键确认/驳回</div>
        </div>
      </div>
      <div id="kw-baseline" style="margin:8px 0;font-size:12px;color:#888"></div>
      <div id="sug-list" style="margin-top:8px"></div>
    </div>

    <div class="panel" style="margin-bottom:16px">
      <div class="panel-header"><h2>✨ 标题生成器</h2><span class="badge">核心词+属性+场景+规格 · 热度加权 · 长尾词直推</span></div>
      <div class="field-row">
        <div class="field"><label>核心词</label>
          <select id="tg-core">${coreWords.map(w=>`<option value="${esc(w.word)}">${esc(w.word)}</option>`).join('') || '<option value="">（无核心词）</option>'}</select>
        </div>
        <div class="field"><label>生成条数（可填数字）</label>
          <input id="tg-n" type="number" min="1" max="50" value="10" placeholder="如 10">
        </div>
        <div class="field"><label>平台</label>
          <select id="tg-platform"><option value="all">全平台</option><option value="pdd">拼多多</option><option value="taobao">淘宝</option></select>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>应用到商品（可选）</label>
          <select id="tg-product">
            <option value="">（仅生成，不应用）</option>
            ${shopProducts().map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-actions"><button class="btn primary" id="tg-btn">✨ 生成标题</button></div>
      <div id="tg-result" style="margin-top:12px"></div>
    </div>

    <div class="panel" style="margin-bottom:16px">
      <div class="panel-header"><h2>📊 标题投放记录</h2><span class="badge">标题 → 曝光/点击/成交/花费，回流权重</span></div>
      <form id="tp-form">
        <div class="field-row">
          <div class="field"><label>标题</label><input name="title" placeholder="例如：门后挂钩免打孔卧室"></div>
          <div class="field"><label>曝光</label><input name="impressions" type="number" min="0" placeholder="0"></div>
          <div class="field"><label>点击</label><input name="clicks" type="number" min="0" placeholder="0"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>成交订单</label><input name="orders" type="number" min="0" placeholder="0"></div>
          <div class="field"><label>成交金额 GMV</label><input name="gmv" type="number" min="0" step="0.01" placeholder="0"></div>
          <div class="field"><label>广告花费</label><input name="ad_spend" type="number" min="0" step="0.01" placeholder="0"></div>
        </div>
        <div class="form-actions"><button type="submit" class="btn primary">录入投放数据</button></div>
      </form>
      <div id="tp-list" style="margin-top:12px"></div>
    </div>

    <div class="callout" style="margin-top:16px">关键词来源：现有商品标题提炼 + 1688 搜索联想词。做标题优先筛「🔥 热 + 高关联」词，可手动补充拼多多 / 1688 搜索词。</div>`;

  // 三组 tab 绑定
  const bindTabs = (sel, key) => {
    $$(sel + ' .tab').forEach(t => t.onclick = () => {
      $$(sel + ' .tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      f[key] = t.dataset.v;
      renderList();
    });
  };
  bindTabs('#kw-prod-tabs', 'product');
  bindTabs('#kw-cat-tabs', 'cat');
  bindTabs('#kw-hot-tabs', 'hot');
  bindTabs('#kw-rel-tabs', 'rel');
  bindTabs('#kw-pool-tabs', 'pool');

  // 一键热+高关联
  $('#kw-best-btn').onclick = () => {
    f.hot = '热'; f.rel = '高';
    $$('#kw-hot-tabs .tab').forEach(x=>x.classList.toggle('active', x.dataset.v==='热'));
    $$('#kw-rel-tabs .tab').forEach(x=>x.classList.toggle('active', x.dataset.v==='高'));
    renderList();
  };
  // 清除筛选
  $('#kw-clear-btn').onclick = () => {
    f.product='全部产品'; f.cat='全部'; f.hot='全部热度'; f.rel='全部关联'; f.pool='全部池';
    $$('#kw-prod-tabs .tab').forEach(x=>x.classList.toggle('active', x.dataset.v==='全部产品'));
    $$('#kw-cat-tabs .tab').forEach(x=>x.classList.toggle('active', x.dataset.v==='全部'));
    $$('#kw-hot-tabs .tab').forEach(x=>x.classList.toggle('active', x.dataset.v==='全部热度'));
    $$('#kw-rel-tabs .tab').forEach(x=>x.classList.toggle('active', x.dataset.v==='全部关联'));
    $$('#kw-pool-tabs .tab').forEach(x=>x.classList.toggle('active', x.dataset.v==='全部池'));
    renderList();
  };
  // 批量清洗（去重+标准化+脏词标记）
  $('#kw-clean-btn').onclick = async () => {
    if (!confirm('批量清洗：去重 + 文本标准化 + 脏词标记（移入黑名单池）。确定？')) return;
    try {
      const r = await api('/api/keywords/clean', 'POST', {});
      await loadKeywordsOnly();
      renderKeywords();
      toast(`清洗完成：去重 ${r.deduped} 个，标记脏词 ${r.dirty} 个，剩余 ${r.total} 个`);
    } catch(err) { toast(err.message); }
  };

  renderList();

  // ---- 1688 联想词采集 ----
  $('#collect-preset').onchange = () => {
    const v = $('#collect-preset').value;
    if (v) $('#collect-words').value = v;
  };
  $('#collect-btn').onclick = async () => {
    const raw = $('#collect-words').value.trim();
    if (!raw) { toast('请先填核心词'); return; }
    const core_words = raw.split(/[,，\s]+/).filter(Boolean);
    const product = ($('#collect-product').value || '').trim() || '门后挂钩';
    $('#collect-btn').disabled = true;
    $('#collect-btn').textContent = '🔍 采集中…';
    $('#collect-result').innerHTML = '<div class="empty">正在调用 Edge 采集 1688 联想词，约 10 秒/词，请稍候…</div>';
    try {
      const r = await api('/api/keywords/collect', 'POST', {core_words, product});
      if (r.error) {
        $('#collect-result').innerHTML = `<div class="callout" style="border-color:#e74c3c">❌ ${esc(r.error)}</div>`;
      } else {
        const items = (r.collected || []).map(c =>
          `<span class="tag ${c.hot==='热'?'red':c.hot==='中'?'amber':'gray'}" style="margin:3px">${esc(c.word)} 🔥${esc(c.hot)}</span>`
        ).join('');
        $('#collect-result').innerHTML = `
          <div class="callout" style="border-color:#27ae60">✅ 采集完成：新增 ${r.added} 个，跳过 ${r.skipped} 个（已存在）</div>
          <div style="margin-top:8px">${items || '<div class="empty">未采集到新词</div>'}</div>`;
        await loadKeywordsOnly();
        renderKeywords();
      }
    } catch(err) {
      $('#collect-result').innerHTML = `<div class="callout" style="border-color:#e74c3c">❌ ${esc(err.message)}</div>`;
    } finally {
      $('#collect-btn').disabled = false;
      $('#collect-btn').textContent = '🔍 开始采集';
    }
  };

  // ---- 竞品标题 AI 拆解 ----
  const roleCls = role => ({'核心主词':'green','属性词':'blue','材质':'amber','功能卖点':'amber','场景':'blue','营销词':'red','规格词':'gray'}[role]||'gray');
  window.__splitWords = [];
  window.__splitTitle = '';
  $('#split-btn').onclick = async () => {
    const title = $('#split-title').value.trim();
    if (!title) { toast('请先粘贴竞品标题'); return; }
    $('#split-btn').disabled = true;
    $('#split-btn').textContent = '🔬 拆解中…';
    $('#split-result').innerHTML = '<div class="empty">AI 拆解中，约 5-10 秒…</div>';
    try {
      const r = await api('/api/titles/split', 'POST', {title});
      if (r.error) {
        $('#split-result').innerHTML = `<div class="callout" style="border-color:#e74c3c">❌ ${esc(r.error)}</div>`;
      } else {
        window.__splitWords = r.words || [];
        window.__splitTitle = title;
        const words = r.words.map((w, i) => `
          <label class="task-row" style="align-items:center;cursor:pointer">
            <input type="checkbox" checked data-split-idx="${i}" style="margin-right:8px">
            <div class="task-body" style="flex:1">
              <div class="task-title">${esc(w.word)}</div>
              <div class="task-meta">${esc(w.role)}</div>
            </div>
            <span class="tag ${roleCls(w.role)}">${esc(w.role)}</span>
          </label>`).join('');
        $('#split-result').innerHTML = `
          ${r.template ? `<div class="callout" style="border-color:#27ae60">📐 标题模板：<b>${esc(r.template)}</b></div>` : ''}
          <div style="margin-top:8px">${words || '<div class="empty">未拆出词</div>'}</div>
          <div class="form-actions" style="margin-top:8px">
            <button class="btn primary" id="split-import-btn">✅ 导入选中词（备用池）</button>
          </div>`;
        $('#split-import-btn').onclick = async () => {
          const checked = [...document.querySelectorAll('#split-result input[type=checkbox]:checked')].map(c => parseInt(c.dataset.splitIdx));
          const selWords = checked.map(i => window.__splitWords[i]).filter(Boolean);
          if (!selWords.length) { toast('请先勾选要导入的词'); return; }
          try {
            const ir = await api('/api/titles/split/import', 'POST', {title: window.__splitTitle, words: selWords});
            await loadKeywordsOnly();
            renderKeywords();
            toast(`导入完成：新增 ${ir.added} 个，跳过 ${ir.skipped} 个（已存在）`);
          } catch(err) { toast(err.message); }
        };
      }
    } catch(err) {
      $('#split-result').innerHTML = `<div class="callout" style="border-color:#e74c3c">❌ ${esc(err.message)}</div>`;
    } finally {
      $('#split-btn').disabled = false;
      $('#split-btn').textContent = '🔬 AI 拆解';
    }
  };

  // ---- 竞品评价/问大家 痛点词 AI 拆解 ----
  window.__reviewPairs = [];
  window.__reviewText = '';
  $('#review-btn').onclick = async () => {
    const text = $('#review-text').value.trim();
    if (!text) { toast('请先粘贴竞品评价/问大家文本'); return; }
    $('#review-btn').disabled = true;
    $('#review-btn').textContent = '💬 拆解中…';
    $('#review-result').innerHTML = '<div class="empty">AI 分析痛点中，约 5-10 秒…</div>';
    try {
      const r = await api('/api/titles/split-review', 'POST', {text});
      if (r.error) {
        $('#review-result').innerHTML = `<div class="callout" style="border-color:#e74c3c">❌ ${esc(r.error)}</div>`;
      } else {
        window.__reviewPairs = r.pairs || [];
        window.__reviewText = text;
        const rows = r.pairs.map((p, i) => `
          <label class="task-row" style="align-items:center;cursor:pointer">
            <input type="checkbox" checked data-review-idx="${i}" style="margin-right:8px">
            <div class="task-body" style="flex:1">
              <div class="task-title">痛点「${esc(p.pain)}」 → 卖点 <b>${esc(p.selling)}</b></div>
            </div>
            <span class="tag amber">卖点词</span>
          </label>`).join('');
        $('#review-result').innerHTML = `
          ${r.summary ? `<div class="callout" style="border-color:#e67e22">📋 竞品短板：${esc(r.summary)}</div>` : ''}
          <div style="margin-top:8px">${rows || '<div class="empty">未提炼出痛点</div>'}</div>
          <div class="task-meta" style="margin-top:6px">导入时：卖点词进备用池（功能卖点），痛点词归档为「痛点词」供竞品分析参考，不进标题生成</div>
          <div class="form-actions" style="margin-top:8px">
            <button class="btn primary" id="review-import-btn">✅ 导入选中（卖点进备用池）</button>
          </div>`;
        $('#review-import-btn').onclick = async () => {
          const checked = [...document.querySelectorAll('#review-result input[type=checkbox]:checked')].map(c => parseInt(c.dataset.reviewIdx));
          const selPairs = checked.map(i => window.__reviewPairs[i]).filter(Boolean);
          if (!selPairs.length) { toast('请先勾选要导入的痛点'); return; }
          try {
            const ir = await api('/api/titles/split-review/import', 'POST', {text: window.__reviewText, pairs: selPairs});
            await loadKeywordsOnly();
            renderKeywords();
            toast(`导入完成：新增 ${ir.added} 个，跳过 ${ir.skipped} 个（已存在）`);
          } catch(err) { toast(err.message); }
        };
      }
    } catch(err) {
      $('#review-result').innerHTML = `<div class="callout" style="border-color:#e74c3c">❌ ${esc(err.message)}</div>`;
    } finally {
      $('#review-btn').disabled = false;
      $('#review-btn').textContent = '💬 AI 拆痛点';
    }
  };

  // ---- AI 同义词/长尾变体扩充 ----
  window.__expandWords = [];
  window.__expandCore = '';
  $('#expand-btn').onclick = async () => {
    const core = $('#expand-core').value.trim();
    if (!core) { toast('请先输入核心词'); return; }
    $('#expand-btn').disabled = true;
    $('#expand-btn').textContent = '🧠 扩充中…';
    $('#expand-result').innerHTML = '<div class="empty">AI 扩充中，约 5-10 秒…</div>';
    try {
      const r = await api('/api/keywords/expand', 'POST', {core_word: core});
      if (r.error) {
        $('#expand-result').innerHTML = `<div class="callout" style="border-color:#e74c3c">❌ ${esc(r.error)}</div>`;
      } else {
        const build = (label, words, role, cls) => {
          if (!words || !words.length) return '';
          const rows = words.map((w, i) => {
            const idx = window.__expandWords.push({word: w, role}) - 1;
            return `<label class="task-row" style="align-items:center;cursor:pointer">
              <input type="checkbox" checked data-expand-idx="${idx}" style="margin-right:8px">
              <div class="task-body" style="flex:1"><div class="task-title">${esc(w)}</div></div>
              <span class="tag ${cls}">${role}</span>
            </label>`;
          }).join('');
          return `<div style="margin-top:8px"><div class="task-meta" style="margin-bottom:4px">${label}（${words.length}）</div>${rows}</div>`;
        };
        window.__expandWords = [];
        window.__expandCore = core;
        $('#expand-result').innerHTML = `
          ${build('🔄 同义词', r.synonyms, '同义词', 'green')}
          ${build('📏 长尾词', r.variants, '长尾词', 'blue')}
          ${build('🏠 场景词', r.scenes, '场景词', 'amber')}
          <div class="form-actions" style="margin-top:8px">
            <button class="btn primary" id="expand-import-btn">✅ 导入选中词（备用池）</button>
          </div>`;
        $('#expand-import-btn').onclick = async () => {
          const checked = [...document.querySelectorAll('#expand-result input[type=checkbox]:checked')].map(c => parseInt(c.dataset.expandIdx));
          const selWords = checked.map(i => window.__expandWords[i]).filter(Boolean);
          if (!selWords.length) { toast('请先勾选要导入的词'); return; }
          try {
            const ir = await api('/api/keywords/expand/import', 'POST', {core_word: window.__expandCore, words: selWords});
            await loadKeywordsOnly();
            renderKeywords();
            toast(`导入完成：新增 ${ir.added} 个，跳过 ${ir.skipped} 个（已存在）`);
          } catch(err) { toast(err.message); }
        };
      }
    } catch(err) {
      $('#expand-result').innerHTML = `<div class="callout" style="border-color:#e74c3c">❌ ${esc(err.message)}</div>`;
    } finally {
      $('#expand-btn').disabled = false;
      $('#expand-btn').textContent = '🧠 AI 扩充';
    }
  };

  // ---- 权重体系：预筛重跑 + AI建议 + 投放记录 ----

  // 渲染类目均值基线
  const renderBaseline = async () => {
    try {
      const b = await api('/api/keywords/baseline');
      $('#kw-baseline').innerHTML = b.total_impressions
        ? `类目均值基线：CTR ${(b.ctr_avg*100).toFixed(2)}% · CVR ${(b.cvr_avg*100).toFixed(2)}% · ROI ${b.roi_avg.toFixed(2)} · 总曝光 ${b.total_impressions} / 点击 ${b.total_clicks} / 订单 ${b.total_orders} / GMV ${b.total_gmv} / 花费 ${b.total_spend}`
        : '暂无投放数据，录入标题投放记录后可生成基线';
    } catch(err) {}
  };

  // 渲染权重建议列表
  const renderSuggestions = async () => {
    try {
      const r = await api('/api/weight-suggestions');
      const sugs = r.items || [];
      const pending = sugs.filter(s=>s.status==='pending');
      window.__pendingSugs = pending.map(s=>s.id);
      $('#sug-list').innerHTML = pending.length
        ? pending.map(s => `<div class="task-row" style="align-items:center">
            <div class="task-body" style="flex:1">
              <div class="task-title">${esc(s.word)} <span class="tag blue">${esc(s.category||'')}</span></div>
              <div class="task-meta">权重 ${s.current_weight} → <b style="color:${s.delta>0?'green':'red'}">${s.suggested_weight}</b> (Δ${s.delta>0?'+':''}${s.delta}) · ${esc(s.reason)}</div>
              <div class="task-meta">CTR ${(s.ctr*100).toFixed(2)}% · CVR ${(s.cvr*100).toFixed(2)}% · ROI ${s.roi.toFixed(2)} · 命中${s.title_count}条标题</div>
            </div>
            <button class="btn sm" onclick="window.__sugOne && window.__sugOne('${s.id}','apply')">✅</button>
            <button class="btn sm" style="margin-left:4px" onclick="window.__sugOne && window.__sugOne('${s.id}','reject')">❌</button>
          </div>`).join('')
        : '<div class="empty">暂无待审核建议，点「生成建议」</div>';
    } catch(err) { toast(err.message); }
  };

  // 渲染投放记录列表
  const renderTitlePerf = async () => {
    try {
      const r = await api('/api/title-perf');
      const items = r.items || [];
      $('#tp-list').innerHTML = items.length
        ? items.map(t => `<div class="task-row" style="align-items:center">
            <div class="task-body" style="flex:1">
              <div class="task-title">${esc(t.title)}</div>
              <div class="task-meta">曝光${t.impressions} · 点击${t.clicks} · 订单${t.orders} · GMV ${t.gmv} · 花费${t.ad_spend}</div>
              <div class="task-meta">CTR ${(t.ctr*100).toFixed(2)}% · CVR ${(t.cvr*100).toFixed(2)}% · ROI ${t.roi.toFixed(2)}</div>
            </div>
            <button class="btn sm danger" onclick="window.__delTp && window.__delTp('${t.id}')">删</button>
          </div>`).join('')
        : '<div class="empty">暂无投放记录</div>';
    } catch(err) { toast(err.message); }
  };

  renderBaseline();
  renderSuggestions();
  renderTitlePerf();

  // 批量重跑预筛打分
  $('#kw-rescore-btn').onclick = async () => {
    if (!confirm('对备用池词批量重跑预筛打分？主池已上线词不受影响。')) return;
    try {
      const r = await api('/api/keywords/rescore', 'POST', {});
      await loadKeywordsOnly();
      renderKeywords();
      toast(`预筛完成：重打分 ${r.scored} 个备用池词`);
    } catch(err) { toast(err.message); }
  };

  // 生成权重建议
  $('#sug-generate-btn').onclick = async () => {
    try {
      const r = await api('/api/weight-suggestions/generate', 'POST', {});
      renderBaseline();
      renderSuggestions();
      toast(r.generated ? `已生成 ${r.generated} 条建议，待审核` : '无数据变化，未生成建议');
    } catch(err) { toast(err.message); }
  };

  // 全部确认 / 全部驳回
  $('#sug-apply-btn').onclick = async () => {
    const ids = window.__pendingSugs || [];
    if (!ids.length) { toast('暂无待审核建议'); return; }
    try {
      const r = await api('/api/weight-suggestions/apply', 'POST', {ids});
      await loadKeywordsOnly();
      renderSuggestions();
      toast(`已确认 ${r.applied} 条建议，权重已更新`);
    } catch(err) { toast(err.message); }
  };
  $('#sug-reject-btn').onclick = async () => {
    const ids = window.__pendingSugs || [];
    if (!ids.length) { toast('暂无待审核建议'); return; }
    try {
      const r = await api('/api/weight-suggestions/reject', 'POST', {ids});
      renderSuggestions();
      toast(`已驳回 ${r.rejected} 条建议`);
    } catch(err) { toast(err.message); }
  };

  // 单条确认/驳回
  window.__sugOne = async (id, action) => {
    try {
      const path = action === 'apply' ? '/api/weight-suggestions/apply' : '/api/weight-suggestions/reject';
      const r = await api(path, 'POST', {ids:[id]});
      if (action === 'apply') await loadKeywordsOnly();
      renderSuggestions();
      toast(action === 'apply' ? `已确认 1 条` : `已驳回 1 条`);
    } catch(err) { toast(err.message); }
  };

  // 投放记录表单提交
  $('#tp-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      title: fd.get('title'), impressions: parseInt(fd.get('impressions')||0)||0,
      clicks: parseInt(fd.get('clicks')||0)||0, orders: parseInt(fd.get('orders')||0)||0,
      gmv: parseFloat(fd.get('gmv')||0)||0, ad_spend: parseFloat(fd.get('ad_spend')||0)||0,
    };
    if (!body.title) { toast('请填标题'); return; }
    try {
      await api('/api/title-perf', 'POST', body);
      e.target.reset();
      renderBaseline();
      renderTitlePerf();
      toast('已录入投放数据');
    } catch(err) { toast(err.message); }
  });

  // 删除投放记录
  window.__delTp = async id => {
    if (!confirm('删除该投放记录？')) return;
    try { await api('/api/title-perf/'+id, 'DELETE'); renderBaseline(); renderTitlePerf(); toast('已删除'); }
    catch(err) { toast(err.message); }
  };

  // 标题生成（后端模板引擎 + 长尾词直推，去重后展示，可一键应用到商品）
  $('#tg-btn').onclick = async () => {
    const core = $('#tg-core').value;
    const n = Math.min(50, Math.max(1, parseInt($('#tg-n').value) || 10));
    const platform = $('#tg-platform').value || 'all';
    if (!core) { $('#tg-result').innerHTML = '<div class="empty">请先添加核心词</div>'; return; }
    $('#tg-result').innerHTML = '<div class="empty">生成中…</div>';
    try {
      const resp = await api('/api/titles/generate', 'POST', {core, n, platform});
      const combined = resp.items || [];       // 后端模板+结构化词库生成
      const direct = longtailTitles;            // 长尾词直推（真实搜索词组）
      const titles = [...new Set([...combined, ...direct])];
      window.__tgTitles = titles;
      $('#tg-result').innerHTML = titles.length
        ? titles.map((t,i)=>{
            const isDirect = direct.includes(t);
            const srcTag = isDirect ? '<span class="tag amber">长尾词</span>' : '<span class="tag blue">模板组合</span>';
            return `<div class="task-row">
              <span class="tag green">${i+1}</span>
              <div class="task-body"><div class="task-title">${esc(t)}</div><div class="task-meta">${t.length} 字 · ${isDirect?'真实搜索词':'模板组合'}</div></div>
              ${srcTag}
              <button class="btn sm" onclick="window.__feedbackTitle && window.__feedbackTitle(${i},'good')" title="表现好，词权重+1">👍</button>
              <button class="btn sm" style="margin-left:4px" onclick="window.__feedbackTitle && window.__feedbackTitle(${i},'bad')" title="表现差，词权重-1">👎</button>
              <button class="btn sm" onclick="window.__applyTitle && window.__applyTitle(${i})">应用</button>
              <button class="btn sm" style="margin-left:4px" onclick="window.__copyTitle && window.__copyTitle(${i})">复制</button>
            </div>`;
          }).join('')
        : '<div class="empty">词表不足，请先补充关键词</div>';
    } catch(err) {
      $('#tg-result').innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
    }
  };

  // 复制标题（clipboard API + textarea 降级，微信内置浏览器兼容）
  window.__copyTitle = async idx => {
    const t = window.__tgTitles && window.__tgTitles[idx];
    if (!t) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(t);
      } else {
        const ta = document.createElement('textarea');
        ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast('已复制：' + t);
    } catch(e) {
      toast('复制失败，请长按手动复制');
    }
  };

  // 把选中标题应用到商品（改 name，走商品 POST 接口持久化）
  window.__applyTitle = async idx => {
    const t = window.__tgTitles && window.__tgTitles[idx];
    if (!t) return;
    const pid = $('#tg-product').value;
    if (!pid) { toast('请先选择要应用的商品'); return; }
    const p = state.products.find(x => x.id === pid);
    if (!p) { toast('商品不存在'); return; }
    p.name = t;
    try { await api('/api/products','POST',p); toast('已应用标题：' + t); }
    catch(err){ toast(err.message); }
  };
  // 标题表现回流：拆解标题关键词，调整权重（👍+1 / 👎-1）
  window.__feedbackTitle = async (idx, perf) => {
    const t = window.__tgTitles && window.__tgTitles[idx];
    if (!t) return;
    try {
      const r = await api('/api/keywords/feedback', 'POST', {title: t, performance: perf});
      toast((perf==='good'?'👍':'👎') + ` 已回流，${r.matched} 个词权重${r.delta>0?'+':''}${r.delta}`);
    } catch(err){ toast(err.message); }
  };

  $('#kw-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {word: fd.get('word'), category: fd.get('category'), source: fd.get('source')||'manual', product: fd.get('product')||'门后挂钩', search_volume: parseInt(fd.get('search_volume')||0)||0, competition: parseInt(fd.get('competition')||0)||0};
    try {
      await api('/api/keywords','POST',body);
      await loadKeywordsOnly();
      renderKeywords();
      toast('已添加关键词');
    } catch(err){ toast(err.message); }
  });

  // 预筛打分预览：填了搜索量/竞争度后，调用后端打分展示建议权重/池
  $('#kw-score-btn').onclick = async () => {
    const fd = new FormData($('#kw-form'));
    const word = fd.get('word');
    if (!word) { toast('请先填关键词'); return; }
    const body = {word, category: fd.get('category'), product: fd.get('product')||'门后挂钩', search_volume: parseInt(fd.get('search_volume')||0)||0, competition: parseInt(fd.get('competition')||0)||0};
    // 关联性：按现有词库同词/产品判断，简单起见先传后端算
    try {
      const r = await api('/api/keywords/score', 'POST', body);
      toast(`预筛结果：权重 ${r.weight} → ${r.pool_type==='black'?'黑名单':r.pool_type==='main'?'主池':'备用池'}（${r.reason}）`);
    } catch(err){ toast(err.message); }
  };

  window.__delKw = async id => {
    if (!confirm('删除该关键词？')) return;
    try { await api('/api/keywords/'+id,'DELETE'); await loadKeywordsOnly(); renderKeywords(); toast('已删除'); }
    catch(err){ toast(err.message); }
  };
  window.__kwStatus = async id => {
    const k = kws.find(x=>x.id===id); if(!k) return;
    const order = ['待用','在用','弃用'];
    k.status = order[(order.indexOf(k.status||'待用')+1)%order.length];
    try { await api('/api/keywords','POST',k); renderKeywords(); }
    catch(err){ toast(err.message); }
  };
  // 池子迁移：main↔spare↔black
  window.__kwPool = async (id, pool) => {
    const k = kws.find(x=>x.id===id); if(!k) return;
    try {
      await api('/api/keywords/batch','POST',{ids:[id], fields:{pool_type: pool}});
      await loadKeywordsOnly();
      renderKeywords();
      toast(pool==='main' ? '已迁入主池' : pool==='spare' ? '已移入备用池' : '已移入黑名单');
    } catch(err){ toast(err.message); }
  };
  // 备用池全迁主池
  $('#kw-spare-to-main-btn').onclick = async () => {
    const spareIds = kws.filter(k=>k.pool_type==='spare').map(k=>k.id);
    if (!spareIds.length) { toast('备用池无词'); return; }
    if (!confirm(`将 ${spareIds.length} 个备用池词全部迁入主池？`)) return;
    try {
      const r = await api('/api/keywords/batch','POST',{ids: spareIds, fields:{pool_type: 'main'}});
      await loadKeywordsOnly();
      renderKeywords();
      toast(`已迁入主池 ${r.updated} 个`);
    } catch(err){ toast(err.message); }
  };
}

/* ---------------- 任务 ---------------- */
function renderTasks() {
  const mods = [...new Set(state.templates.map(t=>t.module))];
  const addTask = (tpl) => {
    const task = {
      id: 't'+Date.now()+Math.floor(Math.random()*1000),
      template: tpl.id,
      title: tpl.title,
      module: tpl.module,
      priority: tpl.default_priority,
      date: new Date().toISOString().slice(0,10),
      checklist: (tpl.checklist||[]).map(x=>({text:x, done:false})),
      done:false,
      shop: state.shop,
    };
    state.tasks.unshift(task);
    api('/api/tasks','POST',task).then(()=>renderTasks()).catch(e=>toast(e.message));
  };
  const toggleTask = async (t) => {
    t.done = t.checklist.length ? t.checklist.every(c=>c.done) : !t.done;
    await api('/api/tasks','POST',t);
    renderTasks();
  };
  const toggleCheck = async (t,i) => {
    t.checklist[i].done = !t.checklist[i].done;
    t.done = t.checklist.every(c=>c.done);
    await api('/api/tasks','POST',t);
    renderTasks();
  };
  const delTask = async (id) => {
    if (!confirm('删除该任务？')) return;
    await api(`/api/tasks/${id}`,'DELETE');
    state.tasks = state.tasks.filter(t=>t.id!==id);
    renderTasks();
  };

  const taskHTML = t => `
    <div class="task-row ${t.done?'done':''}">
      <input type="checkbox" class="task-check" ${t.done?'checked':''} onchange="window.__toggleTask && window.__toggleTask('${t.id}')">
      <div class="task-body">
        <div class="task-title">${esc(t.title)}</div>
        <div class="task-meta">${esc(t.module)} · ${esc(t.priority||'')} · ${esc(t.date||'')}</div>
        ${(t.checklist||[]).map((c,i)=>`<div class="task-meta" style="display:flex;align-items:center;gap:6px"><input type="checkbox" class="task-check" style="width:14px;height:14px" ${c.done?'checked':''} onchange="window.__toggleCheck && window.__toggleCheck('${t.id}',${i})">${esc(c.text)}</div>`).join('')}
      </div>
      <button class="btn sm danger" onclick="window.__delTask && window.__delTask('${t.id}')">删除</button>
    </div>`;

  $('#view-tasks').innerHTML = `
    <div class="grid cols-2">
      <div class="panel">
        <div class="panel-header"><h2>从模板创建任务</h2></div>
        <div class="card-grid" style="grid-template-columns:1fr">
          ${state.templates.map(t=>`
            <div style="border:1px solid var(--line);border-radius:12px;padding:12px">
              <div class="cat" style="color:var(--brand);font-size:11px;font-weight:700">${esc(t.module)}</div>
              <h3 style="margin:6px 0;font-size:14px">${esc(t.title)}</h3>
              <div style="margin-bottom:8px">${(t.checklist||[]).map(x=>`<div class="task-meta">· ${esc(x)}</div>`).join('')}</div>
              <button class="btn sm" onclick="window.__addTask && window.__addTask('${t.id}')">＋ 创建</button>
            </div>`).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><h2>进行中的任务</h2><span class="badge">${shopTasks().filter(t=>t.done).length}/${shopTasks().length}</span></div>
        ${shopTasks().length ? shopTasks().map(taskHTML).join('') : '<div class="empty"><div class="big">🗂️</div>还没有任务。</div>'}
      </div>
    </div>`;

  window.__toggleTask = id => { const t=state.tasks.find(x=>x.id===id); if(t) toggleTask(t); };
  window.__toggleCheck = (id,i) => { const t=state.tasks.find(x=>x.id===id); if(t) toggleCheck(t,i); };
  window.__delTask = id => delTask(id);
  window.__addTask = id => { const tpl=state.templates.find(x=>x.id===id); if(tpl) addTask(tpl); };
}

async function loadAll() {
  const [p,k,c,tpl,tasks,kw,ph,lg] = await Promise.all([
    api('/api/products'), api('/api/knowledge'), api('/api/calendar'),
    api('/api/task-templates'), api('/api/tasks'), api('/api/keywords'),
    api('/api/promotion-history'), api('/api/logs'),
  ]);
  state.products = p.items || [];
  state.knowledge = k.items || [];
  state.calendar = c.items || [];
  state.templates = tpl.items || [];
  state.tasks = tasks.items || [];
  state.keywords = kw.items || [];
  state.promotionHistory = ph.items || [];
  state.logs = lg.items || [];
}

async function loadKeywordsOnly() {
  const kw = await api('/api/keywords');
  state.keywords = kw.items || [];
}

function bindShopButtons() {
  $$('.shop-btn').forEach(b => b.onclick = () => {
    $$('.shop-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    state.shop = b.dataset.shop;
    setView(state.view);
  });
}

async function init() {
  $('#date-pill').textContent = todayCN();
  $$('.nav-item').forEach(b => b.onclick = () => setView(b.dataset.view));
  $$('[data-nav]').forEach(b => b.onclick = () => setView(b.dataset.nav));
  // 动态生成店铺切换按钮（从商品库平台列表），覆盖 index.html 默认按钮
  try {
    const resp = await api('/api/catalog/platform-overview');
    const plats = (resp && resp.items) || [];
    if (plats.length) {
      const order = ['拼多多', '淘宝'];
      plats.sort((a, b) => {
        const ia = order.indexOf(a.name), ib = order.indexOf(b.name);
        if (ia !== -1 || ib !== -1) {
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
        }
        return (a.platform_id || 0) - (b.platform_id || 0);
      });
      const pill = $('#shop-pill');
      const cur = state.shop || '拼多多';
      pill.innerHTML = plats.map(pl =>
        `<button class="shop-btn ${pl.name === cur ? 'active' : ''}" data-shop="${esc(pl.name)}">${esc(pl.name)}</button>`
      ).join('');
    }
  } catch (e) {}
  bindShopButtons();
  await loadAll();
  setView('dashboard');
}

/* ================= 标题优化 Tab（挑选无订单商品 + 优化标题 + 效果跟踪） ================= */
const titleOptCache = { shopId: 5, candidates: [], opts: [], filter: '' };

function titleOptShopOptions() {
  const opts = [];
  (catalogCache.tree || []).forEach(pl => (pl.shops || []).forEach(sh => {
    opts.push({ id: sh.id, name: sh.name, platform: pl.name });
  }));
  return opts;
}

async function loadTitleOptData() {
  const sid = titleOptCache.shopId;
  const q = titleOptCache.filter ? '&q=' + encodeURIComponent(titleOptCache.filter) : '';
  const [cand, opt] = await Promise.all([
    api('/api/catalog/title-opt/candidates?shop_id=' + sid + q),
    api('/api/catalog/title-opt?shop_id=' + sid)
  ]);
  titleOptCache.candidates = cand.items || [];
  titleOptCache.opts = opt.items || [];
}

async function renderTitleOptView() {
  const el = $('#view-titleopt');
  el.innerHTML = '<div class="empty"><div class="big">✏️</div>加载中…</div>';

  if (!(catalogCache.tree || []).length) {
    try {
      const resp = await api('/api/catalog/tree');
      catalogCache.tree = resp.tree || [];
    } catch (e) {}
  }

  const shopOptions = titleOptShopOptions();
  const def = shopOptions.find(s => s.id === 5) || shopOptions[0];
  if (def) titleOptCache.shopId = def.id;
  if (!shopOptions.find(s => s.id === titleOptCache.shopId)) titleOptCache.shopId = def ? def.id : 5;

  try {
    await loadTitleOptData();
  } catch (e) {
    el.innerHTML = `<div class="empty">❌ ${esc(e.message)}</div>`;
    return;
  }
  paintTitleOpt(el);
}

function titleOptEffectHtml(o, bl) {
  if (o.latest_stat_date == null && !bl) return '';
  let h = '<div style="font-size:11px;line-height:1.7;background:#f8fafc;border-radius:8px;padding:8px;margin-bottom:4px">';
  h += '<div style="font-weight:700;color:#1e3a5f;margin-bottom:2px">📈 近7天访问效果</div>';
  const row = (label, base, latest) => {
    let diff = '';
    if (base != null && latest != null) {
      const d = Math.round((latest - base) * 100) / 100;
      if (d !== 0) diff = '<span style="color:' + (d > 0 ? '#16a34a' : '#dc2626') + '">（' + (d > 0 ? '+' : '') + d + '）</span>';
    }
    return '<div><span style="color:#8899b0">' + label + '：</span>基线 ' + (base != null ? base : '—') + ' → 最新 ' + (latest != null ? latest : '—') + ' ' + diff + '</div>';
  };
  h += row('访客 UV', bl ? bl.uv : null, o.latest_uv);
  h += row('浏览量 PV', bl ? bl.pv : null, o.latest_pv);
  h += row('成交单数', bl ? bl.pay_ordr_cnt : null, o.latest_ordr);
  h += row('成交金额', bl ? bl.pay_ordr_amt : null, o.latest_amt);
  if (bl && bl.stat_date) h += '<div style="color:#8899b0;margin-top:2px">基线 ' + bl.stat_date + (o.latest_stat_date ? ' · 最新 ' + o.latest_stat_date : '') + '</div>';
  h += '</div>';
  return h;
}

function paintTitleOpt(el) {
  const shopOptions = titleOptShopOptions();
  const opts = titleOptCache.opts;
  const cands = titleOptCache.candidates;

  const statusMap = {
    selected: { label: '待优化', color: '#d97706', bg: '#fef3c7' },
    optimized: { label: '已优化', color: '#16a34a', bg: '#dcfce7' },
    done: { label: '已生效', color: '#2563eb', bg: '#dbeafe' }
  };

  let h = '';
  h += '<div style="background:linear-gradient(135deg,#1e3a5f,#3b82f6);border-radius:12px;padding:14px 16px;margin:12px;color:#fff">';
  h += '<div style="font-size:15px;font-weight:700">✏️ 标题优化 · 跟踪近7天访问效果</div>';
  h += '<div style="font-size:11px;opacity:.88;margin-top:6px;line-height:1.7">规则：已有订单的商品标题不动；挑选 5 个无订单商品优化标题；优化后通过平台「近7天访问数据」对比 UV / PV / 成交变化。</div>';
  h += '</div>';

  h += '<div style="margin:0 12px 8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
  h += '<select id="to-shop" style="padding:8px 10px;border:1px solid #cdd7e5;border-radius:8px;font-size:13px;background:#fff;max-width:200px">';
  shopOptions.forEach(s => {
    h += '<option value="' + s.id + '"' + (s.id === titleOptCache.shopId ? ' selected' : '') + '>' + esc(s.name) + '</option>';
  });
  h += '</select>';
  h += '<input id="to-search" placeholder="搜索商品名/货号/ID" value="' + esc(titleOptCache.filter) + '" style="flex:1;min-width:160px;padding:8px 10px;border:1px solid #cdd7e5;border-radius:8px;font-size:13px">';
  h += '</div>';

  h += '<div style="font-size:13px;font-weight:700;color:#1e3a5f;margin:14px 12px 6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">';
  h += '<span>📋 已挑商品 · 跟踪日志（' + opts.length + '/5）</span>';
  const applyable = opts.filter(o => o.new_title && o.status !== 'done');
  if (applyable.length) {
    h += '<span style="display:flex;gap:8px;align-items:center">';
    h += '<button class="btn xs primary" onclick="titleOptApply()">🚀 执行更新（<span id="to-sel-count">0</span>）</button>';
    h += '<label style="font-size:11px;color:#5a6b85;cursor:pointer;white-space:nowrap"><input type="checkbox" id="to-sel-all" style="vertical-align:middle"> 全选</label>';
    h += '</span>';
  }
  h += '</div>';
  if (!opts.length) {
    h += '<div class="empty" style="margin:0 12px">暂无挑选商品，从下方候选列表挑选 5 个</div>';
  } else {
    opts.forEach(o => {
      const st = statusMap[o.status] || statusMap.selected;
      const applying = o.note === '执行中…';
      const hasErr = o.note && !applying;
      const applyable = o.new_title && o.status !== 'done';
      let bl = null;
      try { bl = o.baseline ? JSON.parse(o.baseline) : null; } catch (e) { bl = null; }
      h += '<div style="background:#fff;border-radius:12px;padding:12px;margin:8px 12px;box-shadow:0 1px 3px rgba(0,0,0,.05)">';
      h += '<div style="display:flex;align-items:center;margin-bottom:4px;gap:8px">';
      if (applyable) h += '<input type="checkbox" class="to-apply" value="' + o.id + '" style="flex-shrink:0;width:16px;height:16px;cursor:pointer">';
      h += '<div style="font-weight:700;color:#1e3a5f;font-size:13px;word-break:break-all;flex:1">' + esc(o.product_name || '') + '</div>';
      if (applying) h += '<span style="font-size:11px;font-weight:700;color:#92400e;background:#fed7aa;padding:2px 8px;border-radius:6px;flex-shrink:0">⏳ 执行中</span>';
      else h += '<span style="font-size:11px;font-weight:700;color:' + st.color + ';background:' + st.bg + ';padding:2px 8px;border-radius:6px;flex-shrink:0">' + st.label + '</span>';
      h += '</div>';
      if (hasErr) h += '<div style="font-size:11px;color:#dc2626;margin-bottom:4px">⚠️ ' + esc(o.note) + '</div>';
      h += '<div style="font-size:11px;color:#8899b0;margin-bottom:6px">货号 ' + esc(o.product_code || '—') + ' · ID ' + esc(o.platform_product_id) + '</div>';
      h += '<div style="font-size:12px;line-height:1.7;margin-bottom:4px">';
      h += '<div style="color:#8899b0">旧：<span style="color:#5a6b85">' + esc(o.old_title || '') + '</span></div>';
      if (o.new_title) h += '<div style="color:#8899b0">新：<span style="color:#16a34a;font-weight:600">' + esc(o.new_title) + '</span></div>';
      h += '</div>';
      h += titleOptEffectHtml(o, bl);
      h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">';
      h += '<button class="btn xs" onclick="titleOptOpenLink(\'' + esc(o.platform_product_id) + '\')">🔗 查看</button>';
      h += '<button class="btn xs" onclick="titleOptEdit(' + o.id + ')">✏️ 优化标题</button>';
      h += '<button class="btn xs" onclick="titleOptBaseline(' + o.id + ')">📸 基线快照</button>';
      if (o.new_title && o.status !== 'done') h += '<button class="btn xs primary" onclick="titleOptMarkDone(' + o.id + ')">✅ 标注生效</button>';
      h += '<button class="btn xs danger" onclick="titleOptDelete(' + o.id + ')">🗑️</button>';
      h += '</div>';
      h += '</div>';
    });
  }

  h += '<div style="font-size:13px;font-weight:700;color:#1e3a5f;margin:14px 12px 6px">🎯 候选商品（无订单 · ' + cands.length + ' 个）</div>';
  if (!cands.length) {
    h += '<div class="empty" style="margin:0 12px">无候选商品（可能已挑满或该店无订单商品已挑完）</div>';
  } else {
    h += '<div style="max-height:420px;overflow-y:auto;margin:0 12px 16px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)">';
    cands.forEach(c => {
      h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #f3f4f6">';
      h += '<div style="flex:1;min-width:0">';
      h += '<div style="font-size:12px;font-weight:600;color:#1e3a5f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(c.name) + '">' + esc(c.name) + '</div>';
      h += '<div style="font-size:11px;color:#8899b0">' + esc(c.code || '—') + ' · ' + c.sku_count + ' SKU · ID ' + esc(c.platform_product_id) + '</div>';
      h += '</div>';
      h += '<button class="btn xs primary" onclick="titleOptPick(\'' + esc(c.platform_product_id) + '\')" style="flex-shrink:0;margin-left:8px">＋挑选</button>';
      h += '</div>';
    });
    h += '</div>';
  }

  el.innerHTML = h;

  const shopSel = el.querySelector('#to-shop');
  if (shopSel) shopSel.onchange = async () => {
    titleOptCache.shopId = parseInt(shopSel.value);
    titleOptCache.filter = '';
    try { await loadTitleOptData(); } catch (e) {}
    paintTitleOpt(el);
  };
  const searchInput = el.querySelector('#to-search');
  if (searchInput) {
    searchInput.oninput = () => {
      clearTimeout(searchInput._t);
      searchInput._t = setTimeout(async () => {
        titleOptCache.filter = searchInput.value.trim();
        try { await loadTitleOptData(); } catch (e) {}
        paintTitleOpt(el);
      }, 400);
    };
  }
  const selAll = el.querySelector('#to-sel-all');
  const boxes = el.querySelectorAll('.to-apply');
  const syncSel = () => {
    const cnt = el.querySelector('#to-sel-count');
    if (cnt) cnt.textContent = [...boxes].filter(b => b.checked).length;
  };
  if (selAll) selAll.onchange = () => { boxes.forEach(b => { b.checked = selAll.checked; }); syncSel(); };
  boxes.forEach(b => { b.onchange = syncSel; });
}

async function titleOptApply() {
  const el = $('#view-titleopt');
  const boxes = [...el.querySelectorAll('.to-apply:checked')];
  if (!boxes.length) { toast('⚠️ 请先勾选要更新的商品'); return; }
  const ids = boxes.map(b => parseInt(b.value));
  const ok = await confirmDialog('确定把选中的 ' + ids.length + ' 个商品的优化标题更新到拼多多后台？', { title: '执行更新', confirmText: '更新' });
  if (!ok) return;
  try {
    const r = await api('/api/catalog/title-opt/apply', 'POST', { ids });
    if (!r.ok) { toast('❌ ' + (r.error || '失败')); return; }
    toast('🚀 已开始更新 ' + r.count + ' 个商品，约需 ' + (r.count * 30) + ' 秒…');
    await titleOptPollApply();
  } catch (e) { toast('❌ ' + e.message); }
}

async function titleOptPollApply() {
  const el = $('#view-titleopt');
  const check = async () => {
    try { await loadTitleOptData(); } catch (e) {}
    const running = titleOptCache.opts.filter(o => o.note === '执行中…');
    if (running.length) {
      paintTitleOpt(el);
      setTimeout(check, 3000);
    } else {
      paintTitleOpt(el);
      const errs = titleOptCache.opts.filter(o => o.note && o.note !== '执行中…');
      if (errs.length) toast('⚠️ 部分失败：' + errs.map(o => o.product_name + '：' + o.note).join('；'));
      else toast('✅ 全部更新完成');
    }
  };
  check();
}

async function titleOptPick(platformProductId) {
  try {
    await api('/api/catalog/title-opt', 'POST', { shop_id: titleOptCache.shopId, platform_product_id: platformProductId });
    toast('✅ 已挑选');
    await loadTitleOptData();
    paintTitleOpt($('#view-titleopt'));
  } catch (e) { toast('❌ ' + e.message); }
}

async function titleOptEdit(optId) {
  const o = titleOptCache.opts.find(x => x.id === optId);
  if (!o) return;
  const res = await promptDialog([
    { key: 'new_title', label: '新标题', value: o.new_title || '', placeholder: '输入优化后的商品标题' }
  ], { title: '优化标题' });
  if (!res) return;
  if (!res.new_title || !res.new_title.trim()) { toast('⚠️ 标题不能为空'); return; }
  try {
    await api('/api/catalog/title-opt/update', 'POST', { id: optId, new_title: res.new_title.trim(), status: 'optimized' });
    toast('✅ 已保存新标题');
    await loadTitleOptData();
    paintTitleOpt($('#view-titleopt'));
  } catch (e) { toast('❌ ' + e.message); }
}

async function titleOptBaseline(optId) {
  try {
    const r = await api('/api/catalog/title-opt/baseline', 'POST', { id: optId });
    toast(r.baseline && r.baseline.stat_date ? '✅ 已快照基线（' + r.baseline.stat_date + '）' : '⚠️ 暂无访问数据，未快照');
    await loadTitleOptData();
    paintTitleOpt($('#view-titleopt'));
  } catch (e) { toast('❌ ' + e.message); }
}

async function titleOptMarkDone(optId) {
  const ok = await confirmDialog('确认该商品新标题已在拼多多后台生效？', { title: '标注生效', confirmText: '已生效', danger: false });
  if (!ok) return;
  try {
    await api('/api/catalog/title-opt/update', 'POST', { id: optId, status: 'done' });
    toast('✅ 已标注生效');
    await loadTitleOptData();
    paintTitleOpt($('#view-titleopt'));
  } catch (e) { toast('❌ ' + e.message); }
}

async function titleOptDelete(optId) {
  const ok = await confirmDialog('确定移除这条标题优化记录？（不会改动商品标题）', { title: '移除记录', confirmText: '移除' });
  if (!ok) return;
  try {
    await api('/api/catalog/title-opt/' + optId, 'DELETE');
    toast('✅ 已移除');
    await loadTitleOptData();
    paintTitleOpt($('#view-titleopt'));
  } catch (e) { toast('❌ ' + e.message); }
}

function titleOptOpenLink(platformProductId) {
  window.open('https://mobile.yangkeduo.com/goods.html?goods_id=' + platformProductId, '_blank');
}

init();
