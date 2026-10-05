/* 电商运营工作台前端逻辑 */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n, d=2) => (n === Infinity || n === null || n === undefined || Number.isNaN(n)) ? '—' : Number(n).toLocaleString('zh-CN', {maximumFractionDigits:d, minimumFractionDigits:d});
const fmtPct = (n) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : (Number(n)*100).toFixed(2)+'%';
const todayCN = () => new Intl.DateTimeFormat('zh-CN', {dateStyle:'full'}).format(new Date());

const VIEWS = {
  dashboard: {title:'运营总览1', sub:'把资料里的经验，变成每天可执行的运营动作。'},
  guidehub: {title:'运营指南', sub:'运营方法论、平台操作、选品规划，一站查阅。'},
  guide: {title:'操作手册', sub:'从第一次打开，到每天跑完一套运营动作。'},
  products: {title:'商品投产', sub:'记录售价、毛利与广告数据，自动计算保本/目标 ROI。'},
  catalog: {title:'商品库', sub:'平台 + 电商层级真实商品数据（平台 → 店铺 → 商品 → SKU）。'},
  titleopt: {title:'标题优化', sub:'挑选无订单商品优化标题，跟踪近7天访问效果。'},
  suppliers: {title:'供应商', sub:'采购侧报价 · 供货价 / 零售价 / 商品图片，支持搜索与导入导出。'},
  knowledge: {title:'运营知识库', sub:'只保留合规、可持续的起店与推广方法论。'},
  calendar: {title:'选品日历', sub:'按月提前布局应季商品，建议提前 2-4 周预热。'},
  keywords: {title:'关键词库', sub:'储备核心词、属性词、场景词、规格词，用于标题优化与选品拓词。'},
  tasks: {title:'SOP 任务', sub:'按模块创建每日任务，落地执行并跟踪完成度。'},
  scheduler: {title:'任务调度中心', sub:'统一管理全部定时采集任务（订单/推广/商品/竞品/评价）。'},
  reviews: {title:'评价监控', sub:'全量采集商品评价（含图片/视频），差评预警与关键词复盘。'},
  douyin: {title:'抖店运营', sub:'上架 ≠ 入池。先查流量，再优化标题、核对新品标。'},
  logs: {title:'运营日志', sub:'每天一条：日期+商品+数据+结论+动作，按天集中追溯。'},
  packing: {title:'打单登记', sub:'打单人员每日登记各入口打单数量，区分平台/代发/散单。'},
  freight: {title:'运费结算', sub:'快递账单 + 订单匹配对账，三方比对（打单/订单/运费）预警。'},
  competitors: {title:'竞品监控', sub:'搜索同类商品，对比价格/销量/主图，人工确认竞品。'},
  promofinance: {title:'推广财务', sub:'各店推广账户余额 + 每日花费快照，余额告急预警。'},
  profit: {title:'盈利看板', sub:'当日净利 = 净收入 − 推广 − 商品成本 − 运费，成本按固定参数模型核算。'},
  sale: {title:'销售看板', sub:'成交订单 SKU → 品类归类，每日/每月销量与金额汇总。'},
  errors: {title:'错误处理', sub:'上架/采集/发布踩过的坑，对应处理技能 + 出现次数，遇到一次点一次。'},
  autopublish: {title:'一键上架', sub:'输入 1688 链接 → 自动抓取 → AI 生成配置 → CDP 上架到拼多多。'},
  publishedgoods: {title:'上架列表', sub:'已上架商品台账：主图/标题/SKU价格/店铺/类目/状态，一键上架成功后自动归档。'},
  aiboss: {title:'AI老板', sub:'AI 自主经营台账：选品 → 出单 → 用户下单填单号 → 独立利润记账，从 0 起算，不虚报。'},
  useradmin: {title:'用户与权限', sub:'管理员工账号，按模块勾选各员工可访问的功能。'},
};

// 可授权模块清单（权限赋予勾选用）。dashboard 运营总览 + 运营指南始终放行，不在此列。
const PERM_MODULES = [
  { key:'autopublish', name:'一键上架', icon:'🚀' },
  { key:'packing', name:'打单登记', icon:'🖨' },
  { key:'products', name:'商品投产', icon:'✚' },
  { key:'catalog', name:'商品库', icon:'📦' },
  { key:'freight', name:'运费结算', icon:'🚚' },
  { key:'competitors', name:'竞品监控', icon:'🔍' },
  { key:'titleopt', name:'标题优化', icon:'✏️' },
  { key:'suppliers', name:'供应商', icon:'🏭' },
  { key:'keywords', name:'关键词库', icon:'⌘' },
  { key:'tasks', name:'SOP任务', icon:'✔' },
  { key:'scheduler', name:'任务调度', icon:'⏰' },
  { key:'reviews', name:'评价监控', icon:'⭐' },
  { key:'logs', name:'运营日志', icon:'◷' },
  { key:'errors', name:'错误处理', icon:'⚠️' },
  { key:'publishedgoods', name:'上架列表', icon:'📋' },
  { key:'aiboss', name:'AI老板', icon:'🤖' },
  { key:'promofinance', name:'推广财务', icon:'💰' },
  { key:'profit', name:'盈利看板', icon:'📊' },
  { key:'sale', name:'销售看板', icon:'📈' },
];

// 运营指南分组（单一数据源：新增子模块只需在这里加一条，侧边栏子菜单 + 目录页自动生成）
const GUIDE_ITEMS = [
  { view:'guide', icon:'?', title:'操作手册', desc:'从第一次打开，到每天跑完一套运营动作。' },
  { view:'douyin', icon:'▶', title:'抖店运营', desc:'上架 ≠ 入池。先查流量，再优化标题、核对新品标。' },
  { view:'knowledge', icon:'◎', title:'知识库', desc:'只保留合规、可持续的起店与推广方法论。' },
  { view:'calendar', icon:'▤', title:'选品日历', desc:'按月提前布局应季商品，建议提前 2-4 周预热。' },
];

// 运营闭环全景（单一数据源：运营总览页的「运营全流程」区块按此渲染，环节 → 对应模块可点击跳转）
const FLOW_STAGES = [
  { icon:'📦', name:'选品备货', color:'#8b5cf6', steps:[
      { view:'calendar', icon:'▤', name:'选品日历', desc:'应季提前布局' },
      { view:'suppliers', icon:'🏭', name:'供应商', desc:'货源·报价·图', stat:'suppliers' },
      { view:'keywords', icon:'🔑', name:'关键词库', desc:'拓词储备', stat:'keywords' },
  ]},
  { icon:'🛒', name:'铺品上架', color:'#2563eb', steps:[
      { view:'catalog', icon:'🗂', name:'商品库', desc:'平台→店→品→SKU', stat:'catalog' },
      { view:'titleopt', icon:'✍️', name:'标题优化', desc:'选词→生成→改后台', stat:'title_opt' },
      { view:'products', icon:'💰', name:'商品投产', desc:'毛利·保本ROI', stat:'invest' },
  ]},
  { icon:'📣', name:'测款冷启动', color:'#f59e0b', steps:[
      { view:'catalog', icon:'🎯', name:'推广审计', desc:'保本投产比', stat:'promotions' },
      { view:'competitors', icon:'👀', name:'竞品监控', desc:'比价·销量', stat:'competitors' },
  ]},
  { icon:'📊', name:'数据采集', color:'#10b981', steps:[
      { view:'scheduler', icon:'⏰', name:'任务调度', desc:'定时采集', stat:'scheduler' },
      { view:'reviews', icon:'⭐', name:'评价监控', desc:'差评预警', stat:'reviews' },
  ]},
  { icon:'📈', name:'复盘迭代', color:'#ef4444', steps:[
      { view:'logs', icon:'📝', name:'运营日志', desc:'每天结论', stat:'logs' },
      { view:'freight', icon:'🚚', name:'运费对账', desc:'三方比对', stat:'freight' },
      { view:'packing', icon:'📦', name:'打单登记', desc:'各入口单量', stat:'packing' },
  ]},
];

const state = { view:'autopublish', shop:'拼多多', products:[], knowledge:[], calendar:[], templates:[], tasks:[], keywords:[], promotionHistory:[], logs:[] };

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

function getToken() { return localStorage.getItem('ecom_op_token') || ''; }

function getPerms() {
  try { return JSON.parse(localStorage.getItem('ecom_op_perms') || '["*"]'); }
  catch (e) { return ['*']; }
}
function getUserInfo() {
  try { return JSON.parse(localStorage.getItem('ecom_op_user_info') || '{}'); }
  catch (e) { return {}; }
}
function getUserRole() { return getUserInfo().role || ''; }
// 判断当前用户能否访问某视图：dashboard/运营指南始终放行，useradmin 仅管理员
function canView(view) {
  if (['dashboard','guidehub','guide','douyin','knowledge','calendar'].includes(view)) return true;
  if (view === 'useradmin') return getUserRole() === 'admin';
  const perms = getPerms();
  if (perms.includes('*')) return true;
  return perms.includes(view);
}
// 按权限过滤侧边栏导航（无权限的隐藏，admin-only 的仅管理员可见）
function applyPermFilter() {
  $$('.nav-item[data-view]').forEach(b => {
    const v = b.dataset.view;
    const adminOnly = b.dataset.adminOnly === '1';
    if (adminOnly) { b.hidden = getUserRole() !== 'admin'; return; }
    b.hidden = !canView(v);
  });
}

async function api(path, method='GET', body) {
  const opt = {method, headers:{'Content-Type':'application/json'}};
  const token = getToken();
  if (token) opt.headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined) opt.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opt);
  if (res.status === 401 && !path.includes('/auth/login')) {
    localStorage.removeItem('ecom_op_token');
    redirectLogin();
    throw new Error('未授权，请先登录');
  }
  if (!res.ok) {
    let msg = `请求失败 ${res.status}`;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch(e) {}
    throw new Error(msg);
  }
  return res.json();
}

function redirectLogin() {
  location.replace(BASE + '/login.html?v=' + Date.now());
}

function showLogin() {
  if (document.getElementById('login-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'login-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:#0f172a;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px;width:100%;max-width:340px;box-shadow:0 20px 60px rgba(0,0,0,.4)">
      <div style="font-size:20px;font-weight:700;color:#17203a;text-align:center">🔐 电商运营工作台</div>
      <div style="font-size:12px;color:#8899b0;text-align:center;margin-top:6px">账号密码登录</div>
      <input id="login-username" type="text" placeholder="账号" autocomplete="username" style="width:100%;margin-top:16px;padding:11px 14px;border:1px solid #e4e7f1;border-radius:10px;font-size:14px;box-sizing:border-box">
      <input id="login-password" type="password" placeholder="密码" autocomplete="current-password" style="width:100%;margin-top:10px;padding:11px 14px;border:1px solid #e4e7f1;border-radius:10px;font-size:14px;box-sizing:border-box">
      <button id="login-btn" style="width:100%;margin-top:14px;padding:11px;background:#2563eb;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer">登录</button>
      <div id="login-err" style="margin-top:10px;font-size:12px;color:#dc2626;text-align:center;min-height:16px"></div>
    </div>`;
  document.body.appendChild(overlay);
  const doLogin = async () => {
    const username = ($('#login-username').value || '').trim();
    const password = ($('#login-password').value || '').trim();
    if (!username || !password) return;
    try {
      const r = await fetch(BASE + '/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username, password})});
      const j = await r.json().catch(() => null);
      if (r.ok && j && j.ok) {
        localStorage.setItem('ecom_op_token', j.token);
        localStorage.setItem('ecom_op_user', (j.user && j.user.name) || username);
        localStorage.setItem('ecom_op_user_info', JSON.stringify(j.user || {}));
        localStorage.setItem('ecom_op_perms', JSON.stringify((j.user && j.user.permissions) || ['*']));
        location.reload();
      } else {
        $('#login-err').textContent = (j && j.error) || '账号或密码错误';
      }
    } catch (e) { $('#login-err').textContent = '网络错误'; }
  };
  $('#login-btn').onclick = doLogin;
  $('#login-password').onkeydown = e => { if (e.key === 'Enter') doLogin(); };
  $('#login-username').focus();
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
  // 权限拦截：无权限的视图直接拒绝（含 useradmin 仅管理员）
  if (!canView(view)) { toast('无权限访问该模块'); return; }
  state.view = view;
  setNav(view);
  $$('.view').forEach(v => v.hidden = true);
  $(`#view-${view}`).hidden = false;
  $('#page-title').textContent = VIEWS[view].title;
  $('#page-subtitle').textContent = VIEWS[view].sub;
  if (view === 'dashboard') renderDashboard();
  if (view === 'guidehub') renderGuideHub();
  if (view === 'guide') renderGuide();
  if (view === 'products') renderProducts();
  if (view === 'catalog') renderCatalog();
  if (view === 'titleopt') renderTitleOptView();
  if (view === 'suppliers') renderSuppliersView();
  if (view === 'knowledge') renderKnowledge();
  if (view === 'calendar') renderCalendar();
  if (view === 'keywords') renderKeywords();
  if (view === 'tasks') renderTasks();
  if (view === 'scheduler') renderScheduler();
  if (view === 'reviews') renderReviews();
  if (view === 'douyin') renderDouyin();
  if (view === 'logs') renderLogs();
  if (view === 'packing') renderPacking();
  if (view === 'freight') renderFreightView();
  if (view === 'competitors') renderCompetitorsView();
  if (view === 'promofinance') renderPromoFinance();
  if (view === 'profit') renderProfit();
  if (view === 'sale') renderSale();
  if (view === 'errors') renderErrors();
  if (view === 'autopublish') renderAutopublish();
  if (view === 'publishedgoods') renderPublishedGoods();
  if (view === 'aiboss') renderAiBoss();
  if (view === 'useradmin') renderUserAdmin();
}

// 错误处理：错误知识库（错误类型 → 处理技能 + 出现次数，遇到一次点一次）
async function renderErrors() {
  const el = $('#view-errors');
  el.innerHTML = '<div style="padding:24px;color:#666">加载中…</div>';
  let items = [];
  try {
    const resp = await api('/api/errors');
    items = (resp && resp.items) || [];
  } catch (e) { items = []; }

  const total = items.reduce((s, it) => s + (Number(it.count) || 0), 0);
  const rows = items.map(it => `
    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:12px;background:#fff">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-weight:700;font-size:15px">${esc(it.error_type)}</span>
            ${it.skill_name ? `<span style="background:#eef2ff;color:#4f46e5;border-radius:6px;padding:2px 8px;font-size:12px">🛠 ${esc(it.skill_name)}</span>` : ''}
          </div>
          ${it.description ? `<div style="color:#64748b;font-size:13px;margin-top:6px">现象：${esc(it.description)}</div>` : ''}
          ${it.solution ? `<div style="color:#0f766e;font-size:13px;margin-top:4px">方案：${esc(it.solution)}</div>` : ''}
          <div style="color:#94a3b8;font-size:12px;margin-top:6px">首见 ${it.first_seen || '—'} · 最近 ${it.last_seen || '—'}</div>
        </div>
        <div style="text-align:center;min-width:76px">
          <div style="font-size:28px;font-weight:800;color:${Number(it.count) > 0 ? '#dc2626' : '#94a3b8'}">${it.count || 0}</div>
          <div style="font-size:12px;color:#94a3b8">次</div>
          <button class="btn" data-hit="${it.id}" style="margin-top:6px;font-size:12px;padding:4px 10px">+1 记录</button>
        </div>
      </div>
    </div>
  `).join('');

  el.innerHTML = `
    <div style="padding:20px;max-width:1000px">
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:140px;background:#f8fafc;border-radius:12px;padding:14px">
          <div style="color:#64748b;font-size:12px">错误类型数</div>
          <div style="font-size:24px;font-weight:700;margin-top:4px">${items.length}</div>
        </div>
        <div style="flex:1;min-width:140px;background:#f8fafc;border-radius:12px;padding:14px">
          <div style="color:#64748b;font-size:12px">累计出现次数</div>
          <div style="font-size:24px;font-weight:700;margin-top:4px;color:#dc2626">${total}</div>
        </div>
        <button class="btn primary" id="err-add-btn" style="align-self:center">＋ 新增错误类型</button>
      </div>
      <div id="err-add-form" hidden style="border:1px dashed #cbd5e1;border-radius:12px;padding:16px;margin-bottom:16px;background:#f8fafc">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <input id="err-type" placeholder="错误类型（如：图片带logo被驳回）" style="padding:8px;border:1px solid #cbd5e1;border-radius:8px">
          <input id="err-skill" placeholder="对应处理技能名（如：pdd-goods-publish-cdp）" style="padding:8px;border:1px solid #cbd5e1;border-radius:8px">
          <input id="err-desc" placeholder="现象描述" style="padding:8px;border:1px solid #cbd5e1;border-radius:8px;grid-column:1/-1">
          <input id="err-solution" placeholder="处理方案" style="padding:8px;border:1px solid #cbd5e1;border-radius:8px;grid-column:1/-1">
        </div>
        <div style="margin-top:10px;display:flex;gap:8px">
          <button class="btn primary" id="err-save-btn">保存</button>
          <button class="btn" id="err-cancel-btn">取消</button>
        </div>
      </div>
      <div id="err-list">${rows || '<div class="empty">暂无错误记录，点右上角「新增错误类型」录入第一条。</div>'}</div>
    </div>
  `;

  $('#err-add-btn').onclick = () => { $('#err-add-form').hidden = false; };
  $('#err-cancel-btn').onclick = () => { $('#err-add-form').hidden = true; };
  $('#err-save-btn').onclick = async () => {
    const error_type = $('#err-type').value.trim();
    if (!error_type) { toast('请填错误类型'); return; }
    const body = {
      error_type,
      skill_name: $('#err-skill').value.trim(),
      description: $('#err-desc').value.trim(),
      solution: $('#err-solution').value.trim(),
    };
    const resp = await api('/api/errors', 'POST', body);
    if (resp && resp.ok) { toast('已保存'); renderErrors(); } else { toast((resp && resp.error) || '保存失败'); }
  };
  $$('#err-list [data-hit]').forEach(btn => btn.onclick = async () => {
    const resp = await api('/api/errors', 'POST', { action: 'hit', id: Number(btn.dataset.hit) });
    if (resp && resp.ok) { toast('已记录 +1'); renderErrors(); } else { toast('记录失败'); }
  });
}

// 一键上架：输入 1688 链接 → 抓取 → AI 配置 → CDP 上架，实时进度流
let apTimer = null;
async function renderAutopublish() {
  const el = $('#view-autopublish');
  el.innerHTML = `
    <div style="padding:20px;max-width:1100px">
      <div id="cdp-instances" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-weight:700;font-size:15px">🖥️ CDP 实例</div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn" id="cdp-refresh-btn" style="padding:7px 14px;font-size:12px">刷新状态</button>
            <button class="btn" id="cdp-restart-all-btn" style="padding:7px 14px;font-size:12px">全部重启</button>
          </div>
        </div>
        <div style="color:#64748b;font-size:12px;margin-bottom:10px">CDP 是自动化上架/抓取的浏览器实例。上架报 <code>ECONNREFUSED</code> 或「抓取失败」多半是实例挂了，点「重启」恢复（登录态保存在独立 profile，重启不丢）。</div>
        <div id="cdp-list" style="display:flex;gap:10px;flex-wrap:wrap">
          <div class="empty" style="color:#94a3b8">加载中…</div>
        </div>
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin-bottom:16px">
        <div style="font-weight:700;font-size:15px;margin-bottom:4px">🚀 一键上架</div>
        <div style="color:#64748b;font-size:13px;margin-bottom:12px">粘贴 1688 商品链接，自动跑完「抓取 → AI 生成配置 → CDP 上架拼多多」全流程，实时看进度。</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <input id="ap-url" placeholder="https://detail.1688.com/offer/xxxxx.html 或 qr.1688.com/s/xxx 短链" style="flex:1;min-width:280px;padding:11px 14px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px">
          <select id="ap-shop" style="padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px;background:#fff">
            <option value="5">嘉裕工艺品(9232)</option>
            <option value="3">如若月下(9230)</option>
            <option value="1">闲时来(9234)</option>
            <option value="6">欧世艺(9228)</option>
          </select>
          <button class="btn primary" id="ap-start-btn" style="padding:11px 22px;font-size:14px">开始上架</button>
        </div>
        <div style="display:flex;gap:14px;align-items:center;margin-top:12px;flex-wrap:wrap;font-size:13px;color:#475569">
          <span style="font-weight:600;color:#334155">价格体系：</span>
          <select id="ap-scheme-select" style="padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-family:inherit;background:#fff;color:#334155;font-weight:600;max-width:180px"></select>
          <button class="btn" id="ap-scheme-manage" style="padding:6px 12px;font-size:12px;background:#fff;color:#2563eb;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;white-space:nowrap">⚙️ 管理</button>
          <span id="ap-price-formula" style="font-weight:600;color:#334155">拼单价 = (进价+运费) ÷ (1 − 利润率 − 1÷投产比 − 售后率)</span>
          <label style="display:flex;align-items:center;gap:5px">利润率 <input id="ap-profit" type="number" value="20" step="1" min="1" max="90" style="width:56px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px">%</label>
          <label id="ap-roi-label" style="display:flex;align-items:center;gap:5px">投产比 <input id="ap-roi" type="number" value="2" step="0.1" min="1.1" style="width:56px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px"></label>
          <label style="display:flex;align-items:center;gap:5px">售后率 <input id="ap-aftersale" type="number" value="5" step="1" min="0" max="50" style="width:56px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px">%</label>
          <label style="display:flex;align-items:center;gap:5px">运费 <input id="ap-freight" type="number" value="3" step="0.5" min="0" style="width:56px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px">元</label>
          <label style="display:flex;align-items:center;gap:5px">单买倍数 <input id="ap-danmai" type="number" value="1.5" step="0.1" min="1" style="width:56px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px"></label>
          <span id="ap-price-preview" style="color:#2563eb;font-size:12px;font-weight:600"></span>
          <button class="btn" id="ap-pricing-save" style="padding:7px 14px;font-size:13px;background:#16a34a;color:#fff;border:none;border-radius:8px;cursor:pointer;white-space:nowrap">💾 保存定价参数</button>
        </div>
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin-bottom:16px">
        <div style="font-weight:700;font-size:15px;margin-bottom:4px">📦 批量上架</div>
        <div style="color:#64748b;font-size:13px;margin-bottom:12px">每行一个 1688 链接/口令，勾选目标店铺，一次批量上架到多家店铺（同店自动排队，不同店并行）。</div>
        <textarea id="ap-batch-urls" rows="5" placeholder="每行一个链接/口令，可粘贴多个&#10;https://detail.1688.com/offer/xxxxx.html&#10;qr.1688.com/s/xxx" style="width:100%;padding:11px 14px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px;box-sizing:border-box;resize:vertical;font-family:inherit;line-height:1.6"></textarea>
        <div style="margin-top:12px;display:flex;gap:16px;flex-wrap:wrap;align-items:center">
          <span style="font-size:13px;color:#475569;font-weight:600">目标店铺：</span>
          <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer"><input type="checkbox" class="ap-batch-shop" value="5" checked> 嘉裕</label>
          <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer"><input type="checkbox" class="ap-batch-shop" value="3" checked> 如若月下</label>
          <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer"><input type="checkbox" class="ap-batch-shop" value="1" checked> 闲时来</label>
          <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer"><input type="checkbox" class="ap-batch-shop" value="6" checked> 欧世艺</label>
        </div>
        <div style="margin-top:12px;display:flex;align-items:center">
          <button class="btn primary" id="ap-batch-btn" style="padding:11px 22px;font-size:14px">开始批量上架</button>
          <span style="color:#94a3b8;font-size:12px;margin-left:10px">定价复用上方参数</span>
        </div>
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="toggleCategoryMap()">
          <div style="font-weight:700;font-size:15px">🗂️ 类目匹配表 <span id="category-map-count" style="font-size:12px;color:#94a3b8;font-weight:400"></span></div>
          <span id="category-map-toggle-icon" style="color:#94a3b8;font-size:12px">展开 ▼</span>
        </div>
        <div id="category-map-body" style="display:none;margin-top:12px">
          <div style="color:#64748b;font-size:13px;margin-bottom:12px">1688 标题关键词 → 拼多多真实类目。AI 猜错类目时按此表自动修正（命中顺序从上到下，靠前的优先）。</div>
          <div id="category-map-list"><div class="empty" style="color:#94a3b8">加载中…</div></div>
        </div>
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="toggleBannedWords()">
          <div style="font-weight:700;font-size:15px">🚫 标题禁词表 <span id="banned-count" style="font-size:12px;color:#94a3b8;font-weight:400"></span></div>
          <span id="banned-toggle-icon" style="color:#94a3b8;font-size:12px">展开 ▼</span>
        </div>
        <div style="color:#64748b;font-size:13px;margin:4px 0 0">上架拼多多前，标题里这些词会被自动剔除（平台词/违规营销词）。</div>
        <div id="banned-words-body" style="display:none;margin-top:12px">
          <div style="display:flex;gap:8px;margin-bottom:12px">
            <input id="banned-word-input" placeholder="新增禁词，如：全网最低" style="flex:1;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-family:inherit">
            <button class="btn primary" onclick="addBannedWord()" style="padding:8px 16px;font-size:13px;white-space:nowrap">添加</button>
          </div>
          <div id="banned-words-list"><div class="empty" style="color:#94a3b8">加载中…</div></div>
        </div>
      </div>

      <div id="ap-current" style="margin-bottom:16px"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <div style="font-weight:700;font-size:14px;color:#334155">历史任务 <span id="ap-total" style="font-size:12px;color:#94a3b8;font-weight:400"></span></div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#64748b;cursor:pointer"><input type="checkbox" id="ap-check-all" style="accent-color:#2563eb"> 全选可重上架</label>
          <button class="btn mini" id="ap-batch-repub-btn" style="padding:5px 12px;font-size:12px;background:#dc2626;color:#fff;border:none;border-radius:6px;cursor:pointer;white-space:nowrap">批量重新生成</button>
          <button class="btn mini" id="ap-user-mgr-btn" style="padding:5px 12px;font-size:12px;background:#475569;color:#fff;border:none;border-radius:6px;cursor:pointer;white-space:nowrap">👥 用户管理</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <input id="ap-filter-kw" placeholder="搜索标题/商品/链接" style="flex:1;min-width:160px;padding:7px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-family:inherit">
        <select id="ap-filter-status" style="padding:7px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-family:inherit;background:#fff">
          <option value="">全部状态</option>
          <option value="failed">失败</option>
          <option value="published">已上架</option>
          <option value="submitted">待审核</option>
          <option value="draft">草稿</option>
          <option value="publishing">上架中</option>
          <option value="queued">排队</option>
          <option value="crawling">抓取中</option>
        </select>
        <select id="ap-filter-shop" style="padding:7px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-family:inherit;background:#fff">
          <option value="">全部店铺</option>
          <option value="6">欧世艺</option>
          <option value="5">嘉裕</option>
          <option value="3">如若月下</option>
          <option value="1">闲时来</option>
        </select>
        <input id="ap-filter-supplier" placeholder="货源店铺名(1688)" style="width:180px;padding:7px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-family:inherit">
        <button class="btn mini" id="ap-filter-btn" style="padding:7px 14px;font-size:13px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;white-space:nowrap">搜索</button>
        <button class="btn mini" id="ap-filter-reset" style="padding:7px 12px;font-size:13px;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;white-space:nowrap">重置</button>
      </div>
      <div id="ap-list"><div class="empty" style="color:#94a3b8">暂无任务，输入链接点「开始上架」。</div></div>
      <div id="ap-pagination" style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:12px"></div>
    </div>
  `;

  // 价格体系列表（动态，从后端加载）
  let schemesCache = [];
  let currentSchemeId = null;

  const currentScheme = () => schemesCache.find(s => String(s.id) === String(currentSchemeId)) || schemesCache[0] || null;

  // 当前体系名字（用于任务记录 price_mode）
  const getPriceMode = () => {
    const s = currentScheme();
    return s ? s.name : '推广价';
  };

  // 从输入框读取当前参数
  const readPricingInputs = () => {
    const s = currentScheme();
    return {
      scheme_id: currentSchemeId,
      scheme_name: (s || {}).name || '',
      profit_rate: Number($('#ap-profit').value) || 20,
      roi: Number($('#ap-roi').value) || 0,
      aftersale_rate: Number($('#ap-aftersale').value) || 5,
      freight: Number($('#ap-freight').value) || 3,
      danmai_mult: Number($('#ap-danmai').value) || 1.5,
    };
  };

  // 把某体系参数写入输入框
  const applyScheme = (s) => {
    if (!s) return;
    currentSchemeId = s.id;
    $('#ap-profit').value = s.profit_rate;
    $('#ap-roi').value = (s.roi != null && s.roi > 0) ? s.roi : 0;
    $('#ap-aftersale').value = s.aftersale_rate;
    $('#ap-freight').value = s.freight;
    $('#ap-danmai').value = s.danmai_mult;
    updatePricePreview();
  };

  // 实时预览定价倍率：roi>0 推广型，roi=0 平卖型
  const updatePricePreview = () => {
    const profit = (Number($('#ap-profit').value) || 20) / 100;
    const roi = Number($('#ap-roi').value) || 0;
    const aftersale = (Number($('#ap-aftersale').value) || 5) / 100;
    const freight = Number($('#ap-freight').value) || 3;
    const isPromo = roi > 0;
    const denom = isPromo ? (1 - profit - 1 / roi - aftersale) : (1 - profit - aftersale);
    const k = denom > 0.05 ? (1 / denom) : 0;
    const roiLabel = $('#ap-roi-label');
    if (roiLabel) roiLabel.style.display = isPromo ? '' : 'none';
    const formulaEl = $('#ap-price-formula');
    if (formulaEl) {
      formulaEl.textContent = isPromo
        ? '拼单价 = (进价+运费) ÷ (1 − 利润率 − 1÷投产比 − 售后率)'
        : '拼单价 = (进价+运费) ÷ (1 − 利润率 − 售后率)';
    }
    const el = $('#ap-price-preview');
    if (el) {
      if (k > 0) {
        const sample = ((1 + freight) * k).toFixed(1);
        el.textContent = `→ 倍率 ${k.toFixed(2)}（进价1元+运费${freight}元 → 拼单价${sample}元）`;
      } else {
        el.textContent = isPromo
          ? '⚠️ 利润率+1/投产比+售后率 ≥ 1，无法定价'
          : '⚠️ 利润率+售后率 ≥ 1，无法定价';
      }
    }
  };

  ['ap-profit', 'ap-roi', 'ap-aftersale', 'ap-freight', 'ap-danmai'].forEach(id => {
    const inp = $('#' + id);
    if (inp) inp.oninput = updatePricePreview;
  });

  // 加载价格体系列表 + 选中默认体系
  const loadSchemes = async () => {
    try {
      const resp = await api('/api/pricing/schemes');
      schemesCache = (resp && resp.items) || [];
    } catch (e) { schemesCache = []; }
    if (!schemesCache.length) {
      schemesCache = [{ id: 1, name: '推广价', profit_rate: 20, roi: 2, aftersale_rate: 5, freight: 3, danmai_mult: 1.5, is_default: 1 }];
    }
    const sel = $('#ap-scheme-select');
    if (sel) {
      sel.innerHTML = schemesCache.map(s => `<option value="${s.id}">${esc(s.name)}${s.is_default ? '（默认）' : ''}</option>`).join('');
      sel.onchange = () => {
        const s = schemesCache.find(x => String(x.id) === sel.value);
        if (s) applyScheme(s);
      };
    }
    const def = schemesCache.find(s => s.is_default) || schemesCache[0];
    if (def) {
      applyScheme(def);
      if (sel) sel.value = String(def.id);
    }
  };

  // 保存当前体系参数（更新到 pricing_schemes）
  const saveBtn = $('#ap-pricing-save');
  if (saveBtn) saveBtn.onclick = async () => {
    const cur = currentScheme();
    if (!cur) { toast('请先选择价格体系'); return; }
    const body = {
      name: cur.name,
      profit_rate: Number($('#ap-profit').value) || 20,
      roi: Number($('#ap-roi').value) || 0,
      aftersale_rate: Number($('#ap-aftersale').value) || 5,
      freight: Number($('#ap-freight').value) || 3,
      danmai_mult: Number($('#ap-danmai').value) || 1.5,
    };
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中…';
    try {
      const resp = await api(`/api/pricing/schemes/${cur.id}`, 'PUT', body);
      if (resp && resp.ok) { toast(`「${cur.name}」参数已保存`); await loadSchemes(); }
      else toast((resp && resp.error) || '保存失败');
    } catch (e) { toast('保存失败: ' + e.message); }
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 保存定价参数';
  };

  // ===== 价格体系管理弹窗 =====
  const renderSchemeList = () => {
    const list = $('#sm-list');
    if (!list) return;
    list.innerHTML = schemesCache.map(s => `
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:10px;background:${s.is_default ? '#f0f9ff' : '#fff'}">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <div style="min-width:0">
            <span style="font-weight:700;font-size:14px;color:#17203a">${esc(s.name)}</span>
            ${s.is_default ? '<span style="font-size:11px;color:#2563eb;font-weight:600;margin-left:6px">● 默认</span>' : ''}
            <div style="font-size:12px;color:#66708a;margin-top:3px">利润率 ${s.profit_rate}% ${s.roi > 0 ? `· 投产比 ${s.roi}` : '· 平卖(无投产比)'} · 售后 ${s.aftersale_rate}% · 运费 ${s.freight}元 · 单买 ${s.danmai_mult}倍</div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0">
            <button data-sm-edit="${s.id}" style="padding:5px 12px;font-size:12px;background:#fff;color:#2563eb;border:1px solid #bfdbfe;border-radius:6px;cursor:pointer">编辑</button>
            <button data-sm-del="${s.id}" style="padding:5px 12px;font-size:12px;background:#fff;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;cursor:pointer">删除</button>
          </div>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('[data-sm-edit]').forEach(b => b.onclick = () => editScheme(schemesCache.find(s => String(s.id) === b.dataset.smEdit)));
    list.querySelectorAll('[data-sm-del]').forEach(b => b.onclick = () => deleteScheme(schemesCache.find(s => String(s.id) === b.dataset.smDel)));
  };

  const editScheme = async (s) => {
    const isNew = !s;
    const fields = [
      { key: 'name', label: '体系名称', value: s ? s.name : '', placeholder: '如：清仓价 / 活动价' },
      { key: 'profit_rate', label: '利润率（%）', value: s ? String(s.profit_rate) : '20' },
      { key: 'roi', label: '投产比（0=平卖价，不含广告费）', value: s ? String(s.roi) : '2' },
      { key: 'aftersale_rate', label: '售后率（%）', value: s ? String(s.aftersale_rate) : '5' },
      { key: 'freight', label: '运费（元）', value: s ? String(s.freight) : '3' },
      { key: 'danmai_mult', label: '单买倍数', value: s ? String(s.danmai_mult) : '1.5' },
      { key: 'is_default', label: '设为默认', type: 'select', value: s && s.is_default ? '1' : '0', options: [{ value: '0', label: '否' }, { value: '1', label: '是' }] },
    ];
    const result = await promptDialog(fields, { title: isNew ? '新增价格体系' : `修改「${s.name}」` });
    if (!result) return;
    const body = {
      name: result.name,
      profit_rate: Number(result.profit_rate) || 20,
      roi: Number(result.roi) || 0,
      aftersale_rate: Number(result.aftersale_rate) || 5,
      freight: Number(result.freight) || 3,
      danmai_mult: Number(result.danmai_mult) || 1.5,
      is_default: Number(result.is_default) || 0,
    };
    try {
      const resp = isNew
        ? await api('/api/pricing/schemes', 'POST', body)
        : await api(`/api/pricing/schemes/${s.id}`, 'PUT', body);
      if (resp && resp.ok) { toast(isNew ? '已新增' : '已保存'); await loadSchemes(); renderSchemeList(); }
      else toast((resp && resp.error) || '操作失败');
    } catch (e) { toast('操作失败: ' + e.message); }
  };

  const deleteScheme = async (s) => {
    if (!s) return;
    const ok = await confirmDialog(`确定删除「${s.name}」吗？`, { title: '删除价格体系', confirmText: '删除', danger: true });
    if (!ok) return;
    try {
      const resp = await api(`/api/pricing/schemes/${s.id}`, 'DELETE', {});
      if (resp && resp.ok) { toast('已删除'); await loadSchemes(); renderSchemeList(); }
      else toast((resp && resp.error) || '删除失败');
    } catch (e) { toast('删除失败: ' + e.message); }
  };

  const renderSchemeManager = () => {
    const existing = document.getElementById('scheme-manager-modal');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'scheme-manager-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:999;display:flex;align-items:center;justify-content:center;padding:24px';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:16px;padding:22px;max-width:640px;width:100%;max-height:82vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.22)';
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:16px;font-weight:700;color:#17203a">⚙️ 价格体系管理</div>
        <button id="sm-close" style="border:none;background:none;font-size:22px;cursor:pointer;color:#94a3b8;line-height:1">✕</button>
      </div>
      <div id="sm-list"></div>
      <button id="sm-add" style="width:100%;padding:10px;font-size:13px;background:#f8fafc;color:#2563eb;border:1px dashed #cbd5e1;border-radius:10px;cursor:pointer;margin-top:4px">＋ 新增价格体系</button>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    box.querySelector('#sm-close').onclick = () => overlay.remove();
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    box.querySelector('#sm-add').onclick = () => editScheme(null);
    renderSchemeList();
  };

  const manageBtn = $('#ap-scheme-manage');
  if (manageBtn) manageBtn.onclick = () => renderSchemeManager();

  updatePricePreview();
  loadSchemes();

  // ===== CDP 实例状态卡片 =====
  const renderCdpList = (instances) => {
    const box = $('#cdp-list');
    if (!box) return;
    if (!instances || !instances.length) {
      box.innerHTML = '<div class="empty" style="color:#94a3b8">无实例</div>';
      return;
    }
    box.innerHTML = instances.map(c => {
      const dot = c.alive ? '🟢' : '🔴';
      const stateColor = c.alive ? '#16a34a' : '#dc2626';
      const stateText = c.alive ? '在线' : '离线';
      return `<div style="border:1px solid ${c.alive ? '#e2e8f0' : '#fecaca'};border-radius:10px;padding:12px;min-width:180px;flex:1;background:${c.alive ? '#fff' : '#fef2f2'}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-weight:700;font-size:14px">${dot} ${c.label}</span>
          <span style="font-size:12px;color:${stateColor};font-weight:600">${stateText}</span>
        </div>
        <div style="font-size:12px;color:#64748b;line-height:1.5">
          <div>端口 <code>${c.port}</code>${c.pid ? ' · PID ' + c.pid : ''}</div>
          <div>${c.role}</div>
        </div>
        <button class="btn ${c.alive ? '' : 'primary'}" data-cdp-restart="${c.port}" style="margin-top:8px;padding:5px 12px;font-size:12px;width:100%">${c.alive ? '重启' : '启动'}</button>
      </div>`;
    }).join('');
    // 绑定重启按钮
    box.querySelectorAll('[data-cdp-restart]').forEach(btn => {
      btn.onclick = async () => {
        const port = Number(btn.dataset.cdpRestart);
        btn.disabled = true;
        btn.textContent = '重启中…';
        try {
          const resp = await api('/api/cdp/restart', 'POST', { port });
          if (resp && resp.ok) {
            toast(`${resp.label} 已${resp.alive ? '重启成功' : '启动（端口未就绪，稍后刷新确认）'}`);
          } else {
            toast((resp && resp.message) || '重启失败');
          }
        } catch (e) {
          toast('重启失败: ' + e.message);
        }
        await loadCdpStatus();
      };
    });
  };
  const loadCdpStatus = async () => {
    try {
      const resp = await api('/api/cdp/status');
      renderCdpList(resp && resp.instances);
    } catch (e) {
      const box = $('#cdp-list');
      if (box) box.innerHTML = `<div class="empty" style="color:#dc2626">加载失败: ${e.message}</div>`;
    }
  };
  const btnRefresh = $('#cdp-refresh-btn');
  if (btnRefresh) btnRefresh.onclick = loadCdpStatus;
  const btnRestartAll = $('#cdp-restart-all-btn');
  if (btnRestartAll) btnRestartAll.onclick = async () => {
    btnRestartAll.disabled = true;
    btnRestartAll.textContent = '重启中…';
    try {
      const resp = await api('/api/cdp/status');
      const insts = (resp && resp.instances) || [];
      for (const c of insts) {
        await api('/api/cdp/restart', 'POST', { port: c.port });
      }
      toast(`已依次重启 ${insts.length} 个实例`);
    } catch (e) {
      toast('全部重启失败: ' + e.message);
    }
    btnRestartAll.disabled = false;
    btnRestartAll.textContent = '全部重启';
    await loadCdpStatus();
  };
  loadCdpStatus();
  loadCategoryMap();
  loadBannedWords();

  $('#ap-start-btn').onclick = async () => {
    if ($('#ap-start-btn').disabled) return;  // 双保险：禁用时忽略点击，防重复提交
    const url = $('#ap-url').value.trim();
    if (!url) { toast('请先粘贴 1688 链接'); return; }
    const shop_id = Number($('#ap-shop').value) || 5;
    const pricing = {
      price_mode: getPriceMode(),
      profit_rate: (Number($('#ap-profit').value) || 20) / 100,
      roi: Number($('#ap-roi').value) || 0,
      aftersale_rate: (Number($('#ap-aftersale').value) || 5) / 100,
      freight: Number($('#ap-freight').value) || 3,
      danmai_mult: Number($('#ap-danmai').value) || 1.5,
    };
    $('#ap-start-btn').disabled = true;
    $('#ap-start-btn').textContent = '提交中…';
    try {
      const resp = await api('/api/autopublish', 'POST', { url, shop_id, pricing });
      if (resp && resp.task && resp.task.id) {
        $('#ap-url').value = '';
        startApPolling(resp.task.id);
        toast(`任务 #${resp.task.id} 已启动，自动上架中…`);
        // 滚动到任务卡片，让用户直接看到实时进度
        const cur = $('#ap-current');
        if (cur) cur.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // 按钮保持禁用，任务结束(published/failed)后在 startApPolling 里恢复
      } else {
        toast((resp && resp.error) || '提交失败');
        $('#ap-start-btn').disabled = false;
        $('#ap-start-btn').textContent = '开始上架';
      }
    } catch (e) {
      toast(e.message);
      $('#ap-start-btn').disabled = false;
      $('#ap-start-btn').textContent = '开始上架';
    }
  };

  // 批量上架：多行链接 × 多店铺，一次创建 url×shop 任务清单
  $('#ap-batch-btn').onclick = async () => {
    if ($('#ap-batch-btn').disabled) return;
    const text = $('#ap-batch-urls').value.trim();
    if (!text) { toast('请粘贴至少一个 1688 链接'); return; }
    const shop_ids = [...document.querySelectorAll('.ap-batch-shop:checked')].map(c => Number(c.value));
    if (!shop_ids.length) { toast('请至少勾选一个店铺'); return; }
    const pricing = {
      is_batch: true,
      price_mode: getPriceMode(),
      profit_rate: (Number($('#ap-profit').value) || 20) / 100,
      roi: Number($('#ap-roi').value) || 0,
      aftersale_rate: (Number($('#ap-aftersale').value) || 5) / 100,
      freight: Number($('#ap-freight').value) || 3,
      danmai_mult: Number($('#ap-danmai').value) || 1.5,
    };
    $('#ap-batch-btn').disabled = true;
    $('#ap-batch-btn').textContent = '创建中…';
    try {
      const resp = await api('/api/autopublish/batch', 'POST', { text, shop_ids, pricing });
      if (resp && resp.ok) {
        $('#ap-batch-urls').value = '';
        toast(`已创建 ${resp.count} 个任务（${resp.urls} 链接 × ${resp.shops} 店铺），自动上架中…`);
        loadApList();
      } else {
        toast((resp && resp.error) || '批量创建失败');
      }
    } catch (e) {
      toast(e.message);
    } finally {
      $('#ap-batch-btn').disabled = false;
      $('#ap-batch-btn').textContent = '开始批量上架';
    }
  };

  await loadApList();
  startApListPolling();

  // 全选可重上架 + 批量重新生成
  const checkAll = $('#ap-check-all');
  if (checkAll) checkAll.onchange = () => {
    [...document.querySelectorAll('.ap-task-check:not(:disabled)')].forEach(c => { c.checked = checkAll.checked; if (checkAll.checked) _apSelected.add(String(c.value)); else _apSelected.delete(String(c.value)); });
  };
  const batchBtn = $('#ap-batch-repub-btn');
  if (batchBtn) batchBtn.onclick = batchRepublish;
  const userMgrBtn = $('#ap-user-mgr-btn');
  if (userMgrBtn) userMgrBtn.onclick = () => setView('useradmin');
  // 历史任务搜索筛选 + 分页
  const applyFilter = () => {
    _apKeyword = ($('#ap-filter-kw') && $('#ap-filter-kw').value || '').trim();
    _apStatus = $('#ap-filter-status') ? $('#ap-filter-status').value : '';
    _apShopId = $('#ap-filter-shop') ? $('#ap-filter-shop').value : '';
    _apSupplierName = ($('#ap-filter-supplier') && $('#ap-filter-supplier').value || '').trim();
    _apPage = 1;
    loadApList();
  };
  const filterBtn = $('#ap-filter-btn');
  if (filterBtn) filterBtn.onclick = applyFilter;
  const kwInput = $('#ap-filter-kw');
  if (kwInput) kwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFilter(); });
  const supplierInput = $('#ap-filter-supplier');
  if (supplierInput) supplierInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFilter(); });
  const resetBtn = $('#ap-filter-reset');
  if (resetBtn) resetBtn.onclick = () => {
    if ($('#ap-filter-kw')) $('#ap-filter-kw').value = '';
    if ($('#ap-filter-status')) $('#ap-filter-status').value = '';
    if ($('#ap-filter-shop')) $('#ap-filter-shop').value = '';
    if ($('#ap-filter-supplier')) $('#ap-filter-supplier').value = '';
    _apKeyword = ''; _apStatus = ''; _apShopId = ''; _apSupplierName = ''; _apPage = 1;
    loadApList();
  };
}

const AP_STAGE = { scrape:'抓取1688', ai:'AI生成配置', publish:'CDP上架' };
const AP_STATUS = { running:'⏳', done:'✅', failed:'❌' };

function startApPolling(taskId) {
  if (apTimer) clearInterval(apTimer);
  const poll = async () => {
    try {
      const t = await api(`/api/autopublish/${taskId}`);
      renderApCurrent(t);
      if (['published', 'failed'].includes(t.status)) {
        clearInterval(apTimer); apTimer = null; loadApList();
        // 任务结束，恢复「开始上架」按钮
        const btn = $('#ap-start-btn');
        if (btn) { btn.disabled = false; btn.textContent = '开始上架'; }
      }
    } catch (e) {}
  };
  poll();
  apTimer = setInterval(poll, 2500);
}

function renderApCurrent(t) {
  const el = $('#ap-current');
  if (!el) return;
  const logs = (t.log || []);
  const steps = logs.map((l, i) => {
    const stage = AP_STAGE[l.stage] || l.stage;
    const ic = AP_STATUS[l.status] || '•';
    const color = l.status === 'failed' ? '#dc2626' : (l.status === 'done' ? '#16a34a' : '#2563eb');
    return `<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #f1f5f9">
      <span style="font-size:14px">${ic}</span>
      <div style="flex:1">
        <span style="font-weight:600;color:${color}">${stage}</span>
        <span style="color:#94a3b8;font-size:12px;margin-left:8px">${esc(l.ts || '')}</span>
        <div style="color:#475569;font-size:13px;margin-top:2px">${esc(l.msg)}</div>
      </div>
    </div>`;
  }).join('');
  const statusTag = { queued:'排队中', crawling:'抓取中', ai:'AI配置中', publishing:'上架中', published:'✅ 已上架', failed:'❌ 失败' }[t.status] || t.status;
  // publish 阶段实时细粒度进度（后端读 config.publish.log 解析出的 [N/8] 步骤）
  const pp = t.publish_progress;
  let ppHtml = '';
  if (pp && pp.step) {
    const pct = Math.round(pp.step / 8 * 100);
    const ppLines = (pp.lines || []).map(l => esc(l)).join('<br>');
    ppHtml = `
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:12px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-weight:700;font-size:14px;color:#0369a1">🔄 正在${esc(pp.step_name)}</div>
        <div style="font-size:12px;color:#0284c7;font-weight:600">${pp.step}/8</div>
      </div>
      <div style="height:6px;background:#e0f2fe;border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#0284c7,#38bdf8);border-radius:3px;transition:width .5s"></div>
      </div>
      ${ppLines ? `<div style="margin-top:8px;font-size:11px;color:#475569;font-family:ui-monospace,monospace;line-height:1.7;max-height:120px;overflow-y:auto">${ppLines}</div>` : ''}
    </div>`;
  }
  el.innerHTML = `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-weight:700;font-size:15px">任务 #${t.id} <span style="color:#2563eb;font-size:13px;margin-left:6px">${statusTag}</span></div>
        <div style="color:#94a3b8;font-size:12px">${esc(t.raw_title || '')}</div>
      </div>
      ${t.ai_title ? `<div style="background:#f0f9ff;border-radius:8px;padding:10px;margin-bottom:10px;font-size:13px;color:#075985">AI 标题：${esc(t.ai_title)}</div>` : ''}
      ${t.pdd_goods_id ? `<div style="background:#f0fdf4;border-radius:8px;padding:10px;margin-bottom:10px;font-size:13px;color:#166534">商品ID：${esc(t.pdd_goods_id)}</div>` : ''}
      ${t.error ? `<div style="background:#fef2f2;border-radius:8px;padding:10px;margin-bottom:10px;font-size:13px;color:#b91c1c">${esc(t.error)}</div>` : ''}
      ${ppHtml}
      ${steps || '<div style="color:#94a3b8">等待启动…</div>'}
    </div>
  `;
}

function toggleCategoryMap() {
  const body = $('#category-map-body');
  const icon = $('#category-map-toggle-icon');
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  if (icon) icon.textContent = isHidden ? '收起 ▲' : '展开 ▼';
  if (isHidden) loadCategoryMap();
}

async function loadCategoryMap() {
  const el = $('#category-map-list');
  const cnt = $('#category-map-count');
  let items = [];
  try {
    const resp = await api('/api/category-map');
    items = (resp && resp.items) || [];
  } catch (e) { items = []; }
  if (cnt) cnt.textContent = items.length ? `（${items.length} 条）` : '';
  if (!el) return;
  // 折叠时不渲染列表（展开时才渲染），节省资源
  const body = $('#category-map-body');
  if (body && body.style.display === 'none') return;
  if (!items.length) { el.innerHTML = '<div class="empty" style="color:#94a3b8">无映射。</div>'; return; }
  el.innerHTML = items.map((m, i) => `
    <div style="display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
      <span style="width:24px;color:#94a3b8;text-align:center;flex-shrink:0">${i + 1}</span>
      <span style="width:80px;flex-shrink:0"><code style="background:#f1f5f9;padding:2px 7px;border-radius:5px;color:#334155">${esc(m.keyword)}</code></span>
      <span style="color:#94a3b8;flex-shrink:0">→</span>
      <span style="flex:1;color:#475569">${esc(m.category_path)}</span>
      <span style="flex-shrink:0;background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:5px;font-weight:600">${esc(m.category_keyword)}</span>
      ${m.source === 'learned' ? `<span style="flex-shrink:0;background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:5px;font-weight:600">自动学习${m.hit_count ? '×'+m.hit_count : ''}</span>` : ''}
    </div>`).join('');
}

function toggleBannedWords() {
  const body = $('#banned-words-body');
  const icon = $('#banned-toggle-icon');
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  if (icon) icon.textContent = isHidden ? '收起 ▲' : '展开 ▼';
  if (isHidden) loadBannedWords();
}

async function loadBannedWords() {
  const el = $('#banned-words-list');
  const cnt = $('#banned-count');
  let items = [];
  try {
    const resp = await api('/api/title-banned-words');
    items = (resp && resp.items) || [];
  } catch (e) { items = []; }
  if (cnt) cnt.textContent = items.length ? `（${items.length} 个）` : '';
  if (el) {
    if (!items.length) { el.innerHTML = '<div class="empty" style="color:#94a3b8">暂无禁词。</div>'; }
    else {
      el.innerHTML = items.map(w => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 12px;border:1px solid #f1f5f9;border-radius:8px;margin-bottom:6px;background:#fafafa">
          <code style="background:#fff;padding:2px 9px;border-radius:5px;color:#b91c1c;font-size:13px">${esc(w.word)}</code>
          <button onclick="removeBannedWord(${w.id})" style="background:none;border:none;color:#cbd5e1;cursor:pointer;font-size:16px;line-height:1" title="删除">✕</button>
        </div>`).join('');
    }
  }
}

async function addBannedWord() {
  const input = $('#banned-word-input');
  const word = (input && input.value || '').trim();
  if (!word) { toast('请输入禁词'); return; }
  try {
    await api('/api/title-banned-words', 'POST', { word });
    if (input) input.value = '';
    loadBannedWords();
  } catch (e) { toast('添加失败：' + (e.message || e)); }
}

async function removeBannedWord(id) {
  try {
    await api(`/api/title-banned-words/${id}`, 'DELETE');
    loadBannedWords();
  } catch (e) { toast('删除失败：' + (e.message || e)); }
}

// 批量重新生成：勾选状态跨轮询刷新保留（loadApList 每 3s 重建 DOM，会把 checked 冲掉）
let _apSelected = new Set();
window.toggleApSelect = function(el) {
  if (el.checked) _apSelected.add(String(el.value));
  else _apSelected.delete(String(el.value));
};

// 历史任务分页 + 搜索筛选状态
let _apPage = 1;
let _apPageSize = 20;
let _apKeyword = '';
let _apStatus = '';
let _apShopId = '';
let _apSupplierName = '';
let _apTotal = 0;

async function loadApList() {
  const el = $('#ap-list');
  if (!el) return;
  let items = [], total = 0;
  try {
    const params = new URLSearchParams({ page: String(_apPage), page_size: String(_apPageSize) });
    if (_apKeyword) params.set('keyword', _apKeyword);
    if (_apStatus) params.set('status', _apStatus);
    if (_apShopId) params.set('shop_id', _apShopId);
    if (_apSupplierName) params.set('supplier_name', _apSupplierName);
    const resp = await api('/api/autopublish?' + params.toString());
    items = (resp && resp.items) || [];
    total = (resp && resp.total) || 0;
    _apTotal = total;
  } catch (e) { items = []; total = 0; _apTotal = 0; }
  const totalEl = $('#ap-total');
  if (totalEl) totalEl.textContent = total ? `（共 ${total} 条）` : '';
  if (!items.length) { el.innerHTML = '<div class="empty" style="color:#94a3b8">暂无任务。</div>'; renderApPagination(); return; }
  const statusTag = { queued:'排队', crawling:'抓取', ai:'AI配置', publishing:'上架中', published:'✅已上架', submitted:'⏳待审核', draft:'📄草稿', failed:'❌失败' };
  el.innerHTML = items.map(t => {
    const shopName = t.shop_name || (typeof PG_SHOP !== 'undefined' && PG_SHOP[t.shop_id]) || ('店铺' + (t.shop_id || '?'));
    const canRepub = (t.status === 'failed' || t.status === 'draft');
    const metaTag = (icon, text, style) =>
      `<span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;padding:2px 7px;border-radius:4px;font-weight:600;margin-right:6px;${style}">${icon} ${esc(text)}</span>`;
    const shopTag = metaTag('🏪', shopName, 'background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe');
    const operatorTag = metaTag('👤', t.operator_name || '—', 'background:#f0fdf4;color:#166534;border:1px solid #bbf7d0');
    const _pm = t.price_mode || '';
    const isNormal = _pm === 'normal' || _pm === '平卖价';
    const priceModeTag = isNormal
      ? metaTag('🏷️', '平卖价', 'background:#fef3c7;color:#92400e;border:1px solid #fcd34d')
      : metaTag('🏷️', (_pm === 'promo' ? '推广价' : (_pm || '推广价')), 'background:#dbeafe;color:#1e40af;border:1px solid #93c5fd');
    const supplierTag = t.supplier_name
      ? metaTag('🏭', t.supplier_name, 'background:#faf5ff;color:#7c3aed;border:1px solid #ddd6fe')
      : '';
    return `
    <div class="ap-task-item">
      <input type="checkbox" class="ap-task-check" value="${t.id}" ${canRepub ? '' : 'disabled'} ${canRepub && _apSelected.has(String(t.id)) ? 'checked' : ''} onclick="event.stopPropagation()" onchange="window.toggleApSelect(this)">
      <div class="ap-task-id">#${t.id}</div>
      <div class="ap-task-main" onclick="startApPolling(${t.id})">
        <div class="ap-task-title">${esc(t.raw_title || t.ai_title || t.source_url || '')}</div>
        <div class="ap-task-sub">${shopTag}${operatorTag}${priceModeTag}${supplierTag}</div>
      </div>
      <span class="ap-task-status">${statusTag[t.status] || t.status}</span>
      ${canRepub ? `<button class="ap-task-repub" onclick="event.stopPropagation();republishTask(${t.id})">重新上架</button>` : ''}
      ${t.publish_progress && t.publish_progress.step ? `<span class="ap-task-progress">${esc(t.publish_progress.step_name)} ${t.publish_progress.step}/8</span>` : ''}
      ${t.pdd_goods_id ? `<span class="ap-task-gid">${esc(t.pdd_goods_id)}</span>` : ''}
      <div class="ap-task-time">${esc((t.created_at||'').slice(5,16))}</div>
    </div>
  `;}).join('');
  renderApPagination();
}

function renderApPagination() {
  const el = $('#ap-pagination');
  if (!el) return;
  const totalPages = Math.max(1, Math.ceil(_apTotal / _apPageSize));
  el.innerHTML = `
    <button class="btn mini" ${_apPage <= 1 ? 'disabled' : ''} onclick="gotoApPage(${_apPage - 1})" style="padding:5px 14px;font-size:12px;background:#fff;color:#2563eb;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer">上一页</button>
    <span style="font-size:12px;color:#64748b">第 ${_apPage} / ${totalPages} 页</span>
    <button class="btn mini" ${_apPage >= totalPages ? 'disabled' : ''} onclick="gotoApPage(${_apPage + 1})" style="padding:5px 14px;font-size:12px;background:#fff;color:#2563eb;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer">下一页</button>
  `;
}

window.gotoApPage = function(p) {
  if (p < 1) p = 1;
  _apPage = p;
  loadApList();
};

async function republishTask(taskId) {
  try {
    const resp = await api(`/api/autopublish/${taskId}/republish`, 'POST', {});
    if (resp && resp.already) {
      toast('✅ 商品已在售，无需重新上架');
      loadApList();
    } else {
      toast(`任务 #${taskId} 已启动重新上架…`);
      loadApList();
      startApPolling(taskId);
    }
  } catch (e) {
    toast('重新上架失败：' + (e.message || e));
  }
}

async function batchRepublish() {
  const checks = [...document.querySelectorAll('.ap-task-check:checked')];
  if (!checks.length) { toast('请先勾选要重新生成的任务'); return; }
  const ids = checks.map(c => c.value);
  const btn = $('#ap-batch-repub-btn');
  if (btn) { btn.disabled = true; btn.textContent = `重新生成中(${ids.length})…`; }
  let ok = 0, skip = 0, fail = 0;
  for (const id of ids) {
    try {
      const resp = await api(`/api/autopublish/${id}/republish`, 'POST', {});
      if (resp && resp.already) skip++; else ok++;
    } catch (e) { fail++; }
  }
  if (btn) { btn.disabled = false; btn.textContent = '批量重新生成'; }
  toast(`批量重新生成完成：启动 ${ok} 个，已在售跳过 ${skip} 个${fail ? '，失败 ' + fail + ' 个' : ''}`);
  loadApList();
  if (!window._apListTimer) startApListPolling();
}

function showUserManager() {
  if (document.getElementById('user-mgr-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'user-mgr-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:24px';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:24px;width:100%;max-width:480px;max-height:82vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div style="font-size:17px;font-weight:700;color:#17203a">👥 用户管理</div>
        <button id="user-mgr-close" style="background:none;border:none;font-size:22px;color:#94a3b8;cursor:pointer;line-height:1">×</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap">
        <input id="um-username" placeholder="账号（登录用）" style="flex:1;min-width:120px;padding:9px 12px;border:1px solid #e4e7f1;border-radius:8px;font-size:13px">
        <input id="um-name" placeholder="姓名（业绩显示）" style="flex:1;min-width:120px;padding:9px 12px;border:1px solid #e4e7f1;border-radius:8px;font-size:13px">
        <button id="um-add-btn" style="padding:9px 16px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">添加</button>
      </div>
      <div style="font-size:12px;color:#94a3b8;margin-bottom:12px">账号密码由管理员分配。</div>
      <div id="um-list" style="display:flex;flex-direction:column;gap:8px"><div style="color:#94a3b8;font-size:13px">加载中…</div></div>
    </div>`;
  document.body.appendChild(overlay);

  const loadUsers = async () => {
    const box = $('#um-list');
    try {
      const resp = await api('/api/users');
      const items = (resp && resp.items) || [];
      box.innerHTML = items.map(u => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #eef1f5;border-radius:8px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:13px;color:#17203a">${esc(u.name)} <span style="color:#94a3b8;font-weight:400">@${esc(u.username)}</span></div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${u.role === 'admin' ? '👑 管理员' : '👤 员工'} · 创建于 ${esc((u.created_at||'').slice(0,10))}</div>
          </div>
          ${u.username !== 'admin' ? `<button data-um-del="${u.id}" style="padding:4px 10px;background:#fef2f2;color:#dc2626;border:none;border-radius:6px;font-size:12px;cursor:pointer">删除</button>` : ''}
        </div>`).join('');
      box.querySelectorAll('[data-um-del]').forEach(btn => {
        btn.onclick = async () => {
          if (!confirm('确认删除该用户？')) return;
          try {
            await api('/api/users/' + btn.dataset.umDel, 'DELETE');
            toast('已删除');
            loadUsers();
          } catch (e) { toast('删除失败：' + e.message); }
        };
      });
    } catch (e) { box.innerHTML = '<div style="color:#dc2626;font-size:13px">加载失败：' + e.message + '</div>'; }
  };

  $('#um-add-btn').onclick = async () => {
    const username = ($('#um-username').value || '').trim();
    const name = ($('#um-name').value || '').trim();
    if (!username) { toast('请填账号'); return; }
    try {
      await api('/api/users', 'POST', { username, name: name || username });
      toast('已添加用户 ' + (name || username));
      $('#um-username').value = '';
      $('#um-name').value = '';
      loadUsers();
    } catch (e) { toast('添加失败：' + e.message); }
  };

  $('#user-mgr-close').onclick = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  loadUsers();
}

// 用户与权限视图（独立 tab，仅管理员可见）：用户列表 + 权限赋予
let _uaUsers = [];
function renderUserAdmin() {
  const el = $('#view-useradmin');
  el.innerHTML = `
    <div style="padding:20px;max-width:920px">
      <div class="panel" style="padding:16px;margin-bottom:16px;border-radius:12px">
        <div style="font-size:15px;font-weight:700;color:#17203a;margin-bottom:12px">➕ 添加员工账号</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input id="ua-username" placeholder="登录账号" style="flex:1;min-width:130px;padding:9px 12px;border:1px solid #e4e7f1;border-radius:8px;font-size:13px">
          <input id="ua-name" placeholder="姓名（业绩显示）" style="flex:1;min-width:130px;padding:9px 12px;border:1px solid #e4e7f1;border-radius:8px;font-size:13px">
          <select id="ua-role" style="padding:9px 12px;border:1px solid #e4e7f1;border-radius:8px;font-size:13px;background:#fff">
            <option value="operator">👤 员工</option>
            <option value="admin">👑 管理员</option>
          </select>
          <button id="ua-add-btn" style="padding:9px 18px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">添加</button>
        </div>
        <div style="font-size:12px;color:#94a3b8;margin-top:8px">员工默认权限 = 一键上架 + 上架列表，添加后点「🔐 权限」调整。</div>
      </div>
      <div id="ua-list" style="display:flex;flex-direction:column;gap:12px"><div style="color:#94a3b8;font-size:13px;padding:12px">加载中…</div></div>
    </div>`;

  const permSummary = u => {
    const p = u.permissions || [];
    if (u.role === 'admin' || p.includes('*')) return '全部模块';
    return p.length ? p.length + ' 个模块' : '无模块';
  };
  const userCard = u => `
    <div style="background:#fff;border:1px solid #eef1f5;border-radius:12px;padding:14px 16px">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:40px;height:40px;border-radius:50%;background:${u.role==='admin'?'#f59e0b':'#2563eb'};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0">${esc((u.name||u.username||'?')[0])}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px;color:#17203a">${esc(u.name)} <span style="color:#94a3b8;font-weight:400">@${esc(u.username)}</span></div>
          <div style="font-size:12px;color:#94a3b8;margin-top:2px">${u.role==='admin'?'👑 管理员':'👤 员工'} · 权限：${permSummary(u)} · 创建于 ${esc((u.created_at||'').slice(0,10))}</div>
        </div>
        ${u.username !== 'admin' ? `
          <button data-ua-perm="${u.id}" style="padding:6px 12px;background:#eef2ff;color:#2563eb;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">🔐 权限</button>
          <button data-ua-del="${u.id}" style="padding:6px 12px;background:#fef2f2;color:#dc2626;border:none;border-radius:8px;font-size:12px;cursor:pointer;white-space:nowrap">删除</button>
        ` : '<span style="font-size:11px;color:#94a3b8;white-space:nowrap">内置管理员</span>'}
      </div>
      <div id="ua-perm-${u.id}" style="display:none;margin-top:12px;padding-top:12px;border-top:1px dashed #eef1f5"></div>
    </div>`;

  async function loadUsers() {
    const box = $('#ua-list');
    try {
      const resp = await api('/api/users');
      _uaUsers = (resp && resp.items) || [];
      box.innerHTML = _uaUsers.map(userCard).join('');
      box.querySelectorAll('[data-ua-del]').forEach(btn => {
        btn.onclick = async () => {
          if (!confirm('确认删除该用户？其登录与操作记录将保留，但无法再登录。')) return;
          try { await api('/api/users/' + btn.dataset.uaDel, 'DELETE'); toast('已删除'); loadUsers(); }
          catch (e) { toast('删除失败：' + e.message); }
        };
      });
      box.querySelectorAll('[data-ua-perm]').forEach(btn => {
        btn.onclick = () => togglePermEditor(btn.dataset.uaPerm);
      });
    } catch (e) { box.innerHTML = '<div style="color:#dc2626;font-size:13px;padding:12px">加载失败：' + e.message + '</div>'; }
  }

  function togglePermEditor(uid) {
    const box = $('#ua-perm-' + uid);
    if (!box) return;
    if (box.style.display !== 'none') { box.style.display = 'none'; box.innerHTML = ''; return; }
    const user = _uaUsers.find(u => String(u.id) === String(uid));
    if (!user) return;
    const cur = new Set((user.permissions || []).filter(p => p !== '*'));
    const isAll = (user.permissions || []).includes('*');
    box.style.display = 'block';
    box.innerHTML = `
      <div style="font-size:13px;font-weight:600;color:#17203a;margin-bottom:10px">🔐 赋予「${esc(user.name)}」模块权限</div>
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
        <button data-ua-all="1" style="padding:4px 12px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;cursor:pointer">全选</button>
        <button data-ua-all="0" style="padding:4px 12px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;cursor:pointer">清空</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:12px">
        ${PERM_MODULES.map(m => `
          <label style="display:flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid #eef1f5;border-radius:8px;font-size:12px;color:#334155;cursor:pointer">
            <input type="checkbox" data-ua-mod="${m.key}" ${cur.has(m.key) ? 'checked' : ''} style="width:15px;height:15px;accent-color:#2563eb">
            <span>${m.icon} ${m.name}</span>
          </label>`).join('')}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button data-ua-cancel style="padding:7px 14px;background:#f1f5f9;color:#475569;border:none;border-radius:8px;font-size:12px;cursor:pointer">取消</button>
        <button data-ua-save style="padding:7px 16px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">保存权限</button>
      </div>`;
    box.querySelector('[data-ua-all="1"]').onclick = () => box.querySelectorAll('[data-ua-mod]').forEach(c => c.checked = true);
    box.querySelector('[data-ua-all="0"]').onclick = () => box.querySelectorAll('[data-ua-mod]').forEach(c => c.checked = false);
    box.querySelector('[data-ua-cancel]').onclick = () => { box.style.display = 'none'; box.innerHTML = ''; };
    box.querySelector('[data-ua-save]').onclick = async () => {
      const perms = [...box.querySelectorAll('[data-ua-mod]:checked')].map(c => c.dataset.uaMod);
      if (!perms.includes('dashboard')) perms.unshift('dashboard');  // dashboard 基础页始终保留
      try {
        await api(`/api/users/${uid}/permissions`, 'POST', { permissions: perms });
        toast('权限已保存');
        box.style.display = 'none'; box.innerHTML = '';
        loadUsers();
      } catch (e) { toast('保存失败：' + e.message); }
    };
  }

  $('#ua-add-btn').onclick = async () => {
    const username = ($('#ua-username').value || '').trim();
    const name = ($('#ua-name').value || '').trim();
    const role = $('#ua-role').value;
    if (!username) { toast('请填登录账号'); return; }
    try {
      await api('/api/users', 'POST', { username, name: name || username, role });
      toast('已添加 ' + (name || username));
      $('#ua-username').value = ''; $('#ua-name').value = '';
      loadUsers();
    } catch (e) { toast('添加失败：' + e.message); }
  };

  loadUsers();
}

function startApListPolling() {
  if (window._apListTimer) clearInterval(window._apListTimer);
  window._apListTimer = setInterval(() => { if (state.view === 'autopublish') loadApList(); }, 3000);
}

// 上架列表：已上架商品台账（存表 published_goods），一键上架成功后自动归档
const PG_SHOP = {5:'嘉裕工艺品', 3:'如若月下', 1:'闲时来工艺', 6:'欧世艺'};
const pgFilter = { shop_id: '', status: '', category: '' };
let pgCategoriesCache = null;
async function getPgCategories() {
  if (pgCategoriesCache) return pgCategoriesCache;
  try {
    const resp = await api('/api/published-goods/categories');
    pgCategoriesCache = (resp && resp.categories) || [];
  } catch (e) { pgCategoriesCache = []; }
  return pgCategoriesCache;
}
// 类目下拉：按一级类目分组（optgroup），完整路径为选项值
function pgCategoryOptions(cats) {
  const groups = {};
  cats.forEach(c => {
    const l1 = String(c).split(' > ')[0] || '其他';
    (groups[l1] = groups[l1] || []).push(c);
  });
  return Object.entries(groups).map(([l1, list]) =>
    `<optgroup label="${esc(l1)}">` +
    list.map(c => `<option value="${esc(c)}" ${pgFilter.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('') +
    `</optgroup>`).join('');
}

async function renderPublishedGoods() {
  const el = $('#view-publishedgoods');
  el.innerHTML = '<div style="padding:24px;color:#666">加载中…</div>';
  let items = [], cats = [];
  try {
    const qs = [];
    if (pgFilter.shop_id) qs.push('shop_id=' + pgFilter.shop_id);
    if (pgFilter.status) qs.push('status=' + pgFilter.status);
    if (pgFilter.category) qs.push('category=' + encodeURIComponent(pgFilter.category));
    const [resp, catResp] = await Promise.all([
      api('/api/published-goods' + (qs.length ? '?' + qs.join('&') : '')),
      getPgCategories(),
    ]);
    items = (resp && resp.items) || [];
    cats = catResp || [];
  } catch (e) { items = []; }

  const published = items.filter(x => x.status === 'published');
  const failed = items.filter(x => x.status === 'failed');
  const totalSku = published.reduce((s, x) => s + (Number(x.sku_count) || 0), 0);
  let marginSum = 0, marginN = 0;
  for (const x of published) {
    const cost = (x.cost_price == null) ? null : Number(x.cost_price);
    const sale = Number(x.sale_price), fr = Number(x.freight) || 0;
    if (sale > 0 && cost != null && !Number.isNaN(cost)) { marginSum += (sale - cost - fr) / sale; marginN++; }
  }
  const avgMargin = marginN ? (marginSum / marginN * 100).toFixed(1) + '%' : '—';

  const cards = items.map(x => {
    const sku = x.sku_details || [];
    const cost = (x.cost_price == null) ? null : Number(x.cost_price);
    const sale = Number(x.sale_price), danmai = Number(x.danmai_price), fr = Number(x.freight) || 0;
    const profit = (sale > 0 && cost != null && !Number.isNaN(cost)) ? (sale - cost - fr) : null;
    const margin = (profit != null && sale > 0) ? (profit / sale * 100).toFixed(1) + '%' : '—';
    const imgUrl = x.main_image ? (BASE + '/api/published-goods/image?path=' + encodeURIComponent(x.main_image) + '&token=' + encodeURIComponent(getToken())) : '';
    const shopName = x.shop_name || PG_SHOP[x.shop_id] || (x.shop_id ? '店铺' + x.shop_id : '—');
    const skuRows = sku.map(s => `
      <tr style="border-top:1px solid #f1f5f9">
        <td style="padding:5px 8px">${esc(s.name || '')}</td>
        <td style="padding:5px 8px;text-align:right;color:#64748b">${s.cost != null ? '¥' + fmt(s.cost) : '—'}</td>
        <td style="padding:5px 8px;text-align:right;font-weight:600">${s.pdd != null ? '¥' + fmt(s.pdd) : '—'}</td>
        <td style="padding:5px 8px;text-align:right;color:#64748b">${s.danmai != null ? '¥' + fmt(s.danmai) : '—'}</td>
      </tr>`).join('');
    return `
      <div class="pg-card" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:10px">
        <div class="pg-card-top" style="display:flex;gap:14px;align-items:flex-start">
          <div class="pg-img" style="width:64px;height:64px;flex-shrink:0;background:#f1f5f9;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:22px;${imgUrl ? 'cursor:zoom-in;' : ''}" ${imgUrl ? `onclick="showImageLightbox('${imgUrl}')"` : ''}>
            ${imgUrl ? `<img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover;display:block" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span style="display:none">📦</span>` : '📦'}
          </div>
          <div class="pg-info" style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:14px;color:#17203a;line-height:1.4">${esc(x.ai_title || x.raw_title || '')}</div>
            ${x.raw_title && x.raw_title !== x.ai_title ? `<div style="color:#94a3b8;font-size:12px;margin-top:2px">原：${esc(x.raw_title)}</div>` : ''}
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;font-size:12px;color:#64748b">
              <span>🗂 ${esc(x.category || '—')}</span>
              <span>🏪 ${esc(shopName)}</span>
              <span>👤 ${esc(x.operator_name || '—')}</span>
              <span>🕒 ${esc((x.published_at || x.created_at || '').slice(0, 16))}</span>
              ${x.goods_id ? `<span>🆔 ${esc(x.goods_id)}</span>` : ''}
              ${sku.length ? `<span>📦 ${sku.length} SKU</span>` : ''}
            </div>
          </div>
          <div class="pg-price" style="text-align:right;flex-shrink:0;min-width:110px">
            ${x.status === 'published'
              ? '<span style="background:#f0fdf4;color:#16a34a;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:600">✅ 已上架</span>'
              : '<span style="background:#fef2f2;color:#dc2626;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:600">❌ 失败</span>'}
            <div class="pg-price-row" style="margin-top:8px;font-size:13px;color:#475569">
              <div>成本 <b>${cost != null && !Number.isNaN(cost) ? '¥' + fmt(cost) : '—'}</b></div>
              <div>上架 <b style="color:#2563eb">${sale != null && !Number.isNaN(sale) ? '¥' + fmt(sale) : '—'}</b></div>
              <div style="color:#16a34a;font-weight:600">毛利 ${profit != null ? '¥' + fmt(profit) : '—'} <span style="color:#94a3b8;font-weight:400">${margin}</span></div>
            </div>
          </div>
        </div>
        ${sku.length ? `<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12px;color:#64748b">SKU 明细 · 进价 → 拼单价 → 单买价</summary>
          <table style="width:100%;margin-top:8px;border-collapse:collapse;font-size:12px">
            <thead><tr style="color:#94a3b8"><th style="text-align:left;padding:5px 8px">规格</th><th style="text-align:right;padding:5px 8px">进价(原始)</th><th style="text-align:right;padding:5px 8px">拼单价</th><th style="text-align:right;padding:5px 8px">单买价</th></tr></thead>
            <tbody>${skuRows}</tbody>
          </table></details>` : ''}
        ${x.remark ? `<div style="color:#b91c1c;font-size:12px;margin-top:6px">⚠️ ${esc(x.remark)}</div>` : ''}
        ${x.source_url ? `<div style="margin-top:6px"><a href="${esc(x.source_url)}" target="_blank" rel="noopener" style="font-size:12px;color:#2563eb;text-decoration:none">🔗 1688 货源 →</a></div>` : ''}
      </div>`;
  }).join('');

  el.innerHTML = `
    <div style="padding:20px;max-width:1100px">
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:120px;background:#f8fafc;border-radius:12px;padding:14px">
          <div style="color:#64748b;font-size:12px">已上架商品</div>
          <div style="font-size:24px;font-weight:700;margin-top:4px;color:#16a34a">${published.length}</div>
        </div>
        <div style="flex:1;min-width:120px;background:#f8fafc;border-radius:12px;padding:14px">
          <div style="color:#64748b;font-size:12px">在售 SKU 总数</div>
          <div style="font-size:24px;font-weight:700;margin-top:4px">${totalSku}</div>
        </div>
        <div style="flex:1;min-width:120px;background:#f8fafc;border-radius:12px;padding:14px">
          <div style="color:#64748b;font-size:12px">失败记录</div>
          <div style="font-size:24px;font-weight:700;margin-top:4px;color:${failed.length ? '#dc2626' : '#94a3b8'}">${failed.length}</div>
        </div>
        <div style="flex:1;min-width:120px;background:#f8fafc;border-radius:12px;padding:14px">
          <div style="color:#64748b;font-size:12px">平均毛利率</div>
          <div style="font-size:24px;font-weight:700;margin-top:4px;color:#2563eb">${avgMargin}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <select id="pg-shop" style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;background:#fff">
          <option value="">全部店铺</option>
          ${Object.entries(PG_SHOP).map(([id, n]) => `<option value="${id}" ${pgFilter.shop_id === id ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
        <select id="pg-status" style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;background:#fff">
          <option value="">全部状态</option>
          <option value="published" ${pgFilter.status === 'published' ? 'selected' : ''}>✅ 已上架</option>
          <option value="failed" ${pgFilter.status === 'failed' ? 'selected' : ''}>❌ 失败</option>
        </select>
        <select id="pg-category" style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;background:#fff;max-width:320px">
          <option value="">全部类目</option>
          ${pgCategoryOptions(cats)}
        </select>
        <button class="btn" id="pg-refresh" style="font-size:13px;padding:8px 14px">🔄 刷新</button>
      </div>
      <div id="pg-list">${cards || '<div class="empty" style="color:#94a3b8">暂无上架记录。去「一键上架」跑一单，成功后自动归档到这里。</div>'}</div>
    </div>
  `;

  $('#pg-shop').onchange = () => { pgFilter.shop_id = $('#pg-shop').value; renderPublishedGoods(); };
  $('#pg-status').onchange = () => { pgFilter.status = $('#pg-status').value; renderPublishedGoods(); };
  $('#pg-category').onchange = () => { pgFilter.category = $('#pg-category').value; renderPublishedGoods(); };
  $('#pg-refresh').onclick = () => renderPublishedGoods();
}

// 盈利看板：当日净利 = 净收入 − 推广 − 商品成本 − 运费
async function renderProfit() {
  const el = $('#view-profit');
  const ym = (v) => (v == null || Number.isNaN(Number(v))) ? '—' : '¥' + Number(v).toFixed(2);
  const sign = (v) => { v = Number(v) || 0; return (v >= 0 ? '' : '−') + '¥' + Math.abs(v).toFixed(2); };
  el.innerHTML = '<div style="padding:24px;color:#666">加载中…</div>';
  let items = [], params = [], serverToday = '';
  try {
    const [resp, paramResp] = await Promise.all([
      api('/api/catalog/daily-profit?limit=90'),
      api('/api/cost-params'),
    ]);
    items = (resp && resp.items) || [];
    params = (paramResp && paramResp.params) || [];
    serverToday = (resp && resp.server_today) || '';
  } catch (e) { items = []; params = []; }

  // 按日期汇总各店净利
  const byDate = {};
  items.forEach(r => {
    if (!byDate[r.stat_date]) byDate[r.stat_date] = { profit: 0 };
    byDate[r.stat_date].profit += (r.gross_profit || 0);
  });
  const dates = Object.keys(byDate).sort().reverse();
  const sum = (arr) => arr.reduce((s, d) => s + (byDate[d].profit || 0), 0);
  const card = (label, val) => `
    <div style="flex:1;min-width:120px;background:#f8fafc;border-radius:12px;padding:16px">
      <div style="color:#64748b;font-size:12px">${label}</div>
      <div style="font-size:24px;font-weight:700;margin-top:6px;color:${val >= 0 ? '#0f766e' : '#dc2626'}">${sign(val)}</div>
    </div>`;
  // 服务器今天（判断「今日净利」是否真的有当天数据，避免用昨天数据冒充「今日」误导）
  const latestDate = dates[0] || '';
  const hasToday = latestDate === serverToday;

  let html = '<div style="padding:16px 20px">';
  html += `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px">
    ${hasToday
      ? card('今日净利', byDate[latestDate].profit)
      : card('最新净利（' + latestDate + '）', latestDate ? byDate[latestDate].profit : 0)}
    ${card('昨日净利', dates[1] ? byDate[dates[1]].profit : 0)}
    ${card('近7天净利', sum(dates.slice(0, 7)))}
  </div>`;
  html += `<div style="display:flex;gap:10px;margin-bottom:16px;align-items:center">
    <button onclick="settleProfit()" style="background:#0f766e;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px">🔄 结算昨天</button>
    <span style="color:#94a3b8;font-size:12px">每天 20:30 订单采完后自动结算前一天</span>
  </div>`;

  if (!items.length) {
    html += '<div style="padding:32px;color:#999;text-align:center">暂无盈利数据。<br>点「结算昨天」生成，或等每日 20:30 自动结算。</div>';
  } else {
    html += `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:680px">
      <tr style="color:#94a3b8;text-align:left">
        <th style="padding:8px 6px;font-weight:500">日期</th>
        <th style="padding:8px 6px;font-weight:500">店铺</th>
        <th style="padding:8px 6px;font-weight:500;text-align:right">净收入</th>
        <th style="padding:8px 6px;font-weight:500;text-align:right">退款</th>
        <th style="padding:8px 6px;font-weight:500;text-align:right">推广</th>
        <th style="padding:8px 6px;font-weight:500;text-align:right">成本</th>
        <th style="padding:8px 6px;font-weight:500;text-align:right">运费</th>
        <th style="padding:8px 6px;font-weight:500;text-align:right">净利</th>
        <th style="padding:8px 6px;font-weight:500;text-align:right">单数</th>
      </tr>
      ${items.map(r => `
        <tr style="border-top:1px solid #f1f5f9">
          <td style="padding:7px 6px;color:#475569">${r.stat_date}</td>
          <td style="padding:7px 6px">${r.shop_name || ('店' + r.shop_id)}</td>
          <td style="padding:7px 6px;text-align:right">${ym(r.net_income)}</td>
          <td style="padding:7px 6px;text-align:right;color:#dc2626">${r.refund_amount ? '¥' + Number(r.refund_amount).toFixed(2) : '—'}</td>
          <td style="padding:7px 6px;text-align:right;color:#ea580c">${ym(r.promo_spend)}</td>
          <td style="padding:7px 6px;text-align:right">${ym(r.goods_cost)}</td>
          <td style="padding:7px 6px;text-align:right">${ym(r.freight_cost)}</td>
          <td style="padding:7px 6px;text-align:right;font-weight:700;color:${(r.gross_profit || 0) >= 0 ? '#0f766e' : '#dc2626'}">${sign(r.gross_profit)}</td>
          <td style="padding:7px 6px;text-align:right;color:#64748b">${r.order_count}</td>
        </tr>`).join('')}
    </table></div>`;
  }

  html += `<div class="panel" style="margin-top:20px;padding:16px 18px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <b style="font-size:15px">⚙️ 固定成本参数（门后挂钩成本模型）</b>
      <button onclick="saveCostParams()" style="background:#2563eb;color:#fff;border:none;padding:7px 14px;border-radius:8px;cursor:pointer;font-size:13px">保存参数</button>
    </div>
    <div style="color:#94a3b8;font-size:12px;margin-bottom:12px">单件成本 = 挂钩单价 × 个装数 + 纸箱 + 人工；运费按重量档估算</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px">
      ${params.map(p => `
        <div style="background:#f8fafc;border-radius:8px;padding:10px 12px">
          <div style="font-size:12px;color:#475569;font-weight:600">${p.note || p.key}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:6px">
            <input data-cost-key="${p.key}" type="number" step="0.01" value="${p.value}" style="width:80px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px">
            <span style="color:#94a3b8;font-size:11px">${p.unit || ''}</span>
          </div>
        </div>`).join('')}
    </div>
  </div>`;

  html += '</div>';
  el.innerHTML = html;
}

async function settleProfit() {
  toast('结算中…');
  try {
    await api('/api/catalog/daily-profit/settle', 'POST', { date: '' });
    toast('结算完成');
    renderProfit();
  } catch (e) { toast('结算失败：' + e.message); }
}

async function saveCostParams() {
  const params = {};
  $$('input[data-cost-key]').forEach(i => params[i.dataset.costKey] = parseFloat(i.value));
  try {
    await api('/api/cost-params', 'POST', { params });
    toast('参数已保存');
    renderProfit();
  } catch (e) { toast('保存失败：' + e.message); }
}

// 销售看板：成交 SKU → 品类归类 + 每日/每月汇总
async function renderSale() {
  const el = $('#view-sale');
  const ym = (v) => (v == null || Number.isNaN(Number(v))) ? 0 : Number(v);
  el.innerHTML = '<div style="padding:24px;color:#666">加载中…</div>';
  let cats = [], monthly = [], skus = [], daily = [], serverToday = '', dateRange = null;
  try {
    const [catResp, monthlyResp, skuResp, dailyResp] = await Promise.all([
      api('/api/catalog/sale-category'),
      api('/api/catalog/sale-monthly'),
      api('/api/catalog/sale-sku-summary?limit=500'),
      api('/api/catalog/sale-daily?limit=90'),
    ]);
    cats = (catResp && catResp.items) || [];
    monthly = (monthlyResp && monthlyResp.items) || [];
    skus = (skuResp && skuResp.items) || [];
    daily = (dailyResp && dailyResp.items) || [];
    serverToday = (catResp && catResp.server_today) || '';
    dateRange = (catResp && catResp.date_range) || null;
  } catch (e) { cats = []; monthly = []; skus = []; daily = []; serverToday = ''; dateRange = null; }
  const curMonth = (serverToday || '').slice(0, 7);

  const totalAmt = cats.reduce((s, c) => s + ym(c.amt), 0);
  const totalQty = cats.reduce((s, c) => s + ym(c.qty), 0);

  // 汇总卡
  let html = '<div style="padding:16px 20px">';
  const drStart = (dateRange && dateRange.start) || '';
  const drEnd = (dateRange && dateRange.end) || '';
  html += `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px">
    <div style="flex:1;min-width:110px;background:#f8fafc;border-radius:12px;padding:14px"><div style="color:#64748b;font-size:12px">累计销量</div><div style="font-size:22px;font-weight:700;margin-top:4px">${totalQty} 件</div></div>
    <div style="flex:1;min-width:110px;background:#f8fafc;border-radius:12px;padding:14px"><div style="color:#64748b;font-size:12px">累计成交额</div><div style="font-size:22px;font-weight:700;margin-top:4px;color:#0f766e">¥${totalAmt.toFixed(2)}</div></div>
    <div style="flex:1;min-width:110px;background:#f8fafc;border-radius:12px;padding:14px"><div style="color:#64748b;font-size:12px">品类数</div><div style="font-size:22px;font-weight:700;margin-top:4px">${cats.length}</div></div>
  </div>`;
  html += `<div style="font-size:12px;color:#94a3b8;margin-bottom:14px">📅 累计起始 <b style="color:#475569">${drStart}</b>${drEnd ? '（截至 ' + drEnd + '）' : ''} · 有效成交口径</div>`;

  // 品类分布（条形图 + 表格，日期可选，默认当月）
  html += `<div class="panel" style="padding:16px 18px;margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <b style="font-size:15px">🏷️ 品类分布</b>
      <input type="month" id="sale-cat-month" value="${curMonth}" style="border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:13px;color:#475569;background:#fff;max-width:150px" onchange="loadCategoryDist(this.value)">
    </div>
    <div id="sale-cat-body" style="margin-top:12px"><div style="padding:16px;color:#94a3b8;text-align:center">加载中…</div></div>
  </div>`;

  // 每日明细（可折叠，数据量较大）
  html += `<details class="pf-fold" style="margin-bottom:14px"><summary style="cursor:pointer;font-weight:600;font-size:15px;padding:12px 16px;background:#fff;border-radius:10px;border:1px solid #e2e8f0;list-style:none">📆 每日明细（近 ${daily.length} 天，点击展开）</summary>
    <div style="margin-top:8px;max-height:420px;overflow:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr style="color:#94a3b8;text-align:left;position:sticky;top:0;background:#fff">
          <th style="padding:6px 4px;font-weight:500">日期</th><th style="padding:6px 4px;font-weight:500;text-align:right">销量(件)</th>
          <th style="padding:6px 4px;font-weight:500;text-align:right">成交额</th><th style="padding:6px 4px;font-weight:500">品类构成</th>
        </tr>
        ${daily.map(d => `<tr style="border-top:1px solid #f1f5f9;vertical-align:top">
          <td style="padding:6px 4px;color:#475569;white-space:nowrap">${d.date}</td>
          <td style="padding:6px 4px;text-align:right">${d.qty}</td>
          <td style="padding:6px 4px;text-align:right;font-weight:600">¥${ym(d.amt).toFixed(2)}</td>
          <td style="padding:6px 4px;color:#64748b;font-size:11px">${Object.entries(d.categories || {}).map(([k, v]) => `${k} ${v.qty}件`).join(' · ')}</td>
        </tr>`).join('')}
      </table>
    </div>
  </details>`;

  // 每月汇总
  html += `<div class="panel" style="padding:16px 18px;margin-bottom:14px">
    <b style="font-size:15px">📅 每月汇总</b>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:10px;min-width:560px">
      <tr style="color:#94a3b8;text-align:left">
        <th style="padding:6px 4px;font-weight:500">月份</th><th style="padding:6px 4px;font-weight:500;text-align:right">销量(件)</th>
        <th style="padding:6px 4px;font-weight:500;text-align:right">成交额</th><th style="padding:6px 4px;font-weight:500">品类构成</th>
      </tr>
      ${monthly.map(m => `<tr style="border-top:1px solid #f1f5f9;vertical-align:top">
        <td style="padding:6px 4px;color:#475569">${m.month}</td>
        <td style="padding:6px 4px;text-align:right">${m.qty}</td>
        <td style="padding:6px 4px;text-align:right;font-weight:600">¥${ym(m.amt).toFixed(2)}</td>
        <td style="padding:6px 4px;color:#64748b;font-size:11px">${Object.entries(m.categories || {}).map(([k, v]) => `${k} ${v.qty}件/¥${ym(v.amt).toFixed(0)}`).join(' · ')}</td>
      </tr>`).join('')}
    </table>
    </div>
  </div>`;

  // SKU 明细（按商品汇总 / 按规格明细 可切换 + 月份可选）
  html += `<div class="panel" style="padding:16px 18px;margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <b id="sale-sku-label" style="font-size:15px">🧾 SKU 明细（${skus.length} · 按商品汇总 · 全部累计）</b>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div style="display:flex;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <button type="button" id="sku-mode-summary" onclick="setSkuMode('summary')" style="border:none;padding:6px 12px;font-size:13px;background:#0f766e;color:#fff;cursor:pointer;font-weight:600">按商品汇总</button>
          <button type="button" id="sku-mode-detail" onclick="setSkuMode('detail')" style="border:none;padding:6px 12px;font-size:13px;background:#fff;color:#475569;cursor:pointer">按规格明细</button>
        </div>
        <button type="button" onclick="loadSkuDetail('')" style="border:1px solid #e2e8f0;border-radius:8px;padding:6px 12px;font-size:13px;background:#fff;color:#0f766e;cursor:pointer;font-weight:600">全部累计</button>
        <input type="month" id="sale-sku-month" value="${curMonth}" style="border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:13px;color:#475569;background:#fff;max-width:150px" onchange="loadSkuDetail(this.value)">
      </div>
    </div>
    <div id="sale-sku-body" style="margin-top:12px">${skuSummaryTable(skus)}</div>
  </div>`;

  html += '</div>';
  el.innerHTML = html;
  loadCategoryDist(curMonth); // 品类分布默认加载当月
}

// 品类分布颜色（renderSale 与 categoryDistBody 共用）
const SALE_COLOR = ['#2563eb', '#0f766e', '#ea580c', '#7c3aed', '#dc2626', '#0891b2', '#ca8a04', '#16a34a', '#64748b', '#db2777'];

// 品类分布主体（条形图 + 表格）
function categoryDistBody(cats) {
  const ym = (v) => (v == null || Number.isNaN(Number(v))) ? 0 : Number(v);
  if (!cats || !cats.length) return '<div style="padding:24px;color:#94a3b8;text-align:center">该月份暂无成交数据</div>';
  const totalAmt = cats.reduce((s, c) => s + ym(c.amt), 0);
  return `
    <div>${cats.map((c, i) => {
      const pct = totalAmt ? (ym(c.amt) / totalAmt * 100) : 0;
      const color = SALE_COLOR[i % SALE_COLOR.length];
      return `<div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:4px;margin-bottom:4px">
          <span style="font-size:13px;color:#475569;font-weight:600"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px"></span>${c.category}</span>
          <span style="font-size:12px;color:#64748b">¥${ym(c.amt).toFixed(0)} · ${c.qty}件 · ${pct.toFixed(0)}%</span>
        </div>
        <div style="background:#f1f5f9;border-radius:6px;height:16px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:6px;min-width:2px"></div>
        </div>
      </div>`;
    }).join('')}</div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;min-width:520px">
      <tr style="color:#94a3b8;text-align:left">
        <th style="padding:6px 4px;font-weight:500">品类</th><th style="padding:6px 4px;font-weight:500;text-align:right">销量(件)</th>
        <th style="padding:6px 4px;font-weight:500;text-align:right">成交额</th><th style="padding:6px 4px;font-weight:500;text-align:right">单数</th>
        <th style="padding:6px 4px;font-weight:500;text-align:right">商品数</th><th style="padding:6px 4px;font-weight:500;text-align:right">占比</th>
      </tr>
      ${cats.map((c, i) => `<tr style="border-top:1px solid #f1f5f9">
        <td style="padding:6px 4px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${SALE_COLOR[i % SALE_COLOR.length]};margin-right:6px"></span>${c.category}</td>
        <td style="padding:6px 4px;text-align:right">${c.qty}</td>
        <td style="padding:6px 4px;text-align:right;font-weight:600">¥${ym(c.amt).toFixed(2)}</td>
        <td style="padding:6px 4px;text-align:right;color:#64748b">${c.cnt}</td>
        <td style="padding:6px 4px;text-align:right;color:#64748b">${c.products}</td>
        <td style="padding:6px 4px;text-align:right;color:#64748b">${totalAmt ? (ym(c.amt)/totalAmt*100).toFixed(1) : 0}%</td>
      </tr>`).join('')}
    </table>
    </div>`;
}

// 品类分布切换月份：重查该月 start~end
window.loadCategoryDist = async function(ymStr) {
  if (!ymStr) return;
  const [y, m] = ymStr.split('-').map(Number);
  const start = ymStr + '-01';
  const lastDay = new Date(y, m, 0).getDate(); // new Date(y, m, 0) = 当月最后一天（本地时间）
  const end = ymStr + '-' + String(lastDay).padStart(2, '0');
  const body = $('#sale-cat-body');
  if (!body) return;
  body.innerHTML = '<div style="padding:16px;color:#94a3b8;text-align:center">加载中…</div>';
  try {
    const resp = await api(`/api/catalog/sale-category?start=${start}&end=${end}`);
    const cats = (resp && resp.items) || [];
    body.innerHTML = categoryDistBody(cats);
  } catch (e) {
    body.innerHTML = '<div style="padding:16px;color:#dc2626;text-align:center">加载失败：' + esc(e.message || e) + '</div>';
  }
};

// SKU 明细表格（含合计行：销量/挂钩数/成交额/单数）
function skuDetailTable(skus) {
  const ym = (v) => (v == null || Number.isNaN(Number(v))) ? 0 : Number(v);
  if (!skus || !skus.length) return '<div style="padding:24px;color:#94a3b8;text-align:center">该月份暂无成交数据</div>';
  const totQty = skus.reduce((s, x) => s + ym(x.qty), 0);
  const totHook = skus.reduce((s, x) => s + ym(x.hook_count), 0);
  const totAmt = skus.reduce((s, x) => s + ym(x.amt), 0);
  const totCnt = skus.reduce((s, x) => s + ym(x.cnt), 0);
  return `
    <div style="max-height:520px;overflow:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr style="color:#94a3b8;text-align:left;position:sticky;top:0;background:#fff">
          <th style="padding:6px 4px;font-weight:500">品类</th><th style="padding:6px 4px;font-weight:500">商品</th>
          <th style="padding:6px 4px;font-weight:500">SKU（规格）</th><th style="padding:6px 4px;font-weight:500;text-align:right">销量(件)</th>
          <th style="padding:6px 4px;font-weight:500;text-align:right">挂钩数</th>
          <th style="padding:6px 4px;font-weight:500;text-align:right">成交额</th><th style="padding:6px 4px;font-weight:500;text-align:right">单数</th>
        </tr>
        ${skus.map(s => `<tr style="border-top:1px solid #f1f5f9">
          <td style="padding:6px 4px;color:#475569;white-space:nowrap">${s.category}</td>
          <td style="padding:6px 4px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(s.name)}">${esc(s.name)}</td>
          <td style="padding:6px 4px;color:#64748b;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(s.spec)}">${esc(s.spec || '—')}</td>
          <td style="padding:6px 4px;text-align:right">${s.qty}</td>
          <td style="padding:6px 4px;text-align:right;color:#7c3aed;font-weight:600">${s.hook_count ? s.hook_count : '—'}</td>
          <td style="padding:6px 4px;text-align:right;font-weight:600">¥${ym(s.amt).toFixed(2)}</td>
          <td style="padding:6px 4px;text-align:right;color:#64748b">${s.cnt}</td>
        </tr>`).join('')}
        <tr style="border-top:2px solid #e2e8f0;background:#f8fafc;font-weight:700">
          <td style="padding:8px 4px" colspan="3">合计</td>
          <td style="padding:8px 4px;text-align:right">${totQty}</td>
          <td style="padding:8px 4px;text-align:right;color:#7c3aed">${totHook || '—'}</td>
          <td style="padding:8px 4px;text-align:right">¥${totAmt.toFixed(2)}</td>
          <td style="padding:8px 4px;text-align:right">${totCnt}</td>
        </tr>
      </table>
    </div>`;
}

// SKU 明细视图状态：summary=按商品汇总（合并同商品多规格） / detail=按规格明细
let _skuMode = 'summary';
let _skuMonth = '';

// SKU 明细按商品汇总表格（合并同商品不同规格，含合计行）
function skuSummaryTable(items) {
  const ym = (v) => (v == null || Number.isNaN(Number(v))) ? 0 : Number(v);
  if (!items || !items.length) return '<div style="padding:24px;color:#94a3b8;text-align:center">该月份暂无成交数据</div>';
  const totQty = items.reduce((s, x) => s + ym(x.qty), 0);
  const totHook = items.reduce((s, x) => s + ym(x.hook_count), 0);
  const totAmt = items.reduce((s, x) => s + ym(x.amt), 0);
  const totCnt = items.reduce((s, x) => s + ym(x.cnt), 0);
  return `
    <div style="max-height:520px;overflow:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr style="color:#94a3b8;text-align:left;position:sticky;top:0;background:#fff">
          <th style="padding:6px 4px;font-weight:500">品类</th><th style="padding:6px 4px;font-weight:500">商品</th>
          <th style="padding:6px 4px;font-weight:500">规格（含销量）</th><th style="padding:6px 4px;font-weight:500;text-align:right">销量(件)</th>
          <th style="padding:6px 4px;font-weight:500;text-align:right">挂钩数</th>
          <th style="padding:6px 4px;font-weight:500;text-align:right">成交额</th><th style="padding:6px 4px;font-weight:500;text-align:right">单数</th>
        </tr>
        ${items.map(s => `<tr style="border-top:1px solid #f1f5f9;vertical-align:top">
          <td style="padding:6px 4px;color:#475569;white-space:nowrap">${s.category}</td>
          <td style="padding:6px 4px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(s.name)}">${esc(s.name)}</td>
          <td style="padding:6px 4px;color:#64748b;max-width:260px;font-size:11px;line-height:1.6;word-break:break-all" title="${esc(s.spec)}">${esc(s.spec || '—')}</td>
          <td style="padding:6px 4px;text-align:right">${s.qty}</td>
          <td style="padding:6px 4px;text-align:right;color:#7c3aed;font-weight:600">${s.hook_count ? s.hook_count : '—'}</td>
          <td style="padding:6px 4px;text-align:right;font-weight:600">¥${ym(s.amt).toFixed(2)}</td>
          <td style="padding:6px 4px;text-align:right;color:#64748b">${s.cnt}</td>
        </tr>`).join('')}
        <tr style="border-top:2px solid #e2e8f0;background:#f8fafc;font-weight:700">
          <td style="padding:8px 4px" colspan="3">合计</td>
          <td style="padding:8px 4px;text-align:right">${totQty}</td>
          <td style="padding:8px 4px;text-align:right;color:#7c3aed">${totHook || '—'}</td>
          <td style="padding:8px 4px;text-align:right">¥${totAmt.toFixed(2)}</td>
          <td style="padding:8px 4px;text-align:right">${totCnt}</td>
        </tr>
      </table>
    </div>`;
}

// 切换 SKU 明细视图（按商品汇总 / 按规格明细）
window.setSkuMode = function(mode) {
  _skuMode = mode;
  const bSummary = $('#sku-mode-summary'), bDetail = $('#sku-mode-detail');
  if (bSummary && bDetail) {
    const on = { background: '#0f766e', color: '#fff', fontWeight: '600' };
    const off = { background: '#fff', color: '#475569', fontWeight: '400' };
    Object.assign(bSummary.style, mode === 'summary' ? on : off);
    Object.assign(bDetail.style, mode === 'detail' ? on : off);
  }
  loadSkuDetail(_skuMonth);
};

// SKU 明细切换月份：空=全部累计，否则查该月 start~end
window.loadSkuDetail = async function(ymStr) {
  _skuMonth = ymStr || '';
  const body = $('#sale-sku-body');
  const label = $('#sale-sku-label');
  if (!body) return;
  if (!_skuMonth) {
    const mi = $('#sale-sku-month');
    if (mi) mi.value = '';
  }
  body.innerHTML = '<div style="padding:16px;color:#94a3b8;text-align:center">加载中…</div>';
  const endpoint = _skuMode === 'summary' ? '/api/catalog/sale-sku-summary' : '/api/catalog/sale-sku';
  let url = endpoint + '?limit=500';
  let rangeLabel = '全部累计';
  if (_skuMonth) {
    const [y, m] = _skuMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const start = _skuMonth + '-01';
    const end = _skuMonth + '-' + String(lastDay).padStart(2, '0');
    url += `&start=${start}&end=${end}`;
    rangeLabel = _skuMonth;
  }
  try {
    const resp = await api(url);
    const items = (resp && resp.items) || [];
    body.innerHTML = _skuMode === 'summary' ? skuSummaryTable(items) : skuDetailTable(items);
    const modeLabel = _skuMode === 'summary' ? '按商品汇总' : '按规格明细';
    if (label) label.textContent = `🧾 SKU 明细（${items.length} · ${modeLabel} · ${rangeLabel}）`;
  } catch (e) {
    body.innerHTML = '<div style="padding:16px;color:#dc2626;text-align:center">加载失败：' + esc(e.message || e) + '</div>';
  }
};

// 推广财务：各店余额 + 每日花费快照 + 余额告警
// 把合并的账单月份（如「2026年02/03/04/05/06/07/08月」）展开成逐月行
function expandMonthlyBills(bills) {
  const rows = [];
  for (const b of bills) {
    const shopName = b.shop_name || '';
    const subject = b.bill_subject || '';
    const segs = String(b.bill_period || '').split(/[、，,]/);
    const months = [];
    for (const seg of segs) {
      const m = seg.match(/(\d{4})年([\d\/]+)月/);
      if (!m) continue;
      const y = parseInt(m[1]);
      for (const mm of m[2].split('/')) { const n = parseInt(mm); if (!isNaN(n)) months.push({ y, m: n }); }
    }
    const multiYear = /[、，,]/.test(b.bill_period || '');
    const isAdj = Number(b.bill_amount) < 0 || multiYear; // 负数/跨年调整：单行原样，不展开
    if (!months.length || (isAdj && months.length > 1)) {
      rows.push({ shopName, label: b.bill_period || '—', subject, amount: b.bill_amount, sortKey: 'zzz', merged: false, mergedCount: 0 });
      continue;
    }
    if (months.length === 1) {
      const mo = months[0];
      rows.push({ shopName, label: mo.y + '年' + String(mo.m).padStart(2, '0') + '月', subject, amount: b.bill_amount, sortKey: mo.y + '-' + String(mo.m).padStart(2, '0'), merged: false, mergedCount: 0 });
    } else {
      months.forEach((mo, i) => {
        rows.push({ shopName, label: mo.y + '年' + String(mo.m).padStart(2, '0') + '月', subject, amount: i === 0 ? b.bill_amount : null, sortKey: mo.y + '-' + String(mo.m).padStart(2, '0'), merged: true, mergedCount: months.length });
      });
    }
  }
  rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return rows;
}

async function renderPromoFinance() {
  const el = $('#view-promofinance');
  const ym = (v) => (v == null || Number.isNaN(v)) ? '—' : '¥' + Number(v).toFixed(2);
  const fold = (title, content, open) => `<details class="pf-fold" ${open ? 'open' : ''} style="margin:12px 12px 0"><summary style="cursor:pointer;font-weight:600;font-size:15px;padding:12px 16px;background:#fff;border-radius:10px;border:1px solid #e2e8f0;list-style:none;user-select:none;color:#1e293b">${title}</summary><div style="margin-top:8px">${content}</div></details>`;
  el.innerHTML = '<div style="padding:24px;color:#666">加载中…</div>';
  let items = [], bills = [], dailyBills = [];
  try {
    const [resp, billResp, dailyResp] = await Promise.all([
      api('/api/catalog/promo-finance?limit=90'),
      api('/api/catalog/promo-monthly-bill?limit=200'),
      api('/api/catalog/promo-daily-bill?limit=1000'),
    ]);
    items = (resp && resp.items) || [];
    bills = (billResp && billResp.items) || [];
    dailyBills = (dailyResp && dailyResp.items) || [];
  } catch (e) {
    items = []; bills = []; dailyBills = [];
  }
  if (!items.length) {
    el.innerHTML = '<div style="padding:32px;color:#999;text-align:center">暂无财务快照数据。<br>每天 22:00 定时采集（如若月下/嘉裕/欧世艺），积累后可看余额与花费趋势。</div>';
    return;
  }
  // 按店铺分组（rows 已按日期倒序）
  const byShop = {};
  items.forEach(r => {
    if (!byShop[r.shop_id]) byShop[r.shop_id] = { name: r.shop_name || ('店铺 ' + r.shop_id), rows: [] };
    byShop[r.shop_id].rows.push(r);
  });
  const cards = Object.values(byShop).map(g => {
    const latest = g.rows[0];
    const recent = [...g.rows].slice(0, 14).reverse();
    // 余额告警：余额 < 昨日花费（即撑不过一天）
    const balance = latest.total_balance;
    const yesterday = latest.yesterday_spend || 0;
    const danger = balance != null && balance < yesterday;
    const warn = balance != null && balance < yesterday + 100;
    const badge = danger
      ? '<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:600">⚠️ 余额告急（撑不过1天）</span>'
      : warn
        ? '<span style="background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:600">⚠️ 余额偏低</span>'
        : '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:600">✓ 余额充足</span>';
    return `
      <div class="panel" style="margin:12px;padding:16px 18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <b style="font-size:16px">${g.name}</b>${badge}
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">
          <div style="flex:1;min-width:110px;background:#f8fafc;border-radius:10px;padding:12px">
            <div style="color:#64748b;font-size:12px">总余额</div>
            <div style="font-size:22px;font-weight:700;margin-top:4px">${ym(balance)}</div>
          </div>
          <div style="flex:1;min-width:110px;background:#f8fafc;border-radius:10px;padding:12px">
            <div style="color:#64748b;font-size:12px">今日花费</div>
            <div style="font-size:22px;font-weight:700;margin-top:4px;color:#ea580c">${ym(latest.today_spend)}</div>
          </div>
          <div style="flex:1;min-width:110px;background:#f8fafc;border-radius:10px;padding:12px">
            <div style="color:#64748b;font-size:12px">昨日花费</div>
            <div style="font-size:22px;font-weight:700;margin-top:4px">${ym(yesterday)}</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <tr style="color:#94a3b8;text-align:left">
            <th style="padding:6px 4px;font-weight:500">日期</th>
            <th style="padding:6px 4px;font-weight:500">余额</th>
            <th style="padding:6px 4px;font-weight:500">今日花费</th>
            <th style="padding:6px 4px;font-weight:500">昨日花费</th>
          </tr>
          ${recent.map(r => `
            <tr style="border-top:1px solid #f1f5f9">
              <td style="padding:6px 4px;color:#475569">${r.stat_date}</td>
              <td style="padding:6px 4px">${ym(r.total_balance)}</td>
              <td style="padding:6px 4px;color:#ea580c">${ym(r.today_spend)}</td>
              <td style="padding:6px 4px">${ym(r.yesterday_spend)}</td>
            </tr>`).join('')}
        </table>
      </div>`;
  }).join('');
  // 月结账单区块（跨店铺，按月逐一展开）
  let billHtml = '';
  if (bills.length) {
    const billRows = expandMonthlyBills(bills).map(r => {
      let amtHtml;
      if (r.merged && r.amount == null) {
        amtHtml = '<span style="color:#cbd5e1">↳ 同上</span>';
      } else if (r.merged) {
        amtHtml = `${ym(r.amount)} <span style="color:#94a3b8;font-size:11px;font-weight:400">（${r.mergedCount}个月合计）</span>`;
      } else {
        amtHtml = `<span style="font-weight:600;${Number(r.amount) < 0 ? 'color:#dc2626' : ''}">${ym(r.amount)}</span>`;
      }
      return `
        <tr style="border-top:1px solid #f1f5f9">
          <td style="padding:6px 4px">${r.shopName}</td>
          <td style="padding:6px 4px;color:#475569">${r.label}</td>
          <td style="padding:6px 4px;color:#64748b">${r.subject}</td>
          <td style="padding:6px 4px;text-align:right">${amtHtml}</td>
        </tr>`;
    }).join('');
    billHtml = fold('📅 月明细 · 月结账单（待开票金额）', `
      <div class="panel" style="padding:16px 18px">
        <div style="color:#94a3b8;font-size:12px">按月逐一展示；合并账单已展开，金额为整单合计；负数会与后续月份合并开票</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">
          <tr style="color:#94a3b8;text-align:left">
            <th style="padding:6px 4px;font-weight:500">店铺</th>
            <th style="padding:6px 4px;font-weight:500">月份</th>
            <th style="padding:6px 4px;font-weight:500">开票主体</th>
            <th style="padding:6px 4px;font-weight:500;text-align:right">金额</th>
          </tr>
          ${billRows}
        </table>
      </div>`);
  }
  // 日账单区块（按日汇总：支出/收入/净额）
  let dailyHtml = '';
  if (dailyBills.length) {
    const dailyMap = {};
    dailyBills.forEach(r => {
      const day = (r.flow_time || '').slice(0, 10);
      if (!day) return;
      const key = r.shop_id + '|' + day;
      if (!dailyMap[key]) dailyMap[key] = { shop_name: r.shop_name || '', day, spend: 0, income: 0 };
      const amt = Number(r.amount) || 0;
      if (r.flow_type === 2) dailyMap[key].spend += amt;
      else dailyMap[key].income += amt;
    });
    const dailyRows = Object.values(dailyMap).sort((a, b) => b.day.localeCompare(a.day)).map(d => {
      const net = d.income - d.spend;
      return `
        <tr style="border-top:1px solid #f1f5f9">
          <td style="padding:6px 4px;color:#475569">${d.day}</td>
          <td style="padding:6px 4px">${d.shop_name}</td>
          <td style="padding:6px 4px;color:#ea580c;text-align:right">${ym(d.spend)}</td>
          <td style="padding:6px 4px;color:#16a34a;text-align:right">${ym(d.income)}</td>
          <td style="padding:6px 4px;font-weight:600;text-align:right;${net < 0 ? 'color:#dc2626' : 'color:#16a34a'}">${net >= 0 ? '+' : ''}${ym(net)}</td>
        </tr>`;
    }).join('');
    dailyHtml = fold(`📊 日明细 · 按日汇总（${Object.keys(dailyMap).length} 天）`, `
      <div class="panel" style="padding:16px 18px">
        <div style="color:#94a3b8;font-size:12px">支出=推广花费；收入=充值/红包；净额=收入−支出（负数=当日净烧钱）</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">
          <tr style="color:#94a3b8;text-align:left">
            <th style="padding:6px 4px;font-weight:500">日期</th>
            <th style="padding:6px 4px;font-weight:500">店铺</th>
            <th style="padding:6px 4px;font-weight:500;text-align:right">支出</th>
            <th style="padding:6px 4px;font-weight:500;text-align:right">收入</th>
            <th style="padding:6px 4px;font-weight:500;text-align:right">净额</th>
          </tr>
          ${dailyRows}
        </table>
      </div>`);
  }
  el.innerHTML = fold('💳 卡片 · 各店余额与花费', cards, true) + dailyHtml + billHtml;
}

function toggleNavGroup(name, ev) {
  if (ev) ev.stopPropagation();
  const sub = $('#nav-sub-' + name);
  const group = $('#nav-group-' + name);
  if (sub) {
    sub.hidden = !sub.hidden;
    if (group) group.classList.toggle('open', !sub.hidden);
  }
}

// 从 GUIDE_ITEMS 动态生成「运营指南」侧边栏子菜单（首项为总览目录页）
function renderGuideSubMenu() {
  const sub = $('#nav-sub-guide');
  if (!sub) return;
  const items = [
    { view:'guidehub', icon:'📚', title:'运营指南总览' },
    ...GUIDE_ITEMS.map(it => ({ view:it.view, icon:it.icon, title:it.title }))
  ];
  sub.innerHTML = items.map(it =>
    `<button class="nav-item sub" data-view="${it.view}"><span class="ico">${it.icon}</span><span class="nav-label">${it.title}</span></button>`
  ).join('');
}

// 运营指南目录页：展示所有子模块的概要卡片，点击进入对应视图
function renderGuideHub() {
  const el = $('#view-guidehub');
  el.innerHTML = `
    <div style="background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:12px;padding:16px 18px;margin:12px;color:#fff">
      <div style="font-size:16px;font-weight:700">📚 运营指南</div>
      <div style="font-size:12px;opacity:.92;margin-top:6px;line-height:1.6">运营方法论、平台操作、选品规划，一站查阅。</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin:12px">
      ${GUIDE_ITEMS.map(it => `
        <div onclick="setView('${it.view}')" style="background:#fff;border-radius:12px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,.06);cursor:pointer;transition:transform .15s,box-shadow .15s" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 16px rgba(0,0,0,.1)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <span style="width:40px;height:40px;border-radius:10px;background:#f3e8ff;display:grid;place-items:center;font-size:20px">${it.icon}</span>
            <span style="font-size:15px;font-weight:700;color:#1e3a5f">${it.title}</span>
          </div>
          <div style="font-size:13px;color:#64748b;line-height:1.6">${it.desc}</div>
          <div style="font-size:12px;color:#7c3aed;margin-top:10px;font-weight:600">进入 →</div>
        </div>
      `).join('')}
    </div>
  `;
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
// 运营闭环全景：把 flow-status 数据映射成每个环节的徽标文案
function flowStatText(step, flow) {
  if (!step.stat) return step.desc || '';
  switch (step.stat) {
    case 'suppliers': return `${flow.suppliers} 家 · ${flow.supplier_products} 品`;
    case 'keywords': return `${flow.keywords.main} 主词 · ${flow.keywords.used} 已用`;
    case 'catalog': return `${flow.products} 品 · ${flow.skus} SKU`;
    case 'title_opt': return `${flow.title_opt.done}/${flow.title_opt.total} 已改后台`;
    case 'invest': return `${state.products.length} 个精算`;
    case 'promotions': return `${flow.promotions} 条推广`;
    case 'competitors': return `${flow.competitors} 竞品`;
    case 'scheduler': return `${flow.scheduled_tasks} 任务 · ${flow.task_runs} 次`;
    case 'reviews': return `${flow.reviews} 评价`;
    case 'logs': return `${flow.logs.total} 条`;
    case 'freight': return `${flow.freight} 条`;
    case 'packing': return `${flow.pack_records} 条`;
    default: return step.desc || '';
  }
}

// 运营闭环全景区块：5 阶段 × 环节卡片，可点击跳转对应模块
function flowMapHTML(flow) {
  flow = flow || {};
  const stages = FLOW_STAGES.map((st, i) => {
    const steps = st.steps.map(sp => `
      <div class="flow-step" onclick="setView('${sp.view}')" style="--fc:${st.color}">
        <div class="flow-step-top"><span class="flow-step-ico">${sp.icon}</span><span class="flow-step-name">${esc(sp.name)}</span></div>
        <div class="flow-step-stat">${esc(flowStatText(sp, flow))}</div>
      </div>`).join('');
    const arrow = i < FLOW_STAGES.length - 1 ? `<div class="flow-arrow">›</div>` : '';
    return `
      <div class="flow-stage">
        <div class="flow-stage-head" style="--fc:${st.color}"><span class="flow-stage-ico">${st.icon}</span><span class="flow-stage-name">${esc(st.name)}</span></div>
        <div class="flow-steps">${steps}</div>
      </div>${arrow}`;
  }).join('');
  return `
    <div class="panel" style="margin-bottom:16px">
      <div class="panel-header"><h2>🔄 运营闭环全景</h2><span class="badge">选品 → 上架 → 测款 → 采集 → 复盘</span></div>
      <div class="flow-map">${stages}</div>
    </div>`;
}

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

function lastMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const ly = m === 0 ? y - 1 : y;
  const lm = m === 0 ? 11 : m - 1;
  const lastDay = new Date(ly, lm + 1, 0).getDate();
  const pad = n => String(n).padStart(2, '0');
  const start = `${ly}-${pad(lm + 1)}-01`;
  const end = `${ly}-${pad(lm + 1)}-${pad(lastDay)}`;
  return { start, end, label: `${start} ~ ${end}` };
}

async function renderDashboard() {
  const p = shopProducts();
  const count = p.length;
  const avgMargin = count ? p.reduce((s,x)=>s+x.margin,0)/count : 0;
  let totalAdSpend = p.reduce((s,x)=>s+(x.ad_spend||0),0);
  let totalOrders = p.reduce((s,x)=>s+(x.orders||0),0);
  const risky = p.filter(x => x.break_even_roi!==Infinity && x.break_even_roi > 3.5).length;
  const done = shopTasks().filter(t=>t.done).length;

  // 拉真实经营数据（商品库 catalog），按当前店铺平台匹配，默认上月日期段
  const lm = lastMonthRange();
  let ov = null;
  try {
    const resp = await api(`/api/catalog/platform-overview?start=${lm.start}&end=${lm.end}`);
    ov = (resp.items || []).find(x => x.name === state.shop) || null;
  } catch (e) {}

  // 运营闭环全景各环节计数（选品 → 上架 → 测款 → 采集 → 复盘）
  let flow = {};
  try { flow = await api('/api/catalog/flow-status'); } catch (e) {}

  const realHTML = ov ? `
    <div class="panel" style="margin-bottom:16px">
      <div class="panel-header"><h2>📊 真实经营数据（${esc(state.shop)}）</h2><span class="badge">${lm.label}</span></div>
      <div class="stats-grid">
        <div class="stat-card"><div class="label">真实商品数</div><div class="value">${ov.products}</div><div class="hint">catalog 商品库（全量）</div></div>
        <div class="stat-card"><div class="label">SKU 数</div><div class="value">${ov.skus}</div><div class="hint">规格明细（全量）</div></div>
        <div class="stat-card"><div class="label">订单数</div><div class="value">${ov.orders}</div><div class="hint">${lm.label} 有效成交</div></div>
        <div class="stat-card"><div class="label">GMV（元）</div><div class="value">¥${fmt(ov.gmv)}</div><div class="hint">${lm.label} 买家实付</div></div>
      </div>
    </div>
  ` : '';

  // 三方对账异常（打单 / 订单 / 运费）
  let threeAlerts = [];
  try {
    const three = await api('/api/freight/three-way');
    for (const en of (three.entries || [])) {
      for (const r of (en.months || [])) {
        const issues = threeWayFlags(r).map(f => f.text);
        if (issues.length) threeAlerts.push({ entry: en.name, ym: r.ym, issues });
      }
    }
  } catch (e) {}

  const alertHTML = threeAlerts.length ? `
    <div class="panel" style="margin-bottom:16px;border-left:4px solid #dc2626;cursor:pointer" onclick="setView('freight')">
      <div class="panel-header"><h2>⚠️ 对账异常 ${threeAlerts.length} 条</h2><span class="badge">点击查看</span></div>
      ${threeAlerts.slice(0, 5).map(a => `<div class="task-row"><div class="task-body"><div class="task-title">${esc(a.entry)} ${esc(fmtYm(a.ym))}</div><div class="task-meta" style="color:#dc2626">${esc(a.issues.join('、'))}</div></div></div>`).join('')}
      ${threeAlerts.length > 5 ? `<div class="perf-hint" style="margin-top:6px">还有 ${threeAlerts.length - 5} 条，点进「运费结算」查看</div>` : ''}
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

    ${flowMapHTML(flow)}

    ${alertHTML}

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
          <div class="field"><label>平台商品ID（关联真实ROI）</label><input name="platform_product_id" value="${esc(val('platform_product_id'))}" placeholder="如 444093761930"></div>
        </div>
        <div class="field-row">
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
const catalogCache = { tree: [], stats: {}, orders: [], analysis: null, filter: '', mods: [], modCounts: {}, goodsEffect: [], performance: null, perfAll: null, promoAnalysis: null, realRoi: null, promoShop: 'all', promoPeriod: 'all', lowStock: [], selection: null, freight: null, freightMatch: null, freightMatchPage: 1, freightMatchPageSize: 20, freightRate: [], freightCompare: null, freightCompareMonth: '', suppliers: [], supplierProducts: {}, freightMonth: '', freightShop: null, deleteMode: false, perfShop: null, perfRange: null, perfPreset: 'all', perfStatuses: [], orderStatuses: [], serverToday: '' };

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
    const [stats, treeResp, ordersResp, analysis, modsResp, countsResp, geResp, perfResp, perfAllResp, promoResp, realRoiResp, lowResp, selResp, freightResp, freightMatchResp, freightRateResp, freightCompareResp, suppliersResp, statusesResp] = await Promise.all([
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
      api('/api/catalog/product-real-roi'),
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
    catalogCache.realRoi = realRoiResp || null;
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
          ${s.prefix ? `<button class="btn sm" data-sup-new="${s.id}" style="margin-left:8px;padding:3px 10px;font-size:12px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer">🆕 采集新品</button>` : ''}
        </div>
        <div class="sup-body" id="sup-body-${s.id}" hidden></div>
      </div>`).join('');
    // 采集新品按钮
    listEl.querySelectorAll('[data-sup-new]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const sid = Number(btn.dataset.supNew);
        btn.disabled = true; btn.textContent = '采集中…';
        try {
          const resp = await api('/api/supplier/fetchNew', 'POST', { supplier_id: sid });
          showSupplierNewModal(resp, sups.find(s => s.id === sid));
        } catch (err) {
          toast('采集失败：' + (err.message || err));
        } finally {
          btn.disabled = false; btn.textContent = '🆕 采集新品';
        }
      };
    });
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

function showSupplierNewModal(resp, sup) {
  const items = (resp && resp.items) || [];
  const name = (sup && sup.name) || ((resp && resp.supplier && resp.supplier.name) || '');
  const mask = document.createElement('div');
  mask.setAttribute('data-sup-new-mask', '1');
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  const rows = items.map(it => `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #f1f5f9">
      <span style="font-size:11px;color:#94a3b8;white-space:nowrap;font-family:'Roboto Mono',monospace">${esc(it.date)}</span>
      <span style="flex:1;font-size:13px;color:#334155;line-height:1.4">${esc(it.title)}</span>
      <span style="font-size:13px;color:#dc2626;font-weight:700;white-space:nowrap">${it.price ? '¥' + esc(it.price) : '—'}</span>
    </div>`).join('');
  mask.innerHTML = `
    <div style="background:#fff;border-radius:12px;width:100%;max-width:560px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
      <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:700;font-size:15px;color:#334155">🆕 ${esc(name)} · 新品专区 <span style="font-size:12px;color:#94a3b8;font-weight:400">共 ${items.length} 件</span></div>
        <button onclick="this.closest('[data-sup-new-mask]').remove()" style="border:none;background:none;font-size:22px;line-height:1;cursor:pointer;color:#94a3b8">×</button>
      </div>
      <div style="padding:8px 20px;overflow-y:auto">
        ${rows || '<div style="color:#94a3b8;text-align:center;padding:32px">暂无新品</div>'}
      </div>
    </div>`;
  mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
  document.body.appendChild(mask);
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
  const freightEl = $('#freight-panel');
  if (freightEl) renderFreightPanel(freightEl);
}

async function loadFreightCompare(month) {
  catalogCache.freightCompareMonth = month || '';
  const qs = month ? '?month=' + encodeURIComponent(month) : '';
  try {
    catalogCache.freightCompare = await api('/api/catalog/freight-compare' + qs);
  } catch (e) { toast(e.message); return; }
  const freightEl = $('#freight-panel');
  if (freightEl) renderFreightPanel(freightEl);
}

window.copyToClip = async (text, label) => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    toast((label || '') + '已复制');
  } catch (e) { toast('复制失败，请长按手动复制'); }
};

async function showFreightOrderDetail(key) {
  if (!key) return;
  const overlay = document.createElement('div');
  overlay.className = 'freight-detail-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:999;display:flex;align-items:center;justify-content:center;padding:24px';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;padding:20px;max-width:520px;width:100%;max-height:86vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.22)';
  box.innerHTML = '<div class="empty">加载中…</div>';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  let d;
  try {
    d = await api('/api/freight/order-detail?tracking_no=' + encodeURIComponent(key));
  } catch (e) {
    box.innerHTML = '<div class="empty">❌ ' + esc(e.message) + '</div>';
    return;
  }
  if (!d || !d.found) {
    box.innerHTML = '<div class="empty">未找到该订单 / 运费信息</div>';
    return;
  }
  const o = d.order, f = d.freight;
  const row = (label, val, extra = '') => `<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #f5f6fa;font-size:13px"><span style="color:#8894ab;flex:0 0 auto">${label}</span><span style="color:#17203a;font-weight:600;text-align:right;word-break:break-all">${val}${extra}</span></div>`;
  const diffColor = f.diff == null ? '' : (f.diff > 0 ? 'color:#dc2626' : 'color:#16a34a');
  const diffTxt = f.diff == null ? '—' : (f.diff > 0 ? '+' : '') + fmt(f.diff);
  const addr = [o.province || '', o.city || '', o.district || ''].filter(Boolean).join(' ');
  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:16px;font-weight:700;color:#17203a">订单 + 运费详情</div>
      <button class="btn xs" onclick="this.closest('.freight-detail-overlay').remove()" style="flex:0 0 auto">✕ 关闭</button>
    </div>
    <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:6px">📦 订单信息</div>
    ${row('订单号', esc(o.order_no || '—'), ` <a href="javascript:;" style="color:#1d4ed8;font-size:12px" onclick="copyToClip('${esc(o.order_no)}','订单号')">复制</a>`)}
    ${row('店铺', esc(o.shop_name || '—'))}
    ${row('状态', esc(o.status || '—'))}
    ${row('规格', esc(o.spec || '—'))}
    ${row('数量', o.quantity != null ? o.quantity : '—')}
    ${row('买家实付', o.buyer_amount != null ? '¥' + fmt(o.buyer_amount) : '—')}
    ${row('卖家实收', o.seller_amount != null ? '¥' + fmt(o.seller_amount) : '—')}
    ${row('支付时间', esc(o.pay_time || '—'))}
    ${row('发货时间', esc(o.confirm_time || '—'))}
    ${row('收货地址', esc(addr || '—'))}
    <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin:14px 0 6px">🚚 运费信息</div>
    ${row('运单号', esc(f.tracking_no || '—'), ` <a href="javascript:;" style="color:#1d4ed8;font-size:12px" onclick="copyToClip('${esc(f.tracking_no)}','运单号')">复制</a>`)}
    ${row('面单账号', esc(f.account_name || '—'))}
    ${row('快递', esc(f.courier || '—'))}
    ${row('发货日期', esc(f.ship_date || '—'))}
    ${row('目的地', esc([f.province || '', f.city || ''].filter(Boolean).join(' ') || '—'))}
    ${row('结算重量', f.weight != null ? f.weight + ' kg' : '—')}
    ${row('快递费', f.freight_cost != null ? '¥' + fmt(f.freight_cost) : '—')}
    ${row('面单费', f.bill_fee != null ? '¥' + fmt(f.bill_fee) : '—')}
    ${row('附加费', f.extra_fee != null ? '¥' + fmt(f.extra_fee) : '—')}
    ${row('应结金额', f.total != null ? '¥' + fmt(f.total) : '—')}
    ${row('标准运费', f.standard != null ? '¥' + fmt(f.standard) : '—')}
    ${row('差值', f.diff == null ? '—' : `<span style="${diffColor}">${diffTxt}</span>`)}
  `;
}

async function showFreightDiffDialog() {
  let items = [];
  let latestText = '';
  const overlay = document.createElement('div');
  overlay.className = 'freight-diff-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:999;display:flex;align-items:center;justify-content:center;padding:16px';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;padding:16px;max-width:560px;width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.22)';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:16px;font-weight:700;color:#17203a">📝 差额记录（差额&gt;5元）</div>
      <button class="btn xs" onclick="this.closest('.freight-diff-overlay').remove()">✕</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center">
      <label style="font-size:13px;color:#4b5677;flex:0 0 auto">发货日期</label>
      <input type="date" id="diff-date" style="flex:1;padding:6px 8px;border:1px solid #e4e7f1;border-radius:8px;font-size:13px">
      <button class="btn sm primary" id="diff-load" style="flex:0 0 auto">加载</button>
    </div>
    <div style="font-size:11px;color:#8894ab;margin-bottom:8px">填「实际重量」自动算运费；差额&gt;0 即算错会标注，&gt;5元的单自动纳入下方文本</div>
    <div id="diff-list" style="flex:1;overflow-y:auto;min-height:120px;max-height:40vh"></div>
    <div id="diff-stats" style="margin-top:8px"></div>
    <div id="diff-output" style="margin-top:8px"></div>
  `;

  const defaultDate = catalogCache.serverToday || '';
  box.querySelector('#diff-date').value = defaultDate;
  const listEl = box.querySelector('#diff-list');
  const outEl = box.querySelector('#diff-output');
  const statsEl = box.querySelector('#diff-stats');

  const strip = n => parseFloat((n || 0).toFixed(2));

  const recalc = () => {
    const picks = [];
    let wrongCount = 0, bigCount = 0, wrongSum = 0;
    listEl.querySelectorAll('[data-diff-row]').forEach(row => {
      const i = parseInt(row.dataset.diffRow, 10);
      const it = items[i];
      if (!it) return;
      const fInp = row.querySelector('[data-diff-f]');
      const wInp = row.querySelector('[data-diff-w]');
      const dSpan = row.querySelector('[data-diff-d]');
      const actualFee = parseFloat(fInp.value);
      const actualWeight = parseFloat(wInp.value);
      if (!isNaN(actualFee)) {
        const total = it.total || 0;
        const diff = total - actualFee;
        if (diff > 5) {
          dSpan.textContent = '+' + strip(diff) + '元 ⚠大额';
          dSpan.style.color = '#dc2626';
          dSpan.style.fontWeight = '700';
          picks.push({ it, actualFee, actualWeight });
          bigCount++; wrongCount++; wrongSum += diff;
        } else if (diff > 0.005) {
          dSpan.textContent = '+' + strip(diff) + '元 算错';
          dSpan.style.color = '#ea580c';
          dSpan.style.fontWeight = '700';
          wrongCount++; wrongSum += diff;
        } else if (diff < -0.005) {
          dSpan.textContent = strip(diff) + '元 少收';
          dSpan.style.color = '#16a34a';
        } else {
          dSpan.textContent = '相符';
          dSpan.style.color = '#16a34a';
        }
      } else {
        dSpan.textContent = '';
      }
    });
    statsEl.innerHTML = wrongCount > 0
      ? `<div style="font-size:12px;color:#4b5677;padding:8px 10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px">⚠️ 本日 <b style="color:#ea580c">${wrongCount}</b> 单算错（多收 <b style="color:#ea580c">${strip(wrongSum)}</b> 元），其中 <b style="color:#dc2626">${bigCount}</b> 单差额&gt;5元已纳入文本</div>`
      : '';
    if (!picks.length) {
      latestText = '';
      window.__freightDiffText = '';
      outEl.innerHTML = '<div class="empty">暂无差额&gt;5元的单（填实际运费后自动生成）</div>';
      return;
    }
    const lines = picks.map(p => {
      const w = isNaN(p.actualWeight) ? (p.it.weight != null ? p.it.weight : '') : p.actualWeight;
      return `${p.it.tracking_no}，${p.it.spec}，¥${(p.it.total || 0).toFixed(2)}，${p.it.province} ${p.it.city}，重量${w}，实际运费${strip(p.actualFee)}`;
    });
    const sumTotal = picks.reduce((s, p) => s + (p.it.total || 0), 0);
    const sumFee = picks.reduce((s, p) => s + p.actualFee, 0);
    const diffTotal = sumTotal - sumFee;
    const totalExpr = picks.map(p => strip(p.it.total || 0)).join('+');
    const feeExpr = picks.map(p => strip(p.actualFee)).join('-');
    const sumLine = `${totalExpr}=${strip(sumTotal)}-${feeExpr}=${strip(diffTotal)}`;
    latestText = [...lines, sumLine, `差额${strip(diffTotal)}元`].join('\n');
    window.__freightDiffText = latestText;
    outEl.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:6px">已纳入 ${picks.length} 单（差额合计 <span style="color:#dc2626">${strip(diffTotal)}元</span>）</div>
      <textarea readonly style="width:100%;height:140px;padding:8px;border:1px solid #e4e7f1;border-radius:8px;font-size:12px;line-height:1.6;font-family:monospace;box-sizing:border-box">${esc(latestText)}</textarea>
      <button class="btn primary" style="width:100%;margin-top:8px" onclick="copyToClip(window.__freightDiffText || '', '差额记录')">📋 复制文本</button>
    `;
  };

  const load = async () => {
    window.__freightDiffText = '';
    const date = box.querySelector('#diff-date').value;
    listEl.innerHTML = '<div class="empty">加载中…</div>';
    outEl.innerHTML = '';
    try {
      const d = await api('/api/freight/by-date' + (date ? '?date=' + encodeURIComponent(date) : ''));
      items = d.items || [];
    } catch (e) { listEl.innerHTML = '<div class="empty">❌ ' + esc(e.message) + '</div>'; return; }
    if (!items.length) {
      listEl.innerHTML = '<div class="empty">该日期暂无运费单</div>';
      return;
    }
    listEl.innerHTML = items.map((it, i) => {
      const w = it.weight != null ? it.weight : '';
      const est = it.est_weight != null ? it.est_weight : '';
      const estHint = est !== '' ? ` · 推断 <b style="color:#0ea5e9">${est}kg</b>` : '';
      return `
        <div style="border:1px solid #e4e7f1;border-radius:10px;padding:8px 10px;margin-bottom:8px" data-diff-row="${i}">
          <div style="font-size:12px;color:#4b5677;line-height:1.5">
            <b style="color:#17203a">${esc(it.tracking_no || '')}</b> · ${esc(it.spec || '')}<br>
            ¥<b style="color:#dc2626">${(it.total || 0).toFixed(2)}</b> · ${esc(it.province || '')} ${esc(it.city || '')} · 账单重量 ${w}kg${estHint}
          </div>
          <div style="display:flex;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap">
            <input data-diff-w="${i}" type="number" step="0.01" value="${est}" placeholder="实际重量kg" style="width:96px;padding:5px 6px;border:1px solid #e4e7f1;border-radius:6px;font-size:12px">
            <input data-diff-f="${i}" type="number" step="0.01" placeholder="实际运费" style="width:96px;padding:5px 6px;border:1px solid #e4e7f1;border-radius:6px;font-size:12px">
            <span data-diff-d="${i}" style="font-size:12px;font-weight:700"></span>
          </div>
        </div>`;
    }).join('');
    listEl.querySelectorAll('[data-diff-f]').forEach(inp => { inp.oninput = () => recalc(); });
    listEl.querySelectorAll('[data-diff-w]').forEach(inp => {
      inp.oninput = async () => {
        const i = parseInt(inp.dataset.diffW, 10);
        const it = items[i];
        const w = parseFloat(inp.value);
        if (it && !isNaN(w) && w > 0 && (it.province || it.city)) {
          const fInp = inp.closest('[data-diff-row]').querySelector('[data-diff-f]');
          try {
            const c = await api('/api/freight/calc?province=' + encodeURIComponent(it.province || '') + '&city=' + encodeURIComponent(it.city || '') + '&weight=' + w);
            if (c.ok && c.total != null) fInp.value = c.total;
          } catch (e) { /* 静默，保留手动填 */ }
        }
        recalc();
      };
    });
    // 预填了推断重量的单，自动算一次运费（无需手动触发）
    listEl.querySelectorAll('[data-diff-w]').forEach(inp => {
      if (inp.value && parseFloat(inp.value) > 0) inp.oninput();
    });
    recalc();
  };

  box.querySelector('#diff-load').onclick = load;
  load();
}

function renderFreightPanel(freightEl) {
  const fr = catalogCache.freight;
  if (!fr || fr.total <= 0) {
    freightEl.innerHTML = '<div class="empty">暂无运费账单。<div style="margin-top:10px"><button class="btn sm primary" onclick="importFreightBill()">⬆ 导入中通账单 xlsx</button></div></div>';
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
  const maTotal = anomalies.length;
  const maPageSize = catalogCache.freightMatchPageSize || 20;
  const maTotalPages = Math.max(1, Math.ceil(maTotal / maPageSize));
  let maPage = catalogCache.freightMatchPage || 1;
  if (maPage > maTotalPages) maPage = maTotalPages;
  catalogCache.freightMatchPage = maPage;
  const maStart = (maPage - 1) * maPageSize;
  const maItems = anomalies.slice(maStart, maStart + maPageSize);
  const matchHTML = maTotal
    ? `
    <div class="callout" style="margin-bottom:10px">共 ${fm.total_groups} 组「相同 SKU+数量」，其中 ${fm.anomaly_total} 单运费偏离标准（多为重量差异）。</div>
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
      <span style="font-size:12px;color:#4b5677">每页</span>
      <select data-match-page-size style="padding:4px 8px;border:1px solid #e4e7f1;border-radius:6px;font-size:12px">
        ${[20, 50, 200].map(n => `<option value="${n}" ${maPageSize === n ? 'selected' : ''}>${n}</option>`).join('')}
      </select>
      <button class="btn xs" data-match-prev ${maPage <= 1 ? 'disabled' : ''} style="${maPage <= 1 ? 'opacity:.4;pointer-events:none' : ''}">‹ 上一页</button>
      <span style="font-size:12px;color:#4b5677">${maPage} / ${maTotalPages} 页（共 ${maTotal} 条）</span>
      <button class="btn xs" data-match-next ${maPage >= maTotalPages ? 'disabled' : ''} style="${maPage >= maTotalPages ? 'opacity:.4;pointer-events:none' : ''}">下一页 ›</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>店铺</th><th>订单号</th><th>数量</th><th>规格</th><th>标准运费</th><th>实际运费</th><th>差值</th><th>重量</th><th>目的地</th></tr></thead>
      <tbody>${maItems.map(a => `
        <tr>
          <td>${esc(a.shop_name || '—')}</td>
          <td><a href="javascript:;" style="color:#1d4ed8;font-weight:600;text-decoration:none" onclick="showFreightOrderDetail('${esc(a.tracking_no || a.order_no)}')" title="点击查看完整订单 + 运费信息">${esc((a.order_no || '').slice(0, 10))}${(a.order_no || '').length > 10 ? '…' : ''}</a></td>
          <td>${a.quantity != null ? a.quantity : '—'}</td>
          <td title="${esc(a.spec)}">${esc((a.spec || '').slice(0, 14))}${(a.spec || '').length > 14 ? '…' : ''}</td>
          <td>¥${fmt(a.standard_fee)}</td>
          <td>¥${fmt(a.actual_fee)}</td>
          <td class="${a.diff > 0 ? 'stock-low' : ''}">${a.diff > 0 ? '+' : ''}${fmt(a.diff)}</td>
          <td>${a.weight != null ? a.weight + 'kg' : '—'}</td>
          <td>${esc(a.province)}${esc(a.city)}</td>
        </tr>`).join('')}
      </tbody></table></div>`
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
  const cmpMonths = (cmp && cmp.months) || [];
  const cmpMonthSel = cmpMonths.length ? `<select data-freight-compare-month style="margin-left:8px;padding:3px 8px;border:1px solid #e4e7f1;border-radius:6px;font-size:12px;font-weight:400;color:#4b5677"><option value="">全部月份</option>${cmpMonths.map(m => `<option value="${m}" ${catalogCache.freightCompareMonth === m ? 'selected' : ''}>${m}</option>`).join('')}</select>` : '';
  const bigDiff = cmp && cmp.big_diff != null ? cmp.big_diff : 1;
  const cmpHTML = cmp && cmp.total_compared > 0 ? `
    <div class="perf-summary" style="margin-bottom:12px">
      <div class="perf-card"><div class="p-label">已对账</div><div class="p-value">${cmp.total_compared}</div></div>
      <div class="perf-card"><div class="p-label">相符</div><div class="p-value">${cmp.match}</div></div>
      <div class="perf-card"><div class="p-label">多收</div><div class="p-value" style="color:var(--red)">${cmp.over}</div></div>
      <div class="perf-card"><div class="p-label">少收</div><div class="p-value">${cmp.under}</div></div>
      <div class="perf-card"><div class="p-label">多收总额</div><div class="p-value" style="color:var(--red)">¥${fmt(cmp.over_amount)}</div></div>
      <div class="perf-card"><div class="p-label">⚠大误差(≥${bigDiff}元)</div><div class="p-value" style="color:var(--red)">${cmp.big_count || 0}</div></div>
      <div class="perf-card"><div class="p-label">⚠重量算错</div><div class="p-value" style="color:#ea580c">${cmp.weight_wrong_count || 0}</div></div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>规格</th><th>重量(账单→推断)</th><th>标准</th><th>实际</th><th>差</th><th>目的地</th></tr></thead>
      <tbody>${cmp.items.slice(0, 20).map(x => `
        <tr style="${x.big ? 'background:#fff1f0;' : ''}">
          <td title="${esc(x.spec)}">${esc((x.spec || '').slice(0, 14))}${(x.spec || '').length > 14 ? '…' : ''}</td>
          <td>${x.est_weight != null && Math.abs(x.est_weight - x.weight) > 0.05 ? `${x.weight}→<b style="color:#ea580c">${x.est_weight}</b>kg` : `${x.weight}kg`}</td>
          <td>¥${fmt(x.standard)}</td>
          <td>¥${fmt(x.actual)}</td>
          <td class="${x.diff > 0 ? 'stock-low' : ''}" style="${x.big ? 'font-weight:700;' : ''}">${x.big ? '⚠' : ''}${x.diff > 0 ? '+' : ''}${fmt(x.diff)}</td>
          <td>${esc(x.province)}</td>
        </tr>`).join('')}
      </tbody></table></div>
    ${cmp.items.length > 20 ? `<div class="orders-more">仅显示前 20 条（按误差降序），共 ${cmp.items.length} 条</div>` : ''}`
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
      <button class="btn sm" data-freight-import>⬆ 导入账单</button>
      <button class="btn sm" data-freight-rematch>🔁 重新匹配</button>
      <button class="btn sm" data-freight-diff style="background:#fff7ed;color:#ea580c;border-color:#fed7aa">📝 差额记录</button>
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
    <h4 style="margin:0 0 8px">💰 自动对账 <span class="perf-hint">实际运费 vs 报价单标准</span>${cmpMonthSel}</h4>
    ${cmpHTML}`;
  freightEl.querySelector('[data-freight-month]').onchange = e => loadFreight(e.target.value, catalogCache.freightShop);
  freightEl.querySelector('[data-freight-shop]').onchange = e => loadFreight(catalogCache.freightMonth, e.target.value);
  freightEl.querySelector('[data-freight-import]').onclick = () => importFreightBill();
  freightEl.querySelector('[data-freight-diff]').onclick = () => showFreightDiffDialog();
  const maPsEl = freightEl.querySelector('[data-match-page-size]');
  if (maPsEl) maPsEl.onchange = e => { catalogCache.freightMatchPageSize = parseInt(e.target.value, 10); catalogCache.freightMatchPage = 1; renderFreightPanel(freightEl); };
  const maPrevEl = freightEl.querySelector('[data-match-prev]');
  if (maPrevEl) maPrevEl.onclick = () => { catalogCache.freightMatchPage = Math.max(1, (catalogCache.freightMatchPage || 1) - 1); renderFreightPanel(freightEl); };
  const maNextEl = freightEl.querySelector('[data-match-next]');
  if (maNextEl) maNextEl.onclick = () => { catalogCache.freightMatchPage = (catalogCache.freightMatchPage || 1) + 1; renderFreightPanel(freightEl); };
  const cmpMonthEl = freightEl.querySelector('[data-freight-compare-month]');
  if (cmpMonthEl) cmpMonthEl.onchange = e => loadFreightCompare(e.target.value);
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

async function importFreightBill() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    let b64;
    try {
      b64 = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
        fr.onerror = () => reject(new Error('文件读取失败'));
        fr.readAsDataURL(file);
      });
    } catch (e) { toast(e.message); return; }
    toast('⏳ 解析账单中…');
    try {
      const r = await api('/api/freight/import', 'POST', { data: b64 });
      if (r.ok) {
        toast(`导入成功：${r.imported} 单（跳过 ${r.skipped}），自动匹配 ${r.matched} 单`);
        await renderFreightView();
      } else {
        toast('导入失败：' + (r.error || '未知'));
      }
    } catch (e) { toast(e.message); }
  };
  input.click();
}


/* ---------------- 运费结算（独立视图） ---------------- */
// 三方比对异常判定：返回 [{level,text}]，level ∈ 红/黄/橙
function threeWayFlags(r) {
  const flags = [];
  if (r.pack_count > r.order_count) flags.push({ level: '红', text: '打单>订单' });
  if (r.freight_count > 0 && r.pack_count === 0) flags.push({ level: '黄', text: '有运费无打单' });
  else if (r.freight_count > 0 && r.pack_count > 0 && r.freight_count !== r.pack_count) flags.push({ level: '黄', text: '运费票数≠打单' });
  if (r.avg_fee != null && (r.avg_fee < 2.2 || r.avg_fee > 4.2)) flags.push({ level: '橙', text: '单均运费偏离' });
  return flags;
}

async function renderFreightView() {
  const el = $('#view-freight');
  el.innerHTML = '<div class="empty"><div class="big">🚚</div>加载中…</div>';
  try {
    const cmpQs = catalogCache.freightCompareMonth ? '?month=' + encodeURIComponent(catalogCache.freightCompareMonth) : '';
    const [freightResp, matchResp, rateResp, compareResp, threeResp, mappingResp, treeResp] = await Promise.all([
      api('/api/catalog/freight'),
      api('/api/catalog/freight/match-analysis'),
      api('/api/catalog/freight-rate'),
      api('/api/catalog/freight-compare' + cmpQs),
      api('/api/freight/three-way'),
      api('/api/freight/mapping'),
      api('/api/catalog/tree'),
    ]);
    catalogCache.freight = freightResp || null;
    catalogCache.freightMatch = matchResp || null;
    catalogCache.freightRate = rateResp.items || [];
    catalogCache.freightCompare = compareResp || null;
    if (treeResp && treeResp.items) catalogCache.tree = treeResp.items;
    paintFreightView(el, threeResp || {}, (mappingResp && mappingResp.items) || [], (treeResp && treeResp.items) || []);
  } catch (err) {
    el.innerHTML = `<div class="empty">❌ ${esc(err.message)}</div>`;
  }
}

function paintFreightView(el, threeWay, mappings, tree) {
  const shopList = [];
  for (const pl of tree) for (const sh of (pl.shops || [])) shopList.push(sh);
  const shopHint = shopList.map(sh => sh.id + '=' + sh.name).join('、');

  // 三方比对
  const entries = threeWay.entries || [];
  let threeHTML = '';
  if (!entries.length) {
    threeHTML = '<div class="empty">暂无三方比对数据</div>';
  } else {
    threeHTML = entries.map(en => {
      const rows = en.months || [];
      const rowHTML = rows.length ? rows.map(r => {
        const flags = threeWayFlags(r);
        const colors = {红:'#dc2626', 黄:'#d97706', 橙:'#ea580c'};
        const flag = flags.length
          ? flags.map(f => `<span style="color:${colors[f.level]};font-size:11px;font-weight:700">⚠${f.text}</span>`).join(' ')
          : '<span style="color:#16a34a;font-size:11px;font-weight:700">✓ 正常</span>';
        return `<tr>
          <td>${esc(fmtYm(r.ym))}</td>
          <td>${r.order_count}</td>
          <td>${r.pack_count}</td>
          <td>${r.freight_count}</td>
          <td>${r.freight_fee ? '¥' + fmt(r.freight_fee) : '—'}</td>
          <td>${flag}</td>
        </tr>`;
      }).join('') : '<tr><td colspan="6" style="text-align:center;color:#9aa4bb">暂无数据（缺打单登记 / 订单 / 运费）</td></tr>';
      return `<div class="orders-panel" style="margin-bottom:12px">
        <div class="orders-panel-head"><span class="orders-panel-title">${esc(en.name)}</span><span class="orders-panel-hint">店铺：${esc(en.shop_names || '未配置')} ｜ 运费账号：${esc(en.freight_account || '未配置')}</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>月份</th><th>订单数</th><th>打单数</th><th>运费票数</th><th>运费金额</th><th>校验</th></tr></thead>
          <tbody>${rowHTML}</tbody>
        </table></div>
      </div>`;
    }).join('');
  }

  // 映射配置
  let mappingHTML = mappings.map(m => `
    <div style="display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid #f5f6fa">
      <span style="width:108px;font-size:13px;font-weight:700;color:#17203a;flex:0 0 auto">${esc(m.entry_name || m.entry)}</span>
      <input data-map-shop="${m.entry}" value="${esc(m.shop_ids || '')}" placeholder="店铺ID逗号分隔" style="flex:1;min-width:0;padding:6px 8px;border:1px solid #e4e7f1;border-radius:6px;font-size:12px">
      <input data-map-account="${m.entry}" value="${esc(m.freight_account || '')}" placeholder="运费账号" style="flex:1;min-width:0;padding:6px 8px;border:1px solid #e4e7f1;border-radius:6px;font-size:12px">
      <button class="btn xs" data-map-save="${m.entry}" style="background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe;flex:0 0 auto">保存</button>
    </div>`).join('');

  el.innerHTML = `
    <div style="background:linear-gradient(135deg,#0ea5e9,#0284c7);border-radius:12px;padding:14px 16px;margin:12px;color:#fff">
      <div style="font-size:15px;font-weight:700">🚚 运费结算</div>
      <div style="font-size:12px;opacity:.92;margin-top:6px">打单数 · 订单数 · 运费，三方对账预警</div>
    </div>
    <div class="orders-panel" style="margin:12px">
      <div class="orders-panel-head"><span class="orders-panel-title">🔗 入口映射</span><span class="orders-panel-hint">打单入口 → 店铺ID → 运费账号（保存后三方比对自动对齐）</span></div>
      <div style="padding:12px">
        ${mappingHTML}
        <div class="perf-hint" style="margin-top:8px">店铺ID：${esc(shopHint)}</div>
      </div>
    </div>
    <div style="margin:12px">
      <div style="font-size:14px;font-weight:700;color:#1e3a5f;margin-bottom:8px">🔍 三方比对（按月）</div>
      ${threeHTML}
    </div>
    <div style="margin:12px">
      <div style="font-size:14px;font-weight:700;color:#1e3a5f;margin-bottom:8px">📦 运费账单</div>
      <div id="freight-panel"></div>
    </div>`;

  renderFreightPanel($('#freight-panel'));

  el.querySelectorAll('[data-map-save]').forEach(btn => {
    btn.onclick = async () => {
      const entry = btn.dataset.mapSave;
      const shopInput = el.querySelector('[data-map-shop="' + entry + '"]');
      const accountInput = el.querySelector('[data-map-account="' + entry + '"]');
      try {
        await api('/api/freight/mapping', 'POST', { entry: entry, shop_ids: shopInput.value.trim(), freight_account: accountInput.value.trim() });
        toast('映射已保存');
        renderFreightView();
      } catch (e) { toast(e.message); }
    };
  });
}


/* ---------------- 竞品监控 ---------------- */
const competitorState = { shopId: 5, ppid: '63360840', keyword: '门后挂钩', loading: false, items: [] };
const COMPETITOR_SHOPS = { 5: '嘉裕工艺品', 3: '如若月下', 1: '闲时来工艺', 6: 'OSHIYI欧世艺旗舰店' };
const buyerReviewState = { goodsId: '444093761930', loading: false, brief: null, full: null };

async function renderCompetitorsView() {
  const el = $('#view-competitors');
  paintCompetitors(el);
  if (competitorState.ppid && competitorState.keyword) await loadCompetitors();
}

function paintCompetitors(el) {
  el.innerHTML = `
    <div style="background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:12px;padding:14px 16px;margin:12px;color:#fff">
      <div style="font-size:15px;font-weight:700">🔍 竞品监控</div>
      <div style="font-size:12px;opacity:.92;margin-top:6px">搜同类商品，看价格/销量/主图，人工确认竞品</div>
    </div>
    <div style="background:#fff;border-radius:12px;padding:14px;margin:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)">
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <select id="comp-shop" style="flex:1;padding:8px;border:1px solid #e4e7f1;border-radius:8px;font-size:13px">
          ${Object.entries(COMPETITOR_SHOPS).map(([k,v]) => `<option value="${k}" ${competitorState.shopId==k?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <input id="comp-ppid" value="${esc(competitorState.ppid)}" placeholder="商品ID（如 63360840）" style="flex:1;min-width:0;padding:8px;border:1px solid #e4e7f1;border-radius:8px;font-size:13px">
        <input id="comp-keyword" value="${esc(competitorState.keyword)}" placeholder="搜索词（如 门后挂钩）" style="flex:1;min-width:0;padding:8px;border:1px solid #e4e7f1;border-radius:8px;font-size:13px">
      </div>
      <button class="btn primary" style="width:100%" onclick="collectCompetitors()">🔍 搜竞品</button>
    </div>
    <div style="background:#fff;border-radius:12px;padding:14px;margin:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)">
      <div style="font-size:13px;font-weight:700;margin-bottom:4px">💬 买家端评论提取</div>
      <div style="font-size:11px;color:#8899b0;margin-bottom:8px">走买家端详情页 · 提取评价标签+评论样本 · 独立存储不混后台评价</div>
      <div style="display:flex;gap:8px">
        <input id="br-goods-id" value="${esc(buyerReviewState.goodsId)}" placeholder="商品 goods_id（如 444093761930）" style="flex:1;min-width:0;padding:8px;border:1px solid #e4e7f1;border-radius:8px;font-size:13px">
        <button class="btn primary" style="flex:0 0 auto" onclick="collectBuyerReview()">标签</button>
        <button class="btn" style="flex:0 0 auto;background:#0ea5e9;color:#fff" onclick="collectBuyerReviewFull()">采全文</button>
      </div>
      <div id="br-result" style="margin-top:10px"></div>
    </div>
    <div id="comp-list" style="margin:12px"><div class="empty">输入商品ID和搜索词，点「搜竞品」</div></div>`;

  $('#comp-shop').onchange = e => { competitorState.shopId = parseInt(e.target.value, 10); };
  $('#comp-ppid').oninput = e => { competitorState.ppid = e.target.value.trim(); };
  $('#comp-keyword').oninput = e => { competitorState.keyword = e.target.value.trim(); };
  $('#br-goods-id').oninput = e => { buyerReviewState.goodsId = e.target.value.trim(); };
  if (buyerReviewState.goodsId) loadBuyerReview();
}

async function collectCompetitors() {
  const ppid = competitorState.ppid, keyword = competitorState.keyword;
  if (!ppid || !keyword) return toast('请填商品ID和搜索词');
  competitorState.loading = true;
  $('#comp-list').innerHTML = '<div class="empty"><div class="big">🔍</div>搜索中…（约15秒，买家端抓取）</div>';
  try {
    await api('/api/competitors/collect', 'POST', { shop_id: competitorState.shopId, platform_product_id: ppid, keyword });
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const d = await api('/api/competitors?platform_product_id=' + encodeURIComponent(ppid) + '&keyword=' + encodeURIComponent(keyword));
      if (d.items && d.items.length) { competitorState.items = d.items; renderCompList(); return; }
    }
    $('#comp-list').innerHTML = '<div class="empty">❌ 采集超时，请确认买家端登录态（9236）</div>';
  } catch (e) {
    $('#comp-list').innerHTML = `<div class="empty">❌ ${esc(e.message)}</div>`;
  }
  competitorState.loading = false;
}

async function loadCompetitors() {
  try {
    const d = await api('/api/competitors?platform_product_id=' + encodeURIComponent(competitorState.ppid) + '&keyword=' + encodeURIComponent(competitorState.keyword));
    competitorState.items = d.items || [];
    renderCompList();
  } catch (e) {
    $('#comp-list').innerHTML = `<div class="empty">❌ ${esc(e.message)}</div>`;
  }
}

function renderCompList() {
  const items = competitorState.items;
  if (!items.length) { $('#comp-list').innerHTML = '<div class="empty">暂无竞品数据</div>'; return; }
  const okCount = items.filter(x => x.status === 'ok').length;
  const noCount = items.filter(x => x.status === 'no').length;
  let h = `<div style="font-size:12px;color:#4b5677;margin:0 0 8px">共 ${items.length} 个 · 已确认 ${okCount} 个 · 已排除 ${noCount} 个</div>`;
  h += items.map(c => {
    const st = c.status;
    const border = st === 'ok' ? '2px solid #16a34a' : st === 'no' ? '2px solid #e4e7f1' : '1px solid #e4e7f1';
    const opacity = st === 'no' ? '0.45' : '1';
    return `<div style="display:flex;gap:10px;background:#fff;border-radius:12px;padding:10px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.05);border:${border};opacity:${opacity}">
      ${c.comp_img ? `<img src="${esc(c.comp_img)}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;flex:0 0 auto;background:#f0f2f7" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : '<div style="width:72px;height:72px;background:#f0f2f7;border-radius:8px;flex:0 0 auto"></div>'}
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;color:#17203a;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(c.comp_title)}</div>
        <div style="margin-top:4px;font-size:15px;font-weight:700;color:#dc2626">${c.comp_price != null ? '¥' + fmt(c.comp_price) : '—'} <span style="font-size:11px;color:#8899b0;font-weight:400">${esc(c.comp_sales || '')}</span></div>
        ${c.ai_reason ? `<div style="margin-top:3px;font-size:11px;color:#7c3aed">🤖 AI：${esc(c.ai_reason)}</div>` : ''}
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          ${st !== 'ok' ? `<button class="btn xs" style="background:#f0fdf4;color:#16a34a;border-color:#bbf7d0" onclick="confirmCompetitor(${c.id},'ok')">✓ 是竞品</button>` : ''}
          ${st !== 'no' ? `<button class="btn xs" style="background:#fee2e2;color:#dc2626;border-color:#fca5a5" onclick="confirmCompetitor(${c.id},'no')">✗ 排除</button>` : ''}
          ${(st === 'ok' || st === 'no') ? `<button class="btn xs" onclick="confirmCompetitor(${c.id},'pending')">撤销</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
  $('#comp-list').innerHTML = h;
}

async function confirmCompetitor(id, status) {
  try {
    await api('/api/competitors/confirm', 'POST', { id, status });
    const it = competitorState.items.find(x => x.id === id);
    if (it) it.status = status;
    renderCompList();
  } catch (e) { toast(e.message); }
}

/* ---------------- 买家端评论提取 ---------------- */

async function collectBuyerReview() {
  const gid = buyerReviewState.goodsId;
  if (!gid) return toast('请填 goods_id');
  $('#br-result').innerHTML = '<div class="empty"><div class="big">💬</div>提取标签中…（约30秒，买家端抓取）</div>';
  try {
    await api('/api/buyer-reviews/collect', 'POST', { goods_id: gid });
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const d = await api('/api/buyer-reviews?goods_id=' + encodeURIComponent(gid));
      const brief = (d.items || []).find(x => x.source === 'brief');
      if (brief) { buyerReviewState.brief = brief; renderBuyerReview(); return; }
    }
    $('#br-result').innerHTML = '<div class="empty">❌ 提取超时，请确认买家端登录态（9236）</div>';
  } catch (e) {
    $('#br-result').innerHTML = `<div class="empty">❌ ${esc(e.message)}</div>`;
  }
}

async function collectBuyerReviewFull() {
  const gid = buyerReviewState.goodsId;
  if (!gid) return toast('请填 goods_id');
  $('#br-result').innerHTML = '<div class="empty"><div class="big">💬</div>全文采集中…（约2分钟，翻页抓取）</div>';
  try {
    await api('/api/buyer-reviews/collect-full', 'POST', { goods_id: gid, target: 200 });
    for (let i = 0; i < 45; i++) {
      await new Promise(r => setTimeout(r, 4000));
      const d = await api('/api/buyer-reviews?goods_id=' + encodeURIComponent(gid));
      const full = (d.items || []).find(x => x.source === 'full');
      if (full) { buyerReviewState.full = full; renderBuyerReview(); return; }
    }
    $('#br-result').innerHTML = '<div class="empty">❌ 全文采集超时，请确认买家端登录态（9236）</div>';
  } catch (e) {
    $('#br-result').innerHTML = `<div class="empty">❌ ${esc(e.message)}</div>`;
  }
}

async function loadBuyerReview() {
  try {
    const d = await api('/api/buyer-reviews?goods_id=' + encodeURIComponent(buyerReviewState.goodsId));
    const items = d.items || [];
    const brief = items.find(x => x.source === 'brief');
    const full = items.find(x => x.source === 'full');
    if (brief) buyerReviewState.brief = brief;
    if (full) buyerReviewState.full = full;
    if (brief || full) renderBuyerReview();
  } catch (e) { /* 静默 */ }
}

function renderBuyerReview() {
  const brief = buyerReviewState.brief;
  const full = buyerReviewState.full;
  if (!brief && !full) return;
  let h = '';
  if (brief) {
    h += `<div style="font-size:12px;color:#4b5677;margin-bottom:6px">${esc(brief.goods_name || brief.goods_id)} · 评论总数 <b style="color:#dc2626;font-size:14px">${(brief.total_count || 0).toLocaleString()}</b></div>`;
    if (brief.tags && brief.tags.length) {
      h += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
      h += brief.tags.map(t => `<span style="font-size:12px;padding:4px 9px;border-radius:7px;background:#f5f3ff;color:#6d28d9">${esc(t.tag)} <b>${t.count}</b></span>`).join('');
      h += '</div>';
    }
    if (brief.comments && brief.comments.length) {
      h += '<div style="margin-top:10px;font-size:12px;color:#4b5677;font-weight:600">评论样本：</div>';
      h += brief.comments.map(c => `<div style="margin-top:6px;padding:8px;background:#f8fafc;border-radius:8px;font-size:12px;line-height:1.55;color:#17203a"><b>${esc(c.user || '匿名')}</b>：${esc(c.content || '')}</div>`).join('');
    }
  }
  if (full) {
    h += `<div style="margin-top:${brief ? '12px' : '0'};padding-top:${brief ? '10px' : '0'};${brief ? 'border-top:1px dashed #e4e7f1;' : ''}font-size:12px;color:#4b5677">📋 全文评论：已采 <b style="color:#0ea5e9">${(full.comments || []).length}</b> 条 / 总计 ${(full.total_count || 0).toLocaleString()}</div>`;
    h += '<div style="max-height:420px;overflow-y:auto;margin-top:6px">';
    h += (full.comments || []).map(c => `<div style="margin-bottom:6px;padding:8px;background:#f8fafc;border-radius:8px;font-size:12px;line-height:1.5">
      <div style="color:#17203a"><b>${esc(c.user || '匿名')}</b> <span style="color:#8899b0;font-size:11px">${esc(c.spec || '')}</span></div>
      <div style="color:#4b5677;margin-top:2px">${esc(c.content || '')}</div>
    </div>`).join('');
    h += '</div>';
  }
  $('#br-result').innerHTML = h;
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
      <div class="orders-panel-head" data-toggle-time>
        <span class="orders-fold-icon">▸</span>
        <span class="orders-panel-title">⏰ 分时投放</span>
        <span class="orders-panel-count">24时段</span>
        <span class="orders-panel-hint">订单时段分布 → 分时折扣方案（动态演算）</span>
      </div>
      <div class="orders-panel-body" id="catalog-time" hidden></div>
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
`;

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
    const renderPromo = () => {
      const realRoiData = (catalogCache.realRoi && catalogCache.realRoi.items) || [];
      if (!realRoiData.length) {
        promoEl.innerHTML = '<div class="empty">暂无推广数据，点「⬆ 导入」导入推广 CSV</div>';
        return;
      }
      // 店铺 + 周期选项
      const shopMap = {};
      realRoiData.forEach(r => { if (!shopMap[r.shop_id]) shopMap[r.shop_id] = r.shop_name || ('店铺' + r.shop_id); });
      const shopOpts = Object.entries(shopMap).map(([id, name]) => ({ id: Number(id), name }));
      const periodSet = new Set();
      realRoiData.forEach(r => (r.periods || '').split(',').forEach(p => p && periodSet.add(p)));
      const periodOpts = [...periodSet].sort();
      // 筛选状态（跨渲染保持）
      const shopFilter = catalogCache.promoShop || 'all';
      const periodFilter = catalogCache.promoPeriod || 'all';
      // 过滤
      let filtered = realRoiData;
      if (shopFilter !== 'all') filtered = filtered.filter(r => r.shop_id === Number(shopFilter));
      if (periodFilter !== 'all') filtered = filtered.filter(r => (r.periods || '').includes(periodFilter));
      // 汇总
      const sum = (key) => filtered.reduce((s, r) => s + (r[key] || 0), 0);
      const totalSpend = sum('total_spend');
      const dealAmount = sum('deal_amount');
      const realAmount = sum('real_amount');
      const imp = sum('impressions');
      const clk = sum('clicks');
      const promoRoi = totalSpend ? (dealAmount / totalSpend).toFixed(2) : '—';
      const realRoiSum = totalSpend ? (realAmount / totalSpend).toFixed(2) : '—';
      const totalProfit = sum('profit');
      const profitColor = (r) => {
        if (r.profit == null) return '';
        if (r.profit < 0) return 'color:#dc2626;font-weight:700';
        if ((r.profit_margin ?? 0) < 0.1) return 'color:#d97706;font-weight:700';
        return 'color:#16a34a;font-weight:700';
      };
      // 按店铺分组
      const byShop = {};
      filtered.forEach(r => { (byShop[r.shop_id] = byShop[r.shop_id] || []).push(r); });
      promoEl.innerHTML = `
        <div class="promo-filter" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
          <select id="promo-shop-filter" style="padding:7px 10px;border:1px solid #cdd7e5;border-radius:8px;font-size:12px;background:#fff">
            <option value="all">🏪 全部店铺</option>
            ${shopOpts.map(s => `<option value="${s.id}" ${shopFilter === String(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
          </select>
          <select id="promo-period-filter" style="padding:7px 10px;border:1px solid #cdd7e5;border-radius:8px;font-size:12px;background:#fff">
            <option value="all">📅 全部周期</option>
            ${periodOpts.map(p => `<option value="${esc(p)}" ${periodFilter === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}
          </select>
        </div>
        <div class="perf-summary" style="margin-bottom:14px">
          <div class="perf-card"><div class="p-label">推广计划</div><div class="p-value">${filtered.length}</div></div>
          <div class="perf-card"><div class="p-label">总花费</div><div class="p-value">¥${fmt(totalSpend)}</div></div>
          <div class="perf-card"><div class="p-label">平台成交额</div><div class="p-value">¥${fmt(dealAmount)}</div></div>
          <div class="perf-card"><div class="p-label">平均ROI(平台)</div><div class="p-value">${promoRoi}</div></div>
          <div class="perf-card"><div class="p-label">真实成交额</div><div class="p-value">¥${fmt(realAmount)}</div></div>
          <div class="perf-card"><div class="p-label">真实ROI</div><div class="p-value" style="${realRoiSum !== '—' && Number(realRoiSum) < 1 ? 'color:#dc2626' : ''}">${realRoiSum}</div></div>
          <div class="perf-card"><div class="p-label">真实利润</div><div class="p-value" style="${totalProfit < 0 ? 'color:#dc2626' : 'color:#16a34a'}">¥${fmt(totalProfit)}</div></div>
          <div class="perf-card"><div class="p-label">曝光/点击</div><div class="p-value">${imp}/${clk}</div></div>
        </div>
        ${Object.entries(byShop).map(([sid, rows]) => {
          const sname = shopMap[Number(sid)] || ('店铺' + sid);
          return `
          <div class="orders-platform">
            <div class="orders-platform-head"><h4>🏪 ${esc(sname)}</h4></div>
            <div class="orders-shop">
              <div class="orders-shop-head" data-toggle-order-shop>
                <span class="orders-shop-fold">▸</span>
                <h5>📢 推广明细 <span class="badge">${rows.length} 条</span></h5>
              </div>
              <div class="orders-shop-body" hidden>
                <div class="table-wrap"><table>
                  <thead><tr><th>商品</th><th>花费</th><th>平台成交</th><th>平台ROI</th><th>真实成交</th><th>真实ROI</th><th>真实单数</th><th>利润</th><th>利润率</th><th>动作建议</th><th>曝光</th><th>点击</th></tr></thead>
                  <tbody>${rows.map(r => `<tr>
                    <td title="${esc(r.product_name)}">${esc((r.product_name || '').slice(0, 14))}${(r.product_name || '').length > 14 ? '…' : ''}</td>
                    <td>¥${fmt(r.total_spend)}</td>
                    <td>¥${fmt(r.deal_amount)}</td>
                    <td>${r.promo_roi != null ? r.promo_roi : '—'}</td>
                    <td>${r.real_amount != null ? '¥' + fmt(r.real_amount) : '—'}</td>
                    <td style="${r.real_roi != null && r.real_roi < 1 ? 'color:#dc2626;font-weight:700' : ''}">${r.real_roi != null ? r.real_roi : '—'}</td>
                    <td>${r.real_count != null ? r.real_count : '—'}</td>
                    <td style="${profitColor(r)}">${r.profit != null ? '¥' + fmt(r.profit) : '—'}</td>
                    <td style="${profitColor(r)}">${r.profit_margin != null ? (r.profit_margin * 100).toFixed(1) + '%' : '—'}</td>
                    <td style="${profitColor(r)};font-size:12px">${r.action_text || '—'}</td>
                    <td>${r.impressions}</td>
                    <td>${r.clicks}</td>
                  </tr>`).join('')}
                  </tbody></table></div>
              </div>
            </div>
          </div>`;
        }).join('')}
      `;
      // 绑定筛选事件
      promoEl.querySelector('#promo-shop-filter').onchange = (e) => {
        catalogCache.promoShop = e.target.value;
        renderPromo();
      };
      promoEl.querySelector('#promo-period-filter').onchange = (e) => {
        catalogCache.promoPeriod = e.target.value;
        renderPromo();
      };
      // 店铺折叠切换
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
    };
    renderPromo();

    // 分时投放渲染（懒加载，展开时才拉数据）
    const renderTime = async () => {
      const tel = $('#catalog-time');
      if (!tel) return;
      try {
        const [d, vote] = await Promise.all([
          api('/api/order-time-analysis'),
          api('/api/weekday-time-vote'),
        ]);
        const tierColor = { gold:'#16a34a', good:'#22c55e', normal:'#f59e0b', low:'#fb923c', freeze:'#dc2626' };
        const tierBg = { gold:'#dcfce7', good:'#f0fdf4', normal:'#fef9c3', low:'#ffedd5', freeze:'#fee2e2' };
        const cells = d.hours.map(h => `
          <div style="border:1px solid ${tierColor[h.tier]};border-radius:6px;padding:6px 4px;text-align:center;background:${tierBg[h.tier]}">
            <div style="font-size:11px;color:#475569">${h.hour}时</div>
            <div style="font-size:13px;font-weight:700;color:${tierColor[h.tier]}">${h.discount}%</div>
            <div style="font-size:10px;color:#8894ab">${h.count}单</div>
          </div>`).join('');
        const s = d.summary;
        const goldHours = d.hours.filter(h => h.tier === 'gold').map(h => h.hour + '时').join('、');
        const freezeHours = d.hours.filter(h => h.tier === 'freeze').map(h => h.hour + '时').join('、');
        const wk = ['日','一','二','三','四','五','六'];
        const maxW = Math.max(...d.weeks.map(x => x.count), 1);
        const weekBars = d.weeks.map(w => `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:12px;color:#475569;width:32px">周${wk[w.week]}</span>
            <div style="flex:1;background:#eef2f7;border-radius:4px;height:16px"><div style="height:100%;background:#3b82f6;border-radius:4px;width:${Math.round(w.count/maxW*100)}%"></div></div>
            <span style="font-size:12px;color:#8894ab;width:48px;text-align:right">${w.count}单</span>
          </div>`).join('');
        const voteRows = (vote.items || []).map(it => `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f1f5f9">
            <span style="font-size:12px;font-weight:700;color:#475569;width:36px">${it.weekday_name}</span>
            ${(it.top3 || []).map((t, i) => `
              <span style="flex:1;background:${i===0?'#dcfce7':i===1?'#f0fdf4':'#f8fafc'};border:1px solid ${i===0?'#16a34a':'#e2e8f0'};border-radius:6px;padding:6px;text-align:center">
                <span style="font-size:13px;font-weight:700;color:#16a34a">${t.hour}时</span>
                <span style="font-size:10px;color:#8894ab;display:block">${t.count}单·¥${Math.round(t.gmv)}</span>
              </span>`).join('')}
          </div>`).join('');
        tel.innerHTML = `
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0">
            <div style="flex:1;min-width:110px;background:#f8fafc;border-radius:8px;padding:10px"><div style="font-size:11px;color:#8894ab">总有效订单</div><div style="font-size:18px;font-weight:700">${s.total_orders}</div></div>
            <div style="flex:1;min-width:150px;background:#f8fafc;border-radius:8px;padding:10px"><div style="font-size:11px;color:#8894ab">黄金时段（加预算）</div><div style="font-size:13px;font-weight:700;color:#16a34a">${goldHours || '—'}</div></div>
            <div style="flex:1;min-width:110px;background:#f8fafc;border-radius:8px;padding:10px"><div style="font-size:11px;color:#8894ab">冰点时段（暂停）</div><div style="font-size:13px;font-weight:700;color:#dc2626">${freezeHours || '—'}</div></div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:6px;margin:12px 0">${cells}</div>
          <div style="font-size:11px;color:#8894ab;margin:4px 0 12px">🟢黄金150% 🟩较好120% 🟡常规100% 🟠低谷60% 🔴冰点30% — 相对均值自动分档，导入新订单后刷新即动态更新</div>
          <h4 style="margin:14px 0 8px">📅 星期分布</h4>
          <div style="max-width:420px">${weekBars}</div>
          <h4 style="margin:16px 0 4px">🏆 每天最佳投放 Top3（多指标投票）</h4>
          <div style="font-size:11px;color:#8894ab;margin:0 0 8px">订单数50% + GMV30% + 客单价20% 加权投票，导入新订单后自动更新</div>
          <div>${voteRows}</div>
        `;
      } catch(e) { tel.innerHTML = '<div class="empty">分时分析加载失败</div>'; }
    };

    // 分时投放折叠切换
    const timeToggle = el.querySelector('[data-toggle-time]');
    const timeEl = $('#catalog-time');
    if (timeToggle && timeEl) {
      timeToggle.onclick = () => {
        const willOpen = timeEl.hidden;
        timeEl.hidden = !willOpen;
        timeToggle.querySelector('.orders-fold-icon').textContent = willOpen ? '▾' : '▸';
        if (willOpen && !timeEl.dataset.loaded) { timeEl.dataset.loaded = '1'; renderTime(); }
      };
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
        <div class="task-meta">${esc(k.source||'')} · ${esc(k.category||'')} · 权重${esc(k.weight!=null?k.weight:5)}${dimStr}${k.status==='已用' ? ` · 已用${k.used_count||0}次` : ''}</div>
      </div>
      ${poolTag}
      <span class="tag ${hotCls(k.hot)}" style="margin:0 4px" title="热度">🔥${esc(k.hot||'—')}</span>
      <span class="tag ${relCls(k.relevance)}" style="margin:0 4px" title="关联性">${esc(k.relevance||'—')}关联</span>
      <span class="tag ${statusCls(k.status)}">${esc(k.status||'待用')}</span>
      ${k.status==='已用' ? `<button class="btn sm" style="margin-left:4px" onclick="window.__kwHistory && window.__kwHistory('${k.id}')" title="查看使用时间线">历史</button>` : ''}
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
  // 查看关键词使用时间线（used_history：每次使用的时间 + 商品）
  window.__kwHistory = id => {
    const k = kws.find(x=>x.id===id); if(!k) return;
    const hist = (k.used_history || []).slice().reverse();  // 倒序，最近在前
    const rows = hist.length ? hist.map(h => `
      <div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #f1f5f9">
        <span style="font-family:ui-monospace,monospace;font-size:12px;color:#475569">${esc(h.time||'')}</span>
        <span style="font-family:ui-monospace,monospace;font-size:12px;color:#64748b">${esc(h.product_id||'')}</span>
      </div>`).join('') : '<div class="empty">暂无使用时间线</div>';
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:1200;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:14px;width:100%;max-width:420px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #f1f5f9">
          <div style="font-size:15px;font-weight:700;color:#17203a">🔎 ${esc(k.word)}</div>
          <button class="kw-hist-close" style="border:none;background:#f1f5f9;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;color:#64748b">✕</button>
        </div>
        <div style="padding:6px 18px;font-size:12px;color:#64748b">已用 ${hist.length} 次（倒序，最近在前）</div>
        <div style="padding:4px 18px 16px;overflow-y:auto">${rows}</div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.kw-hist-close').onclick = () => overlay.remove();
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
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

/* ---------------- 任务调度中心 ---------------- */
async function renderScheduler() {
  const el = $('#view-scheduler');
  el.innerHTML = '<div class="empty"><div class="big">⏰</div>加载中…</div>';
  let items;
  try {
    const resp = await api('/api/catalog/scheduled-tasks');
    items = resp.items || [];
  } catch (e) {
    el.innerHTML = `<div class="empty">❌ ${esc(e.message)}</div>`;
    return;
  }
  const cats = ['订单', '推广', '商品', '竞品', '评价'];
  const catIcons = { '订单': '📦', '推广': '📢', '商品': '🛒', '竞品': '🎯', '评价': '⭐' };
  const catColor = { '订单': '#2563eb', '推广': '#d97706', '商品': '#16a34a', '竞品': '#7c3aed', '评价': '#db2777' };
  const statusBadge = (t) => {
    if (!t.enabled) return '<span style="font-size:11px;font-weight:700;color:#6b7280;background:#f3f4f6;padding:2px 8px;border-radius:6px">⏸ 停用</span>';
    if (!t.last_status) return '<span style="font-size:11px;font-weight:700;color:#64748b;background:#f1f5f9;padding:2px 8px;border-radius:6px">未运行</span>';
    const map = {
      success: { label: '✅ 成功', color: '#16a34a', bg: '#dcfce7' },
      fail: { label: '❌ 失败', color: '#dc2626', bg: '#fee2e2' },
      error: { label: '❌ 失败', color: '#dc2626', bg: '#fee2e2' },
      skip: { label: '⏭ 跳过', color: '#d97706', bg: '#fef3c7' },
      running: { label: '⏳ 运行中', color: '#2563eb', bg: '#dbeafe' },
    };
    const s = map[t.last_status] || { label: t.last_status, color: '#6b7280', bg: '#f3f4f6' };
    return `<span style="font-size:11px;font-weight:700;color:${s.color};background:${s.bg};padding:2px 8px;border-radius:6px">${s.label}</span>`;
  };

  const enabledCount = items.filter(t => t.enabled).length;
  let h = '';
  h += '<div style="background:linear-gradient(135deg,#1e3a5f,#3b82f6);border-radius:12px;padding:14px 16px;margin:12px;color:#fff">';
  h += '<div style="font-size:15px;font-weight:700">⏰ 任务调度中心</div>';
  h += `<div style="font-size:11px;opacity:.88;margin-top:6px;line-height:1.7">统一管理全部定时采集任务 · 共 ${items.length} 个任务（启用 ${enabledCount} 个）· 执行由 Hermes cron 调度，此处登记配置与运行状态</div>`;
  h += '</div>';

  cats.forEach(cat => {
    const rows = items.filter(t => t.category === cat);
    const color = catColor[cat];
    const icon = catIcons[cat];
    h += `<div style="margin:14px 12px 6px;font-size:13px;font-weight:700;color:${color}">${icon} ${cat}（${rows.length}）</div>`;
    if (!rows.length) {
      h += '<div class="empty" style="margin:0 12px">该类型暂无任务</div>';
      return;
    }
    rows.forEach(t => {
      const hasJob = !!t.cron_job_id;
      h += '<div style="background:#fff;border-radius:12px;padding:12px;margin:8px 12px;box-shadow:0 1px 3px rgba(0,0,0,.05)">';
      h += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
      h += `<div style="font-weight:700;color:#1e3a5f;font-size:13px;flex:1;min-width:0">${esc(t.name)}</div>`;
      h += statusBadge(t);
      if (t.shop_name) h += `<span style="font-size:11px;font-weight:700;color:#3b82f6;background:#e0f2fe;padding:2px 8px;border-radius:6px">${esc(t.shop_name)}</span>`;
      h += '</div>';
      h += '<div style="font-size:11px;color:#8899b0;margin-top:6px;line-height:1.7">';
      h += `<span style="font-weight:700;color:#5a6b85">${esc(t.schedule_desc || '—')}</span>`;
      if (t.cron_expr) h += ` · <code style="background:#f3f4f6;padding:1px 6px;border-radius:4px">${esc(t.cron_expr)}</code>`;
      if (t.script) h += ` · ${esc(t.script)}`;
      h += '</div>';
      if (hasJob) {
        h += '<div style="font-size:11px;color:#8899b0;margin-top:4px">';
        h += `运行 ${t.run_count || 0} 次`;
        if (t.last_run_at) h += ` · 最近 ${esc(String(t.last_run_at).slice(5, 16))}`;
        if (t.last_result) h += ` · ${esc(String(t.last_result).slice(0, 60))}`;
        h += '</div>';
      } else {
        h += '<div style="font-size:11px;color:#d97706;margin-top:4px">🕐 待建设（尚未接入采集）</div>';
      }
      if (hasJob) {
        h += `<button class="btn xs" style="margin-top:8px;margin-right:6px" onclick="showTaskRuns('${esc(t.task_key)}', '${esc(t.name)}')">📜 日志</button>`;
      }
      if (t.enabled && hasJob) {
        h += `<button class="btn xs" style="margin-top:8px" onclick="schedulerToggle('${esc(t.task_key)}', 0)">⏸ 停用</button>`;
      } else if (!t.enabled && hasJob) {
        h += `<button class="btn xs primary" style="margin-top:8px" onclick="schedulerToggle('${esc(t.task_key)}', 1)">▶ 启用</button>`;
      }
      h += '</div>';
    });
  });

  el.innerHTML = h;
}

async function schedulerToggle(taskKey, enabled) {
  try {
    await api('/api/catalog/scheduled-tasks/toggle', 'POST', { task_key: taskKey, enabled: enabled });
    toast(enabled ? '✅ 已启用' : '⏸ 已停用');
    renderScheduler();
  } catch (e) { toast('❌ ' + e.message); }
}

// 运行日志历史弹窗
async function showTaskRuns(taskKey, taskName) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:999;display:flex;align-items:center;justify-content:center;padding:24px';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;padding:20px;max-width:480px;width:100%;max-height:82vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.22)';
  box.innerHTML = `<div style="font-size:15px;font-weight:700;color:#17203a;margin-bottom:4px">📜 ${esc(taskName)} · 运行日志</div>
    <div style="font-size:11px;color:#8899b0;margin-bottom:12px">${esc(taskKey)}</div>
    <div style="color:#8899b0;font-size:12px;text-align:center;padding:20px">加载中…</div>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) close(); };

  const stMap = {
    success: { label: '✅ 成功', color: '#16a34a', bg: '#dcfce7' },
    fail: { label: '❌ 失败', color: '#dc2626', bg: '#fee2e2' },
    error: { label: '❌ 失败', color: '#dc2626', bg: '#fee2e2' },
    skip: { label: '⏭ 跳过', color: '#d97706', bg: '#fef3c7' },
    running: { label: '⏳ 运行中', color: '#2563eb', bg: '#dbeafe' },
  };
  const badge = s => { const m = stMap[s] || { label: s || '—', color: '#6b7280', bg: '#f3f4f6' }; return `<span style="font-size:11px;font-weight:700;color:${m.color};background:${m.bg};padding:2px 8px;border-radius:6px">${m.label}</span>`; };

  let items = [];
  try {
    const resp = await api('/api/catalog/task-runs?task_key=' + encodeURIComponent(taskKey) + '&limit=50');
    items = resp.items || [];
  } catch (e) {
    box.innerHTML = `<div style="font-size:15px;font-weight:700;color:#17203a;margin-bottom:12px">📜 运行日志</div><div style="color:#dc2626;font-size:13px;padding:20px;text-align:center">❌ ${esc(e.message)}</div>`;
    return;
  }
  if (!items.length) {
    box.innerHTML = `<div style="font-size:15px;font-weight:700;color:#17203a;margin-bottom:4px">📜 ${esc(taskName)} · 运行日志</div>
      <div style="font-size:11px;color:#8899b0;margin-bottom:12px">${esc(taskKey)}</div>
      <div class="empty" style="padding:24px">暂无运行记录<br><span style="font-size:11px;color:#9aa4bb">任务首次执行后会自动记录</span></div>`;
    return;
  }
  let h = `<div style="font-size:15px;font-weight:700;color:#17203a;margin-bottom:4px">📜 ${esc(taskName)} · 运行日志</div>
    <div style="font-size:11px;color:#8899b0;margin-bottom:12px">共 ${items.length} 次（最近 50 次）</div>`;
  items.forEach(r => {
    const time = (r.finished_at || r.created_at || '').slice(5, 16);
    h += `<div style="border-bottom:1px solid #f0f2f8;padding:10px 0">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${badge(r.status)}<span style="font-size:11px;color:#8899b0">${esc(time)}</span></div>
      ${r.result ? `<div style="font-size:12px;color:#4b5677;margin-top:5px;word-break:break-all;line-height:1.5">${esc(String(r.result).slice(0, 120))}${String(r.result).length > 120 ? '…' : ''}</div>` : ''}
    </div>`;
  });
  box.innerHTML = h;
}

/* ---------------- 评价监控 ---------------- */
const reviewState = { shop: '', star: '', hasPic: false, hasVideo: false, kw: '', goods: '' };

function starRow(n) {
  n = n || 0;
  let s = '';
  for (let i = 1; i <= 5; i++) s += `<span style="color:${i <= n ? '#f59e0b' : '#e5e7eb'}">★</span>`;
  return s;
}

function reviewSet(k, v) {
  reviewState[k] = v;
  renderReviews();
}

async function reviewCollect() {
  const shop = reviewState.shop || '5';
  try {
    await api('/api/catalog/reviews/collect', 'POST', { shop_id: parseInt(shop) });
    toast('🔄 评价采集已启动（后台执行，约1-2分钟）');
    setTimeout(renderReviews, 60000);
  } catch (e) { toast('❌ ' + e.message); }
}

function reviewAnalysisHtml(a) {
  if (!a || !a.total) return '';
  const total = a.total;
  let h = '';
  h += '<div style="background:#fff;border-radius:12px;padding:14px;margin:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)">';
  h += '<div style="font-weight:700;color:#1e3a5f;font-size:14px;margin-bottom:10px">📊 评论分析</div>';
  // 星级分布
  h += `<div style="font-size:12px;font-weight:700;color:#5a6b85;margin-bottom:6px">星级分布 · 好评率 ${a.good_rate}%</div>`;
  [5, 4, 3, 2, 1].forEach(st => {
    const n = (a.star_dist || {})[st] || 0;
    const pct = total ? (n / total * 100) : 0;
    h += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      <span style="width:34px;font-size:11px;color:#8899b0">${st}星</span>
      <div style="flex:1;height:14px;background:#f3f4f6;border-radius:7px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${st >= 4 ? '#f59e0b' : '#e5e7eb'}"></div>
      </div>
      <span style="width:48px;font-size:11px;color:#8899b0;text-align:right">${n} ${pct.toFixed(1)}%</span>
    </div>`;
  });
  // 好评关键词
  if (a.pos_keywords && a.pos_keywords.length) {
    const max = a.pos_keywords[0].count;
    h += '<div style="font-size:12px;font-weight:700;color:#5a6b85;margin:12px 0 6px">好评关键词（买家最认可）</div>';
    a.pos_keywords.forEach(p => {
      const pct = max ? (p.count / max * 100) : 0;
      h += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="width:62px;font-size:11px;color:#4b5677">${esc(p.dim)}</span>
        <div style="flex:1;height:12px;background:#f0fdf4;border-radius:6px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:#16a34a"></div>
        </div>
        <span style="width:36px;font-size:11px;color:#8899b0;text-align:right">${p.count}</span>
      </div>`;
    });
  }
  // 差评归类
  if (a.neg && a.neg.total > 0) {
    h += `<div style="font-size:12px;font-weight:700;color:#5a6b85;margin:12px 0 6px">差评 ${a.neg.total} 条（有文字 ${a.neg.with_text} 条）</div>`;
    if (a.neg.cats && a.neg.cats.length) {
      h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">';
      a.neg.cats.forEach(c => {
        h += `<span style="font-size:11px;font-weight:700;color:#dc2626;background:#fee2e2;padding:3px 10px;border-radius:6px">${esc(c.type)} ${c.count}</span>`;
      });
      h += '</div>';
    }
    if (a.neg.contradict > 0) {
      h += `<div style="font-size:11px;color:#8899b0;margin-bottom:4px">⚠️ ${a.neg.contradict} 条「矛盾评分」（文字好评但打低分，买家误点星）</div>`;
    }
    if (a.neg.no_text > 0) {
      h += `<div style="font-size:11px;color:#8899b0;margin-bottom:4px">📭 ${a.neg.no_text} 条未填写文字评价（无法归类）</div>`;
    }
  }
  // 差评集中商品（可点击筛选）
  if (a.neg_goods && a.neg_goods.length) {
    h += '<div style="font-size:12px;font-weight:700;color:#5a6b85;margin:12px 0 6px">差评集中商品（点击查看该商品评价）</div>';
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
    a.neg_goods.forEach(g => {
      const active = String(reviewState.goods) === String(g.goods_id);
      const nm = (g.goods_name || '').slice(0, 12);
      h += `<button class="btn xs" title="${esc(g.goods_name)}" style="margin:0;padding:5px 10px;font-size:11px;${active ? 'border-color:#dc2626;color:#dc2626;background:#fee2e2' : ''}" onclick="reviewSet('goods', '${esc(g.goods_id)}')">${esc(nm)}${g.goods_name && g.goods_name.length > 12 ? '…' : ''} <b>${g.count}差评</b></button>`;
    });
    h += '</div>';
  }
  // 可操作建议
  if (a.suggestions && a.suggestions.length) {
    h += '<div style="font-size:12px;font-weight:700;color:#5a6b85;margin:12px 0 6px">💡 可操作建议</div>';
    a.suggestions.forEach((sg, i) => {
      h += `<div style="font-size:12px;color:#4b5677;line-height:1.6;margin-bottom:6px;padding:8px 10px;background:#fffbeb;border-radius:8px">${i + 1}. ${esc(sg)}</div>`;
    });
  }
  h += '</div>';
  return h;
}

async function renderReviews() {
  const el = $('#view-reviews');
  el.innerHTML = '<div class="empty"><div class="big">⭐</div>加载中…</div>';
  let stats, items, analysis;
  try {
    const qs = new URLSearchParams();
    if (reviewState.shop) qs.set('shop_id', reviewState.shop);
    if (reviewState.star) qs.set('star', reviewState.star);
    if (reviewState.hasPic) qs.set('has_picture', '1');
    if (reviewState.hasVideo) qs.set('has_video', '1');
    if (reviewState.kw) qs.set('keyword', reviewState.kw);
    if (reviewState.goods) qs.set('goods_id', reviewState.goods);
    qs.set('limit', '300');
    const [s, r, a] = await Promise.all([
      api('/api/catalog/review-stats'),
      api('/api/catalog/reviews?' + qs.toString()),
      api('/api/catalog/review-analysis'),
    ]);
    stats = s; items = r.items || []; analysis = a;
  } catch (e) {
    el.innerHTML = `<div class="empty">❌ ${esc(e.message)}</div>`;
    return;
  }

  let h = '';
  h += '<div style="background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:12px;padding:14px 16px;margin:12px;color:#fff">';
  h += '<div style="font-size:15px;font-weight:700">⭐ 评价监控</div>';
  h += `<div style="font-size:12px;opacity:.92;margin-top:6px;line-height:1.7">已采集 <b>${stats.total}</b> 条评价 · 差评 <b>${stats.neg_total}</b> 条 · 近7天新增 <b>${stats.week_new}</b> 条</div>`;
  h += '</div>';
  h += reviewAnalysisHtml(analysis);

  if (stats.shops && stats.shops.length) {
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 12px 4px">';
    stats.shops.forEach(s => {
      h += `<div style="background:#fff;border-radius:10px;padding:10px 12px;box-shadow:0 1px 3px rgba(0,0,0,.05);font-size:12px;flex:1;min-width:120px">
        <div style="font-weight:700;color:#1e3a5f">${esc(s.shop_name || ('店铺' + s.shop_id))}</div>
        <div style="color:#8899b0;margin-top:4px;line-height:1.6">${s.total}条 · 图${s.with_pic} · 视频${s.with_video} · <span style="font-weight:700;color:${s.neg > 0 ? '#dc2626' : '#16a34a'}">差评${s.neg}</span></div>
      </div>`;
    });
    h += '</div>';
  }

  // 筛选栏
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 12px">';
  h += `<select onchange="reviewSet('shop', this.value)" style="padding:7px 10px;border:1px solid #e4e7f1;border-radius:8px;font-size:13px;background:#fff">
    <option value="">全部店铺</option>
    ${(stats.shops || []).map(s => `<option value="${s.shop_id}" ${String(reviewState.shop) === String(s.shop_id) ? 'selected' : ''}>${esc(s.shop_name || ('店铺' + s.shop_id))}</option>`).join('')}
  </select>`;
  h += `<select onchange="reviewSet('star', this.value)" style="padding:7px 10px;border:1px solid #e4e7f1;border-radius:8px;font-size:13px;background:#fff">
    <option value="">全部星级</option>
    <option value="5" ${reviewState.star === '5' ? 'selected' : ''}>5星</option>
    <option value="4" ${reviewState.star === '4' ? 'selected' : ''}>4星</option>
    <option value="3" ${reviewState.star === '3' ? 'selected' : ''}>3星</option>
    <option value="2" ${reviewState.star === '2' ? 'selected' : ''}>2星</option>
    <option value="1" ${reviewState.star === '1' ? 'selected' : ''}>1星</option>
  </select>`;
  h += `<label style="font-size:12px;color:#4b5677;display:flex;align-items:center;gap:4px;padding:7px 8px;border:1px solid ${reviewState.hasPic ? '#7c3aed' : '#e4e7f1'};border-radius:8px;background:${reviewState.hasPic ? '#f5f3ff' : '#fff'};cursor:pointer">
    <input type="checkbox" ${reviewState.hasPic ? 'checked' : ''} onchange="reviewSet('hasPic', this.checked)" style="display:none">🖼 有图</label>`;
  h += `<label style="font-size:12px;color:#4b5677;display:flex;align-items:center;gap:4px;padding:7px 8px;border:1px solid ${reviewState.hasVideo ? '#7c3aed' : '#e4e7f1'};border-radius:8px;background:${reviewState.hasVideo ? '#f5f3ff' : '#fff'};cursor:pointer">
    <input type="checkbox" ${reviewState.hasVideo ? 'checked' : ''} onchange="reviewSet('hasVideo', this.checked)" style="display:none">🎬 有视频</label>`;
  h += `<input placeholder="搜关键词/商品/订单号" value="${esc(reviewState.kw)}" onchange="reviewSet('kw', this.value)" style="flex:1;min-width:140px;padding:7px 10px;border:1px solid #e4e7f1;border-radius:8px;font-size:13px">`;
  h += `<button class="btn xs primary" onclick="reviewCollect()">🔄 采集</button>`;
  if (reviewState.goods) {
    h += `<button class="btn xs" style="background:#fee2e2;color:#dc2626;border-color:#fca5a5" onclick="reviewSet('goods', '')">✕ 清除商品筛选</button>`;
  }
  h += '</div>';
  if (reviewState.goods) {
    const cnt = items.length >= 300 ? `前 300 条` : `${items.length} 条`;
    h += `<div style="margin:0 12px 4px;font-size:11px;color:#dc2626;background:#fef2f2;padding:6px 10px;border-radius:8px">当前仅显示商品 ID ${esc(reviewState.goods)} 的评价（${cnt}）</div>`;
  }

  // 评价列表
  if (!items.length) {
    h += '<div class="empty" style="margin:12px">暂无评价数据<br><span style="font-size:11px;color:#9aa4bb">点「🔄 采集」拉取拼多多评价</span></div>';
  } else {
    items.forEach(r => {
      const pics = (() => { try { return JSON.parse(r.pictures || '[]'); } catch (e) { return []; } })();
      const vid = (() => {
        if (!r.video) return null;
        try { const v = JSON.parse(r.video); return typeof v === 'object' ? (v.url || v.playUrl || v.videoUrl || '') : v; }
        catch (e) { return r.video; }
      })();
      const neg = (r.desc_score || 0) <= 3;
      const dt = r.create_time ? new Date(r.create_time * 1000).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      h += `<div style="background:#fff;border-radius:12px;padding:12px;margin:8px 12px;box-shadow:0 1px 3px rgba(0,0,0,.05);${neg ? 'border-left:3px solid #dc2626' : ''}">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${starRow(r.desc_score)}
          ${neg ? '<span style="font-size:11px;font-weight:700;color:#dc2626;background:#fee2e2;padding:2px 8px;border-radius:6px">差评</span>' : ''}
          ${r.shop_name ? `<span style="font-size:11px;font-weight:700;color:#7c3aed;background:#f3e8ff;padding:2px 8px;border-radius:6px">${esc(r.shop_name)}</span>` : ''}
          <span style="font-size:11px;color:#8899b0">${esc(dt)}</span>
        </div>
        <div style="font-size:13px;color:#17203a;margin-top:8px;line-height:1.6;word-break:break-word">${esc(r.comment || '(无文字评价)')}</div>
        ${pics.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${pics.map(u => `<img src="${esc(u)}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;cursor:pointer" onclick="showImageLightbox('${esc(u)}')">`).join('')}</div>` : ''}
        ${vid ? `<div style="margin-top:8px"><video src="${esc(vid)}" controls style="width:180px;max-height:140px;border-radius:6px;background:#000"></video></div>` : ''}
        <div style="font-size:11px;color:#8899b0;margin-top:8px;line-height:1.6">
          <div style="color:#4b5677">${esc(r.goods_name || '')} <span style="color:#8899b0">ID ${esc(r.goods_id)}</span></div>
          ${r.specs ? (() => { try { return JSON.parse(r.specs).map(s => `${s.spec_key}:${s.spec_value}`).join(' · '); } catch (e) { return esc(r.specs); } })() : ''}
          ${r.order_sn ? `<div>订单 ${esc(r.order_sn)}</div>` : ''}
        </div>
        ${r.reply ? `<div style="font-size:12px;color:#2563eb;background:#eff6ff;border-radius:8px;padding:8px;margin-top:8px">商家回复：${esc(r.reply)}</div>` : ''}
      </div>`;
    });
    h += `<div style="text-align:center;font-size:11px;color:#9aa4bb;padding:10px">共 ${items.length} 条（最多显示 300 条，可筛选）</div>`;
  }

  el.innerHTML = h;
}

/* ---------------- 打单登记 ---------------- */
const packState = { date: '', entry: 'pdd_jiayu', source: 'platform', scatter_shop: '', monthly_entry: '', monthly_month: '' };
const PACK_ENTRIES = { pdd_jiayu: '拼多多·嘉裕', pdd_xianshi: '拼多多·闲时来', taobao_jiayu: '淘宝·嘉裕', doudian: '抖店' };
const PACK_SOURCES = { platform: '平台订单', alijiayu: '阿里.嘉裕工艺品有限公司', sandan: '散单' };
// 打单入口 → 对应店铺（显示在「平台订单」按钮的括号标注里，不独立可选）
const PACK_ENTRY_SHOPS = {
  pdd_jiayu: ['嘉裕工艺品', 'OSHIYI欧世艺旗舰店', '如若月下'],
  pdd_xianshi: [],
  taobao_jiayu: ['阿里.嘉裕工艺品有限公司'],
  doudian: [],
};

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
if (!packState.date) packState.date = todayStr();

function packSet(k, v) { packState[k] = v; renderPacking(); }

// 散单下拉框选中店铺：source=sandan，scatter_shop=店铺名
function packSetScatter(name) {
  packState.scatter_shop = name || '';
  if (name) packState.source = 'sandan';
  renderPacking();
}

// 手动添加散单店铺
async function packAddScatterShop() {
  const r = await promptDialog([
    { key: 'name', label: '散单店铺名', value: '', placeholder: '输入店铺名，如：XX店' },
  ], { title: '添加散单店铺', confirmText: '添加' });
  if (!r || !r.name.trim()) return;
  try {
    await api('/api/scatter-shops', 'POST', { name: r.name.trim() });
    packState.scatter_shop = r.name.trim();
    packState.source = 'sandan';
    toast('已添加');
    renderPacking();
  } catch (e) { toast(e.message); }
}

async function packSubmit() {
  const count = parseInt($('#pack-count').value, 10);
  if (!count || count <= 0) return toast('请填写数量');
  try {
    await api('/api/pack-records', 'POST', { entry: packState.entry, source: packState.source, count, remark: $('#pack-remark').value.trim(), record_date: packState.date, scatter_shop: packState.scatter_shop });
    toast('已登记');
    renderPacking();
  } catch (e) { toast(e.message); }
}

async function packDelete(id) {
  if (!confirm('删除这条打单记录？')) return;
  try {
    await api('/api/pack-records/' + id, 'DELETE');
    toast('已删除');
    renderPacking();
  } catch (e) { toast(e.message); }
}

async function packEdit(id) {
  const cur = (packState.items || []).find(r => r.id === id);
  if (!cur) return toast('记录不存在');
  const r = await promptDialog([
    { key: 'entry', label: '打单入口', type: 'select', value: cur.entry, options: Object.entries(PACK_ENTRIES).map(([v, l]) => ({ value: v, label: l })) },
    { key: 'source', label: '订单来源', type: 'select', value: cur.source, options: Object.entries(PACK_SOURCES).map(([v, l]) => ({ value: v, label: l })) },
    { key: 'count', label: '数量', value: String(cur.count || ''), placeholder: '打了几单' },
    { key: 'remark', label: '备注', value: cur.remark || '', placeholder: '备注（可选）' },
  ], { title: '修改打单记录', confirmText: '保存修改' });
  if (!r) return;
  const count = parseInt(r.count, 10);
  if (!count || count <= 0) return toast('数量无效');
  try {
    await api('/api/pack-records/' + id, 'PUT', { entry: r.entry, source: r.source, count, remark: r.remark });
    toast('已修改');
    renderPacking();
  } catch (e) { toast(e.message); }
}

async function renderPacking() {
  const el = $('#view-packing');
  el.innerHTML = '<div class="empty"><div class="big">🖨</div>加载中…</div>';
  let summary, items, scatterShops;
  try {
    const [s, r, ss] = await Promise.all([
      api('/api/pack-summary?date=' + packState.date),
      api('/api/pack-records?date=' + packState.date),
      api('/api/scatter-shops'),
    ]);
    summary = s; items = r.items || [];
    scatterShops = (ss.items || []).map(x => x.name);
    packState.items = items;
  } catch (e) {
    el.innerHTML = `<div class="empty">❌ ${esc(e.message)}</div>`;
    return;
  }

  let h = '';
  h += `<div style="background:linear-gradient(135deg,#1d4ed8,#3b82f6);border-radius:12px;padding:14px 16px;margin:12px;color:#fff">
    <div style="font-size:15px;font-weight:700">🖨 打单登记</div>
    <div style="font-size:12px;opacity:.92;margin-top:6px">${packState.date} 已打 <b>${summary.grand}</b> 单</div>
  </div>`;
  h += `<div style="display:flex;gap:8px;align-items:center;margin:0 12px">
    <input type="date" value="${packState.date}" onchange="packSet('date', this.value)" style="padding:7px 10px;border:1px solid #e4e7f1;border-radius:8px;font-size:13px;background:#fff">
    <button class="btn xs" onclick="packSet('date', todayStr())">今天</button>
  </div>`;

  h += `<div style="background:#fff;border-radius:12px;padding:14px;margin:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)">`;
  h += `<div style="font-size:12px;color:#4b5677;margin-bottom:6px">打单入口</div>`;
  h += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">`;
  for (const [k, name] of Object.entries(PACK_ENTRIES)) {
    const a = packState.entry === k;
    h += `<button onclick="packSet('entry','${k}')" style="flex:1;min-width:100px;padding:8px;border-radius:8px;font-size:12px;cursor:pointer;border:1px solid ${a?'#1d4ed8':'#e4e7f1'};background:${a?'#eff6ff':'#fff'};color:${a?'#1d4ed8':'#4b5677'};font-weight:${a?'700':'400'}">${name}</button>`;
  }
  h += `</div>`;
  h += `<div style="font-size:12px;color:#4b5677;margin-bottom:6px">订单来源</div>`;
  h += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">`;
  const srcBtn = (k, name) => {
    const a = packState.source === k;
    return `<button onclick="packSet('source','${k}')" style="flex:1;min-width:80px;padding:8px;border-radius:8px;font-size:12px;cursor:pointer;border:1px solid ${a?'#16a34a':'#e4e7f1'};background:${a?'#f0fdf4':'#fff'};color:${a?'#16a34a':'#4b5677'};font-weight:${a?'700':'400'}">${name}</button>`;
  };
  // 平台订单（括号标注当前入口的店铺；淘宝嘉裕单独拆按钮）
  const shopNames = PACK_ENTRY_SHOPS[packState.entry] || [];
  let platformLabel = '平台订单';
  if (packState.entry !== 'taobao_jiayu' && shopNames.length) {
    platformLabel = '平台订单（' + shopNames.join('、') + '）';
  }
  h += srcBtn('platform', platformLabel);
  // 淘宝嘉裕：独立「阿里.嘉裕工艺品有限公司」按钮，与平台订单分别记
  if (packState.entry === 'taobao_jiayu') {
    h += srcBtn('alijiayu', '阿里.嘉裕工艺品有限公司');
  }
  // 散单（下拉框选店铺）
  h += `<select onchange="packSetScatter(this.value)" style="flex:1;min-width:130px;padding:8px;border-radius:8px;font-size:12px;cursor:pointer;border:1px solid ${packState.source==='sandan'?'#16a34a':'#e4e7f1'};background:${packState.source==='sandan'?'#f0fdf4':'#fff'};color:${packState.source==='sandan'?'#16a34a':'#4b5677'};font-weight:${packState.source==='sandan'?'700':'400'}">
    <option value="">散单（选店铺）</option>
    ${scatterShops.map(n => `<option value="${esc(n)}" ${packState.scatter_shop===n?'selected':''}>${esc(n)}</option>`).join('')}
    <option value="其他" ${packState.scatter_shop==='其他'?'selected':''}>其他</option>
  </select>`;
  // 手动添加散单店铺
  h += `<button onclick="packAddScatterShop()" style="flex:0 0 auto;min-width:36px;padding:8px 10px;border-radius:8px;font-size:14px;cursor:pointer;border:1px solid #e4e7f1;background:#fff;color:#4b5677;font-weight:700">＋</button>`;
  h += `</div>`;
  h += `<div style="display:flex;gap:8px;margin-bottom:12px">
    <input type="number" id="pack-count" min="1" placeholder="打了几单" style="flex:1;padding:9px;border:1px solid #e4e7f1;border-radius:8px;font-size:14px">
    <input type="text" id="pack-remark" placeholder="备注（可选）" style="flex:1.5;padding:9px;border:1px solid #e4e7f1;border-radius:8px;font-size:14px">
  </div>`;
  h += `<button class="btn primary" style="width:100%" onclick="packSubmit()">提交登记</button>`;
  h += `</div>`;

  h += `<div style="background:#fff;border-radius:12px;padding:14px;margin:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)">`;
  h += `<div style="font-size:14px;font-weight:700;color:#1e3a5f;margin-bottom:10px">📊 当日汇总</div>`;
  h += `<table style="width:100%;border-collapse:collapse;font-size:12px">`;
  h += `<tr style="color:#8899b0"><td style="padding:6px 4px">入口</td>`;
  for (const s of Object.values(PACK_SOURCES)) h += `<td style="padding:6px 4px;text-align:center">${s}</td>`;
  h += `<td style="padding:6px 4px;text-align:center;font-weight:700">合计</td></tr>`;
  for (const [ek, ename] of Object.entries(PACK_ENTRIES)) {
    const row = summary.matrix[ek] || {};
    h += `<tr style="border-top:1px solid #f0f2f7"><td style="padding:6px 4px;color:#4b5677">${ename}</td>`;
    for (const sk of Object.keys(PACK_SOURCES)) {
      const v = row[sk] || 0;
      h += `<td style="padding:6px 4px;text-align:center;color:${v?'#17203a':'#c6cddb'}">${v}</td>`;
    }
    h += `<td style="padding:6px 4px;text-align:center;font-weight:700;color:#1d4ed8">${row.total||0}</td></tr>`;
  }
  h += `<tr style="border-top:2px solid #e4e7f1;font-weight:700"><td style="padding:6px 4px;color:#1e3a5f">总计</td>`;
  for (const sk of Object.keys(PACK_SOURCES)) h += `<td style="padding:6px 4px;text-align:center;color:#1e3a5f">${summary.source_totals[sk]||0}</td>`;
  h += `<td style="padding:6px 4px;text-align:center;color:#dc2626">${summary.grand}</td></tr>`;
  h += `</table>`;
  h += `</div>`;

  h += `<div style="background:#fff;border-radius:12px;padding:14px;margin:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)">`;
  h += `<div style="font-size:14px;font-weight:700;color:#1e3a5f;margin-bottom:10px">📋 当日明细</div>`;
  if (!items.length) {
    h += `<div class="empty" style="margin:8px">今天还没登记，打完单来记一笔</div>`;
  } else {
    for (const r of items) {
      const ename = PACK_ENTRIES[r.entry] || r.entry;
      let sname = PACK_SOURCES[r.source] || r.source;
      if (r.source === 'sandan' && r.scatter_shop) sname = '散单-' + r.scatter_shop;
      const dt = (r.created_at || '').slice(11, 16);
      h += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f5f6fa">
        <span style="font-size:11px;color:#8899b0;width:40px">${esc(dt)}</span>
        <span style="flex:1;font-size:13px;color:#17203a">${esc(ename)} · ${esc(sname)}${r.remark ? ' · ' + esc(r.remark) : ''}</span>
        <span style="font-size:15px;font-weight:700;color:#1d4ed8">${r.count}</span>
        <button class="btn xs" style="background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe" onclick="packEdit(${r.id})">改</button>
        <button class="btn xs" style="background:#fee2e2;color:#dc2626;border-color:#fca5a5" onclick="packDelete(${r.id})">删</button>
      </div>`;
    }
  }
  h += `</div>`;

  h += `<div style="background:#fff;border-radius:12px;padding:14px;margin:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)">
    <div style="font-size:14px;font-weight:700;color:#1e3a5f;margin-bottom:10px">📅 按月汇总</div>
    <div id="pack-monthly" style="font-size:12px;color:#9aa4bb">加载中…</div>
  </div>`;

  el.innerHTML = h;
  renderPackMonthly();
}

function fmtYm(ym) { if (!ym) return ym; const a = ym.split('-'); return a[0] + '年' + parseInt(a[1], 10) + '月'; }

async function renderPackMonthly() {
  const box = $('#pack-monthly');
  if (!box) return;
  try {
    const q = new URLSearchParams();
    if (packState.monthly_entry) q.set('entry', packState.monthly_entry);
    if (packState.monthly_month) q.set('month', packState.monthly_month);
    const qs = q.toString();
    const d = await api('/api/pack-monthly' + (qs ? '?' + qs : ''));
    const months = d.months || [];
    const rows = d.rows || [];
    const sel = "flex:1;padding:7px 8px;border:1px solid #e4e7f1;border-radius:8px;font-size:12px;background:#fff;color:#4b5677";
    let h = `<div style="display:flex;gap:8px;margin-bottom:10px">`;
    h += `<select onchange="packMonthlySet('entry', this.value)" style="${sel}"><option value="">全部平台</option>`;
    for (const [k, name] of Object.entries(PACK_ENTRIES)) h += `<option value="${k}" ${packState.monthly_entry===k?'selected':''}>${name}</option>`;
    h += `</select>`;
    h += `<select onchange="packMonthlySet('month', this.value)" style="${sel}"><option value="">全部月份</option>`;
    for (const m of months) h += `<option value="${m}" ${packState.monthly_month===m?'selected':''}>${fmtYm(m)}</option>`;
    h += `</select>`;
    h += `</div>`;
    if (!rows.length) {
      h += `<div class="empty" style="margin:8px">暂无打单记录</div>`;
    } else {
      h += `<table style="width:100%;border-collapse:collapse;font-size:12px">`;
      h += `<tr style="color:#8899b0"><td style="padding:6px 4px">月份</td><td style="padding:6px 4px">平台</td><td style="padding:6px 4px;text-align:center">打单数</td></tr>`;
      for (const r of rows) {
        h += `<tr style="border-top:1px solid #f0f2f7"><td style="padding:6px 4px;color:#4b5677">${esc(fmtYm(r.ym))}</td><td style="padding:6px 4px;color:#17203a">${esc(PACK_ENTRIES[r.entry]||r.entry)}</td><td style="padding:6px 4px;text-align:center;font-weight:700;color:#1d4ed8">${r.total}</td></tr>`;
      }
      h += `<tr style="border-top:2px solid #e4e7f1;font-weight:700"><td colspan="2" style="padding:6px 4px;color:#1e3a5f">合计</td><td style="padding:6px 4px;text-align:center;color:#dc2626">${d.total}</td></tr>`;
      h += `</table>`;
    }
    box.innerHTML = h;
  } catch (e) {
    box.innerHTML = `<div class="empty">❌ ${esc(e.message)}</div>`;
  }
}

function packMonthlySet(k, v) { packState[k] = v; renderPackMonthly(); }

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
  if (!getToken()) { redirectLogin(); return; }
  $('#date-pill').textContent = todayCN();
  const _u = getUserInfo();
  $('#current-user').textContent = (_u.name || localStorage.getItem('ecom_op_user')) || '';
  $('#logout-btn').onclick = async () => {
    const ok = await confirmDialog('确定要退出当前账号吗？', { title: '退出登录', confirmText: '退出', cancelText: '取消', danger: true });
    if (!ok) return;
    localStorage.removeItem('ecom_op_token');
    localStorage.removeItem('ecom_op_user');
    localStorage.removeItem('ecom_op_user_info');
    localStorage.removeItem('ecom_op_perms');
    redirectLogin();
  };
  renderGuideSubMenu();
  applyPermFilter();  // 按当前用户权限隐藏无权限导航（含 admin-only）
  $$('.nav-item').forEach(b => {
    if (b.classList.contains('nav-parent')) {
      b.onclick = () => toggleNavGroup(b.dataset.group || 'guide');
      return;
    }
    b.onclick = () => setView(b.dataset.view);
  });
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
  setView('autopublish');
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
  const [cand, opt, log, allOpt] = await Promise.all([
    api('/api/catalog/title-opt/candidates?shop_id=' + sid + q),
    api('/api/catalog/title-opt?shop_id=' + sid),
    api('/api/catalog/title-opt/log?shop_id=' + sid + '&limit=10000'),
    api('/api/catalog/title-opt')
  ]);
  titleOptCache.candidates = cand.items || [];
  titleOptCache.opts = opt.items || [];
  titleOptCache.logs = log.items || [];
  titleOptCache.allOpts = allOpt.items || [];
}

async function renderTitleOptView() {
  const el = $('#view-titleopt');
  el.innerHTML = '<div class="empty"><div class="big">✏️</div>加载中…</div>';

  if (!(catalogCache.tree || []).length) {
    try {
      const resp = await api('/api/catalog/tree');
      catalogCache.tree = resp.items || [];
    } catch (e) {}
  }

  const shopOptions = titleOptShopOptions();
  const def = shopOptions.find(s => s.id === 5) || shopOptions[0];
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
  const shopName = (shopOptions.find(s => s.id === titleOptCache.shopId) || {}).name || '';

  const statusMap = {
    selected: { label: '待优化', color: '#d97706', bg: '#fef3c7' },
    optimized: { label: '已优化', color: '#16a34a', bg: '#dcfce7' },
    done: { label: '已生效', color: '#2563eb', bg: '#dbeafe' },
    blocked: { label: '🛑 已拦截', color: '#64748b', bg: '#e2e8f0' }
  };

  let h = '';
  h += '<div style="background:linear-gradient(135deg,#1e3a5f,#3b82f6);border-radius:12px;padding:14px 16px;margin:12px;color:#fff">';
  h += '<div style="font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px;flex-wrap:wrap">✏️ 标题优化 · 跟踪近7天访问效果';
  if (shopName) h += '<span style="font-size:11px;font-weight:600;background:rgba(255,255,255,.22);padding:2px 10px;border-radius:10px">' + esc(shopName) + '</span>';
  h += '</div>';
  h += '<div style="font-size:11px;opacity:.88;margin-top:6px;line-height:1.7">规则：已有订单的商品标题不动；挑选 5 个无订单商品优化标题；优化后通过平台「近7天访问数据」对比 UV / PV / 成交变化。</div>';
  h += '</div>';

  // 📋 工作流 SOP（折叠，供运营对照检查，防 AI 跳步/走偏）
  h += '<div style="margin:12px 12px 0;background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:10px 12px">';
  h += '<div onclick="var b=document.getElementById(\'sop-body\');var a=document.getElementById(\'sop-arrow\');if(b.style.display===\'none\'){b.style.display=\'block\';a.textContent=\'▴\'}else{b.style.display=\'none\';a.textContent=\'▾\'}" style="cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#0369a1">';
  h += '<span>📋 工作流 SOP</span><span style="font-size:11px;font-weight:500;color:#64748b">6 步骤 + 检查点（点击展开）</span>';
  h += '<span id="sop-arrow" style="margin-left:auto;color:#64748b">▾</span>';
  h += '</div>';
  h += '<div id="sop-body" style="display:none;margin-top:8px;font-size:12px;line-height:1.8;color:#334155">';
  h += '<div style="background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:8px 10px;margin-bottom:6px;color:#9a3412">⚠️ <b>核心原则</b>：关键词相关性是相对具体商品的动态值，不用全局 rel 标签；同一词对不同类目权重不同（免打孔对挂钩高、对花盆低）。品牌名/跨品类词直接黑名单排除。</div>';
  h += '<div><b>① 关键词库就绪</b> — 词量 > 0、已清洗、品牌/跨品类/灯具/颜色词已移 black</div>';
  h += '<div><b>② 选定商品后动态选词</b> — pick_golden_words(商品名)，候选词覆盖核心+属性+场景+风格，无噪声词</div>';
  h += '<div><b>③ AI 生成 + 质量门</b> — 黄金词喂进 prompt、拦截偷懒标题（仅加空格/净减核心词）、有订单不碰</div>';
  h += '<div><b>④ CDP 改后台</b> — check_shop 确认店铺、端口映射（嘉裕9232/如若月下9230/欧世艺9228/闲时来9222）、结果 VERIFIED=done</div>';
  h += '<div><b>⑤ 回填时间标注</b> — 改后台成功(VERIFIED)后 mark_keywords_used 记录 used_at / used_count / used_by / used_history（完整时间线）</div>';
  h += '<div><b>⑥ 验证报告</b> — done=成功 / 无结果=CDP死了 / NO_LIST=商品下架 / MISMATCH=价格校验</div>';
  h += '</div>';
  h += '</div>';

  // ⚠️ 失败清单（最上面，跨店铺展示待处理失败记录）
  const allOpts = titleOptCache.allOpts || opts;
  const failOpts = allOpts.filter(o => o.note && o.note !== '执行中…' && o.note !== '已出单，跳过' && o.status !== 'done' && o.status !== 'blocked' && !o.fixed);
  if (failOpts.length) {
    // 各结果类型 → 出现原因（供运营理解，hover 每条 note 也会显示）
    const failReasons = {
      '无结果': 'CDP 浏览器死了，node 连不上，标题未改到后台。重启 CDP 后重新执行更新即可',
      'NO_LIST': '商品已下架或后台搜不到。无需处理',
      'MISMATCH': '价格校验拦截（单买价 > 拼单价 ×2），提交被拦。修价后重新执行',
      'NO_COMMIT_ID': '点编辑未拿到草稿 ID（多为价格校验错误）。修价后重试',
      'DONE_NO_VERIFY': '已提交但未验证成功。重新执行核对',
      '执行超时': 'node 脚本执行超时。分批重跑',
      '执行异常': 'node 脚本异常退出。重跑',
      '清单写入失败': '临时清单文件写入失败。重跑',
    };
    const noteTypes = [...new Set(failOpts.map(o => o.note))];
    const failShops = [...new Set(failOpts.map(o => o.shop_id))];
    // 筛选状态（惰性初始化）
    titleOptCache.failShop = titleOptCache.failShop || 'all';
    titleOptCache.failNote = titleOptCache.failNote || 'all';
    const shown = failOpts.filter(o =>
      (titleOptCache.failShop === 'all' || String(o.shop_id) === String(titleOptCache.failShop)) &&
      (titleOptCache.failNote === 'all' || o.note === titleOptCache.failNote)
    );

    h += '<div style="background:#fff7ed;border:1px solid #fdba74;border-radius:12px;margin:12px;padding:12px">';
    h += '<div onclick="toggleBlock(\'fail-body\',\'fail-arrow\')" style="font-size:13px;font-weight:700;color:#c2410c;display:flex;align-items:center;gap:8px;flex-wrap:wrap;cursor:pointer;user-select:none">';
    h += '<span id="fail-arrow" style="color:#c2410c">▶</span>';
    h += '<span>⚠️ 失败清单（' + failOpts.length + ' 个待处理' + (shown.length !== failOpts.length ? '，筛出 ' + shown.length : '') + '）</span>';
    h += '<button onclick="event.stopPropagation();titleOptFixBatch()" class="btn xs" style="margin-left:auto;background:#16a34a;color:#fff;border:none">✅ 一键全部修复（' + shown.length + '）</button>';
    h += '</div>';
    h += '<div id="fail-body" style="display:none">';

    // 筛选器：店铺 + 结果类型 + 原因说明
    h += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">';
    h += '<select onchange="titleOptFailFilter(\'shop\', this.value)" style="padding:6px 8px;border:1px solid #fdba74;border-radius:8px;font-size:12px;background:#fff;color:#7c2d12">';
    h += '<option value="all"' + (titleOptCache.failShop === 'all' ? ' selected' : '') + '>🏪 全部店铺</option>';
    failShops.forEach(sid => {
      const sn = (shopOptions.find(s => s.id === sid) || {}).name || ('店铺' + sid);
      h += '<option value="' + sid + '"' + (String(titleOptCache.failShop) === String(sid) ? ' selected' : '') + '>' + esc(sn) + '</option>';
    });
    h += '</select>';
    h += '<select onchange="titleOptFailFilter(\'note\', this.value)" style="padding:6px 8px;border:1px solid #fdba74;border-radius:8px;font-size:12px;background:#fff;color:#7c2d12">';
    h += '<option value="all"' + (titleOptCache.failNote === 'all' ? ' selected' : '') + '>📊 全部结果</option>';
    noteTypes.forEach(nt => {
      h += '<option value="' + esc(nt) + '"' + (titleOptCache.failNote === nt ? ' selected' : '') + '>' + esc(nt) + '</option>';
    });
    h += '</select>';
    h += '<button onclick="var b=document.getElementById(\'fail-reason-body\');if(b.style.display===\'none\'){b.style.display=\'block\'}else{b.style.display=\'none\'}" class="btn xs" style="margin-left:auto;background:#fff;color:#c2410c;border:1px solid #fdba74">📖 结果原因说明</button>';
    h += '</div>';

    // 原因说明折叠体
    h += '<div id="fail-reason-body" style="display:none;margin-top:8px;font-size:11px;line-height:1.8;color:#7c2d12;background:#fff;border:1px dashed #fdba74;border-radius:8px;padding:8px 10px">';
    noteTypes.forEach(nt => {
      const cnt = failOpts.filter(o => o.note === nt).length;
      h += '<div><b>' + esc(nt) + '</b>（' + cnt + '）· ' + esc(failReasons[nt] || '未知原因') + '</div>';
    });
    h += '</div>';

    // 列表（按筛选结果）
    shown.forEach(o => {
      h += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0;border-bottom:1px dashed #fed7aa">';
      if (o.shop_name) h += '<span style="font-size:11px;font-weight:700;color:#3b82f6;background:#e0f2fe;padding:1px 8px;border-radius:5px;flex-shrink:0">' + esc(o.shop_name) + '</span>';
      h += '<span style="font-size:11px;color:#5a6b85;flex-shrink:0">ID <b>' + esc(o.platform_product_id) + '</b></span>';
      h += '<span title="' + esc(failReasons[o.note] || '') + '" style="font-size:11px;color:#dc2626;background:#fee2e2;padding:1px 8px;border-radius:5px;flex-shrink:0;cursor:help">' + esc(o.note) + '</span>';
      h += '<button class="btn xs" style="margin-left:auto;background:#16a34a;color:#fff;border:none;flex-shrink:0" onclick="titleOptFix(' + o.id + ')">✅ 确认修复</button>';
      h += '</div>';
    });
    if (!shown.length) h += '<div style="padding:10px;text-align:center;color:#9a3412;font-size:12px">当前筛选无结果</div>';
    h += '</div>';
    h += '</div>';
  }

  // 🛑 质量门拦截清单（AI 偷懒/负优化，未执行更新，只读）
  const blockedOpts = allOpts.filter(o => o.status === 'blocked');
  if (blockedOpts.length) {
    h += '<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;margin:12px;padding:12px">';
    h += '<div onclick="toggleBlock(\'blocked-body\',\'blocked-arrow\')" style="font-size:13px;font-weight:700;color:#475569;display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none">';
    h += '<span id="blocked-arrow" style="color:#94a3b8">▶</span><span>🛑 质量门拦截（' + blockedOpts.length + ' 个，AI 偷懒/负优化未执行）</span>';
    h += '</div>';
    h += '<div id="blocked-body" style="display:none">';
    blockedOpts.forEach(o => {
      h += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 0;border-bottom:1px dashed #e2e8f0">';
      if (o.shop_name) h += '<span style="font-size:11px;font-weight:700;color:#3b82f6;background:#e0f2fe;padding:1px 8px;border-radius:5px;flex-shrink:0">' + esc(o.shop_name) + '</span>';
      h += '<span style="font-size:11px;color:#5a6b85;flex-shrink:0">ID <b>' + esc(o.platform_product_id) + '</b></span>';
      h += '<span style="font-size:11px;color:#64748b;background:#e2e8f0;padding:1px 8px;border-radius:5px;flex-shrink:0">' + esc(o.note || '质量门拦截') + '</span>';
      h += '</div>';
    });
    h += '</div>';
    h += '</div>';
  }

  h += '<div style="margin:0 12px 8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
  h += '<select id="to-shop" style="padding:8px 10px;border:1px solid #cdd7e5;border-radius:8px;font-size:13px;background:#fff;max-width:200px">';
  shopOptions.forEach(s => {
    h += '<option value="' + s.id + '"' + (s.id === titleOptCache.shopId ? ' selected' : '') + '>' + esc(s.name) + '</option>';
  });
  h += '</select>';
  h += '<input id="to-search" placeholder="搜索商品名/货号/ID" value="' + esc(titleOptCache.filter) + '" style="flex:1;min-width:160px;padding:8px 10px;border:1px solid #cdd7e5;border-radius:8px;font-size:13px">';
  h += '</div>';

  h += '<div onclick="toggleBlock(\'picked-body\',\'picked-arrow\')" style="font-size:13px;font-weight:700;color:#1e3a5f;margin:14px 12px 6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;cursor:pointer;user-select:none">';
  h += '<span style="display:flex;align-items:center;gap:8px"><span id="picked-arrow" style="color:#94a3b8">▼</span>📋 已挑商品 · 跟踪日志（' + opts.length + '/5）</span>';
  const applyable = opts.filter(o => o.new_title && o.status !== 'done');
  if (applyable.length) {
    h += '<span style="display:flex;gap:8px;align-items:center" onclick="event.stopPropagation()">';
    h += '<button class="btn xs primary" onclick="titleOptApply()">🚀 执行更新（<span id="to-sel-count">0</span>）</button>';
    h += '<label style="font-size:11px;color:#5a6b85;cursor:pointer;white-space:nowrap"><input type="checkbox" id="to-sel-all" style="vertical-align:middle"> 全选</label>';
    h += '</span>';
  }
  h += '</div>';
  h += '<div id="picked-body" style="display:block">';
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
      h += '<div style="font-size:11px;color:#8899b0;margin-bottom:6px">';
      if (o.shop_name) h += '<span style="font-weight:700;color:#3b82f6;background:#e0f2fe;padding:1px 8px;border-radius:5px;margin-right:6px">' + esc(o.shop_name) + '</span>';
      h += '货号 ' + esc(o.product_code || '—') + ' · ID ' + esc(o.platform_product_id) + '</div>';
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
  h += '</div>';

  h += '<div onclick="toggleBlock(\'cand-body\',\'cand-arrow\')" style="font-size:13px;font-weight:700;color:#1e3a5f;margin:14px 12px 6px;display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none">';
  h += '<span id="cand-arrow" style="color:#94a3b8">▶</span>🎯 候选商品（无订单 · ' + cands.length + ' 个）';
  h += '</div>';
  h += '<div id="cand-body" style="display:none">';
  if (!cands.length) {
    h += '<div class="empty" style="margin:0 12px">无候选商品（可能已挑满或该店无订单商品已挑完）</div>';
  } else {
    h += '<div style="max-height:420px;overflow-y:auto;margin:0 12px 16px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)">';
    cands.forEach(c => {
      h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #f3f4f6">';
      h += '<div style="flex:1;min-width:0">';
      h += '<div style="font-size:12px;font-weight:600;color:#1e3a5f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(c.name) + '">' + esc(c.name) + '</div>';
      h += '<div style="font-size:11px;color:#8899b0">';
      if (c.shop_name) h += '<span style="font-weight:700;color:#3b82f6;background:#e0f2fe;padding:0 7px;border-radius:4px;margin-right:6px">' + esc(c.shop_name) + '</span>';
      h += esc(c.code || '—') + ' · ' + c.sku_count + ' SKU · ID ' + esc(c.platform_product_id) + '</div>';
      h += '</div>';
      h += '<button class="btn xs primary" onclick="titleOptPick(\'' + esc(c.platform_product_id) + '\')" style="flex-shrink:0;margin-left:8px">＋挑选</button>';
      h += '</div>';
    });
    h += '</div>';
  }
  h += '</div>';

  h += titleOptLogHtml(titleOptCache.logs);

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

// 标题优化日志 — 动作/来源标签映射（模块级，列表渲染与搜索共用）
const TITLE_OPT_ACTION_MAP = {
  pick: { label: '挑选', color: '#7c3aed', bg: '#ede9fe' },
  optimize: { label: '优化', color: '#d97706', bg: '#fef3c7' },
  apply: { label: '执行', color: '#2563eb', bg: '#dbeafe' },
  fix: { label: '确认修复', color: '#16a34a', bg: '#dcfce7' }
};
const TITLE_OPT_SRC_MAP = {
  ai: { label: '🤖 AI', color: '#64748b', bg: '#f1f5f9' },
  manual: { label: '👤 人工', color: '#c2410c', bg: '#ffedd5' }
};

function titleOptLogListHtml(logs) {
  let h = '';
  logs.forEach(l => {
    const a = TITLE_OPT_ACTION_MAP[l.action] || { label: l.action, color: '#8899b0', bg: '#f3f4f6' };
    const src = TITLE_OPT_SRC_MAP[l.source] || TITLE_OPT_SRC_MAP.ai;
    const ok = l.status === 'success';
    h += '<div style="padding:10px 12px;border-bottom:1px solid #f3f4f6">';
    h += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px">';
    h += '<span style="font-size:11px;font-weight:700;color:' + a.color + ';background:' + a.bg + ';padding:1px 7px;border-radius:5px">' + a.label + '</span>';
    h += '<span style="font-size:11px;font-weight:700;color:' + src.color + ';background:' + src.bg + ';padding:1px 7px;border-radius:5px" title="操作来源">' + src.label + '</span>';
    if (l.action === 'apply') h += '<span style="font-size:11px;font-weight:700;color:' + (ok ? '#16a34a' : '#dc2626') + '">' + (ok ? '✅成功' : '❌失败') + '</span>';
    h += '<span style="font-size:11px;color:#8899b0;margin-left:auto">' + esc(l.created_at || '') + '</span>';
    h += '</div>';
    h += '<div style="font-size:12px;color:#1e3a5f;font-weight:600">' + esc(l.product_name || '') + ' <span style="font-weight:400;color:#8899b0;font-size:11px">ID ' + esc(l.platform_product_id) + '</span></div>';
    if (l.action === 'optimize' || l.action === 'apply') {
      h += '<div style="font-size:11px;color:#8899b0;line-height:1.6">';
      h += '<div>旧：' + esc(l.old_title || '') + '</div>';
      h += '<div>新：<span style="color:#16a34a">' + esc(l.new_title || '') + '</span></div>';
      h += '</div>';
    }
    if (l.note) h += '<div style="font-size:11px;color:#dc2626;margin-top:2px">' + esc(l.note) + '</div>';
    h += '</div>';
  });
  if (!h) h = '<div style="padding:16px;text-align:center;color:#8899b0;font-size:12px">无匹配日志</div>';
  return h;
}

// 标题优化日志 — 分页辅助
function titleOptLogFiltered() {
  const all = titleOptCache.logs || [];
  const kw = (titleOptCache.logFilter || '').toLowerCase();
  if (!kw) return all;
  return all.filter(l => {
    const hay = [l.product_name, l.platform_product_id, l.old_title, l.new_title, l.action, l.status, l.note,
      (TITLE_OPT_ACTION_MAP[l.action] || {}).label, (TITLE_OPT_SRC_MAP[l.source] || {}).label
    ].join(' ').toLowerCase();
    return hay.includes(kw);
  });
}

function titleOptLogPage() {
  const filtered = titleOptLogFiltered();
  const size = 20;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  let page = titleOptCache.logPage || 1;
  if (page > totalPages) page = totalPages;
  const start = (page - 1) * size;
  return { items: filtered.slice(start, start + size), total, page, size, totalPages };
}

function titleOptLogPagerHtml(pg) {
  if (pg.totalPages <= 1) return '';
  let h = '';
  h += '<button class="btn xs" ' + (pg.page <= 1 ? 'disabled' : '') + ' onclick="titleOptLogGo(' + (pg.page - 1) + ')">‹ 上一页</button>';
  h += '<span>第 ' + pg.page + ' / ' + pg.totalPages + ' 页 · 共 ' + pg.total + ' 条</span>';
  h += '<button class="btn xs" ' + (pg.page >= pg.totalPages ? 'disabled' : '') + ' onclick="titleOptLogGo(' + (pg.page + 1) + ')">下一页 ›</button>';
  return h;
}

function titleOptLogHtml(logs) {
  if (!logs || !logs.length) return '';
  const q = titleOptCache.logFilter || '';
  const pg = titleOptLogPage();
  let h = '<div onclick="toggleBlock(\'log-body\',\'log-arrow\')" style="font-size:13px;font-weight:700;color:#1e3a5f;margin:14px 12px 6px;display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;flex-wrap:wrap">';
  h += '<span id="log-arrow" style="color:#94a3b8">▶</span><span id="log-count">📜 修改日志（共 ' + pg.total + ' 条）</span>';
  h += '<input id="log-search" type="text" placeholder="🔍 搜商品/ID/标题/动作" value="' + esc(q) + '" oninput="titleOptLogSearch(this.value)" onclick="event.stopPropagation()" style="margin-left:auto;padding:4px 10px;border:1px solid #cdd7e5;border-radius:6px;font-size:12px;width:180px;font-weight:400">';
  h += '</div>';
  h += '<div id="log-body" style="display:none">';
  h += '<div id="log-list" style="max-height:360px;overflow-y:auto;margin:0 12px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)">';
  h += titleOptLogListHtml(pg.items);
  h += '</div>';
  h += '<div id="log-pager" style="display:flex;align-items:center;gap:8px;justify-content:center;padding:6px 12px 14px;font-size:12px;color:#5a6b85;flex-wrap:wrap">';
  h += titleOptLogPagerHtml(pg);
  h += '</div>';
  h += '</div>';
  return h;
}

function titleOptLogRender() {
  const body = $('#log-body');
  if (!body) return;
  const pg = titleOptLogPage();
  const list = document.getElementById('log-list');
  if (list) list.innerHTML = titleOptLogListHtml(pg.items);
  const cnt = document.getElementById('log-count');
  if (cnt) cnt.textContent = '📜 修改日志（共 ' + pg.total + ' 条）';
  const pager = document.getElementById('log-pager');
  if (pager) pager.innerHTML = titleOptLogPagerHtml(pg);
  const kw = (titleOptCache.logFilter || '').toLowerCase();
  if (kw && body.style.display === 'none') {
    body.style.display = 'block';
    const a = document.getElementById('log-arrow');
    if (a) a.textContent = '▼';
  }
}

function titleOptLogSearch(v) {
  titleOptCache.logFilter = (v || '').trim();
  titleOptCache.logPage = 1;
  titleOptLogRender();
}

function titleOptLogGo(page) {
  titleOptCache.logPage = page;
  titleOptLogRender();
}

// 通用折叠：切换区块/卡片 body 显示，可选同步箭头
function toggleBlock(id, arrowId) {
  const b = document.getElementById(id);
  if (!b) return;
  const open = b.style.display === 'none';
  b.style.display = open ? 'block' : 'none';
  if (arrowId) {
    const a = document.getElementById(arrowId);
    if (a) a.textContent = open ? '▼' : '▶';
  }
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

async function titleOptFix(optId) {
  try {
    await api('/api/catalog/title-opt/fix', 'POST', { id: optId });
    toast('✅ 已确认修复');
    await loadTitleOptData();
    paintTitleOpt($('#view-titleopt'));
  } catch (e) { toast('❌ ' + e.message); }
}

function titleOptFailFilter(key, val) {
  // 失败清单筛选：shop=店铺 / note=结果类型
  if (key === 'shop') titleOptCache.failShop = val;
  else titleOptCache.failNote = val;
  paintTitleOpt($('#view-titleopt'));
}

async function titleOptFixBatch() {
  // 一键把当前筛选出的失败记录全部标记「已修复」
  const allOpts = titleOptCache.allOpts || [];
  const failOpts = allOpts.filter(o => o.note && o.note !== '执行中…' && o.note !== '已出单，跳过' && o.status !== 'done' && o.status !== 'blocked' && !o.fixed);
  const shown = failOpts.filter(o =>
    (titleOptCache.failShop === 'all' || String(o.shop_id) === String(titleOptCache.failShop)) &&
    (titleOptCache.failNote === 'all' || o.note === titleOptCache.failNote)
  );
  if (!shown.length) { toast('⚠️ 当前筛选无失败记录'); return; }
  if (!confirm('确认将当前筛选的 ' + shown.length + ' 条失败记录全部标记为「已修复」？')) return;
  try {
    const ids = shown.map(o => o.id);
    await api('/api/catalog/title-opt/fix-batch', 'POST', { ids });
    toast('✅ 已批量确认修复 ' + shown.length + ' 条');
    await loadTitleOptData();
    paintTitleOpt($('#view-titleopt'));
  } catch (e) { toast('❌ ' + e.message); }
}

function titleCharLen(s) {
  // 按 GBK 字符数算：1 汉字=2 字符，1 英文/数字/符号=1 字符
  let n = 0;
  for (const ch of s) n += ch.charCodeAt(0) > 0xff ? 2 : 1;
  return n;
}

async function titleOptEdit(optId) {
  const o = titleOptCache.opts.find(x => x.id === optId);
  if (!o) return;
  const res = await promptDialog([
    { key: 'new_title', label: '新标题（最多 60 字符 = 30 汉字）', value: o.new_title || '', placeholder: '输入优化后的商品标题，最多 60 字符（30 汉字）' }
  ], { title: '优化标题' });
  if (!res) return;
  if (!res.new_title || !res.new_title.trim()) { toast('⚠️ 标题不能为空'); return; }
  const tl = titleCharLen(res.new_title.trim());
  if (tl > 60) { toast('⚠️ 标题最多 60 字符（30 汉字），当前 ' + tl + ' 字符'); return; }
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

// ===================== AI老板经营台账（独立记账，从 0 起算，不虚报） =====================
let _bossData = { items: [], orders: [] };

// 轻量 markdown → HTML（标题/表格/列表/加粗/引用/分隔线）
function mdHtml(md) {
  if (!md) return '';
  const esc2 = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = String(md).split('\n');
  let html = '', inTable = false, inList = false;
  const inline = (s) => esc2(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^\|.*\|$/.test(t)) {
      if (!inTable) { html += '<table style="border-collapse:collapse;width:100%;margin:6px 0">'; inTable = true; }
      const cells = t.slice(1, -1).split('|').map(c => c.trim());
      if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue;
      html += '<tr>' + cells.map(c => `<td style="border:1px solid #e2e8f0;padding:5px 8px;font-size:12px;vertical-align:top">${inline(c)}</td>`).join('') + '</tr>';
      continue;
    } else if (inTable) { html += '</table>'; inTable = false; }
    if (/^####\s/.test(t)) { html += `<div style="font-weight:700;font-size:13px;margin:8px 0 4px">${inline(t.slice(5))}</div>`; continue; }
    if (/^###\s/.test(t)) { html += `<div style="font-weight:700;font-size:14px;margin:10px 0 4px;color:#17203a">${inline(t.slice(4))}</div>`; continue; }
    if (/^##\s/.test(t)) { html += `<div style="font-weight:700;font-size:15px;margin:14px 0 6px;color:#17203a;border-bottom:1px solid #e2e8f0;padding-bottom:4px">${inline(t.slice(3))}</div>`; continue; }
    if (/^#\s/.test(t)) { html += `<div style="font-weight:700;font-size:16px;margin:14px 0 8px;color:#17203a">${inline(t.slice(2))}</div>`; continue; }
    if (/^-{3,}$/.test(t)) { html += '<hr style="border:none;border-top:1px solid #e2e8f0;margin:10px 0">'; continue; }
    if (/^>/.test(t)) { html += `<div style="border-left:3px solid #cbd5e1;padding-left:8px;color:#64748b;margin:6px 0">${inline(t.replace(/^>\s?/, ''))}</div>`; continue; }
    if (/^[-*]\s/.test(t)) {
      if (!inList) { html += '<ul style="margin:4px 0;padding-left:18px">'; inList = true; }
      html += `<li style="margin:2px 0">${inline(t.slice(2))}</li>`;
      continue;
    } else if (inList) { html += '</ul>'; inList = false; }
    if (!t) { html += '<div style="height:6px"></div>'; continue; }
    html += `<div style="margin:3px 0">${inline(t)}</div>`;
  }
  if (inTable) html += '</table>';
  if (inList) html += '</ul>';
  return html;
}

async function renderAiBoss() {
  const el = $('#view-aiboss');
  if (!el) return;
  let data = { items: [], orders: [], summary: {} };
  let dash = { daily: [], keywords: [], actions: [], rules: { actions: [], rules: {}, constraints: {} } };
  let bossLog = [];
  let research = [];
  try { data = await api('/api/aiboss'); } catch (e) { data = { items: [], orders: [], summary: {} }; }
  try { dash = await api('/api/aiboss/dashboard'); } catch (e) {}
  try { bossLog = (await api('/api/aiboss/log')).items || []; } catch (e) { bossLog = []; }
  try { research = (await api('/api/aiboss/research')).items || []; } catch (e) { research = []; }
  const s = data.summary || {};
  const items = data.items || [];
  const orders = data.orders || [];
  _bossData = { items, orders, dash };

  const rules = dash.rules || {};
  const ruleActions = rules.actions || [];
  const ruleStatus = rules.rules || {};
  const constraints = rules.constraints || {};
  const actionLog = dash.actions || [];
  const daily = dash.daily || [];
  const keywords = dash.keywords || [];

  const itemRows = items.map(it => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:8px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:160px">
        <div style="font-weight:600;font-size:14px;color:#17203a">${esc(it.title)}</div>
        ${it.source_url ? `<div style="color:#94a3b8;font-size:12px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:320px">${esc(it.source_url)}</div>` : ''}
      </div>
      <div style="font-size:13px;color:#475569">进价 <b>¥${fmt(it.cost)}</b></div>
      <div style="font-size:13px;color:#475569">售价 <b style="color:#2563eb">¥${fmt(it.sale_price)}</b></div>
      <div style="font-size:13px;color:#16a34a;font-weight:600">毛利 ¥${fmt(it.sale_price - it.cost)}</div>
      <button class="btn primary" style="padding:6px 14px;font-size:12px" onclick="aiBossOrderFromItem(${it.id})">出单</button>
      <button class="btn" style="padding:6px 12px;font-size:12px" onclick="aiBossDeleteItem(${it.id})">删</button>
    </div>`).join('');

  const orderRows = orders.map(o => {
    const st = o.status === 'shipped'
      ? '<span style="background:#f0fdf4;color:#16a34a;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600">已发货</span>'
      : '<span style="background:#fef3c7;color:#b45309;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600">待发货</span>';
    const tracking = o.status === 'shipped'
      ? `<span style="font-size:12px;color:#64748b">📦 ${esc(o.tracking_no)}</span>`
      : `<input class="boss-tracking" data-id="${o.id}" placeholder="填单号发货" style="width:130px;padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px"><button class="btn primary" style="padding:6px 12px;font-size:12px" onclick="aiBossFillTracking(${o.id})">发货</button>`;
    return `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:8px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:140px">
        <div style="font-weight:600;font-size:14px;color:#17203a">${esc(o.title)} <span style="color:#94a3b8;font-weight:400;font-size:12px">×${o.qty}</span></div>
        <div style="color:#94a3b8;font-size:12px;margin-top:2px">${esc((o.created_at||'').slice(0,16))}</div>
      </div>
      <div style="font-size:12px;color:#475569">进价 ¥${fmt(o.cost)} → 售价 ¥${fmt(o.sale_price)}${o.freight ? ` · 运费 ¥${fmt(o.freight)}` : ''}</div>
      <div style="font-size:13px;color:#16a34a;font-weight:700">单件 ¥${fmt(o.profit)} · 小计 ¥${fmt(o.profit * o.qty)}</div>
      ${st}
      ${tracking}
    </div>`;
  }).join('');

  // ---- 规则引擎面板 + 动作审计 ----
  const ruleNameMap = { A: '标题提词换词', B: '7天零数据下架', C: '出单品加推' };
  const actionNameMap = { title_update: '改标题', offshelf: '下架', promote: '加推', price_switch: '换供应商' };
  const ruleActionRows = ruleActions.length ? ruleActions.map(a => {
    const detail = a.detail ? (typeof a.detail === 'string' ? a.detail : JSON.stringify(a.detail)).slice(0, 100) : '';
    const isOffshelf = a.action_type === 'offshelf';
    const btnLabel = isOffshelf ? '✓ 确认已下架' : '▶ 执行';
    const btnStyle = isOffshelf ? 'background:#fff;color:#c2410c;border:1px solid #fdba74' : 'background:#ea580c;color:#fff;border:none';
    return `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px;margin-bottom:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:180px">
        <span style="font-weight:600;color:#c2410c;font-size:13px">规则${a.rule}·${ruleNameMap[a.rule] || ''}</span>
        <span style="font-size:12px;color:#9a3412;margin-left:6px">→ ${actionNameMap[a.action_type] || a.action_type}</span>
        <div style="color:#7c2d12;font-size:12px;margin-top:4px">${esc(a.goods_name || a.goods_id)}${detail ? ' · ' + esc(detail) : ''}</div>
      </div>
      <button onclick="aiBossExecute('${a.goods_id}','${a.action_type}')" style="padding:7px 16px;font-size:13px;font-weight:600;border-radius:8px;cursor:pointer;${btnStyle}">${btnLabel}</button>
    </div>`;
  }).join('') : '<div style="color:#94a3b8;font-size:13px">当前无触发动作（数据量不足或未达阈值，先导入经营数据）。</div>';

  const ruleStatusHtml = ['A', 'B', 'C'].map(k => {
    const r = ruleStatus[k] || { name: '', triggered: [] };
    const n = (r.triggered || []).length;
    return `<div style="flex:1;min-width:110px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px">
      <div style="font-size:12px;color:#475569;font-weight:600">规则${k} ${esc(r.name || '')}</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px;color:${n ? '#dc2626' : '#16a34a'}">${n} 触发</div>
    </div>`;
  }).join('');

  const stMap = { proposed: '提议', executed: '已执行', verified: '已验证', blocked: '被硬约束拦截' };
  const vsMap = { pending: '待验证', verified_success: '✅验证成功', uncertain: '⚠️不确定', failed_final: '❌失败' };
  const actionLogHtml = actionLog.length ? actionLog.slice(0, 12).map(a => `<div style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569;display:flex;justify-content:space-between;gap:8px">
      <span><b>${esc(actionNameMap[a.action_type] || a.action_type)}</b> <span style="color:#94a3b8">· ${esc(a.goods_name || a.goods_id || '')} · ${esc((a.created_at || '').slice(0, 16))}</span></span>
      <span style="white-space:nowrap">${stMap[a.status] || a.status} / ${vsMap[a.verify_status] || a.verify_status}</span>
    </div>`).join('') : '<div style="color:#94a3b8;font-size:13px">暂无动作记录。</div>';

  const logStMap = { success: '✅ 正常', partial: '⚠️ 部分异常', fail: '❌ 失败' };
  const bossLogHtml = bossLog.length ? bossLog.slice(0, 15).map(l => `<div style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569;display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
      <span style="flex:1"><b style="color:#17203a">${esc(l.summary || '—')}</b></span>
      <span style="white-space:nowrap;color:#94a3b8">${esc((l.created_at || '').slice(0, 16))} · ${logStMap[l.status] || l.status}</span>
    </div>`).join('') : '<div style="color:#94a3b8;font-size:13px">暂无工作日志（定时唤醒后自动记录）。</div>';

  const recentDaily = daily.slice(0, 7);
  const totalVisitors = recentDaily.reduce((s, d) => s + (Number(d.visitor_cnt) || 0), 0);
  const totalOrders7 = recentDaily.reduce((s, d) => s + (Number(d.pay_order_cnt) || 0), 0);
  const totalAmount7 = recentDaily.reduce((s, d) => s + (Number(d.pay_amount) || 0), 0);

  el.innerHTML = `
    <div style="padding:20px;max-width:1100px">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
        <div style="flex:1;min-width:150px;background:linear-gradient(135deg,#16a34a,#15803d);border-radius:12px;padding:16px;color:#fff">
          <div style="font-size:12px;opacity:.85">已实现利润（从 0 起算）</div>
          <div style="font-size:26px;font-weight:700;margin-top:4px">¥${fmt(s.shipped_profit)}</div>
          <div style="font-size:12px;opacity:.85;margin-top:2px">已发货 ${s.shipped_count} 单 · ${s.shipped_qty} 件</div>
        </div>
        <div style="flex:1;min-width:150px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
          <div style="font-size:12px;color:#64748b">待发货（账面预期，未入账）</div>
          <div style="font-size:26px;font-weight:700;margin-top:4px;color:#b45309">¥${fmt(s.pending_profit)}</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:2px">${s.pending_count} 单待发货</div>
        </div>
        <div style="flex:1;min-width:150px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
          <div style="font-size:12px;color:#64748b">在售选品</div>
          <div style="font-size:26px;font-weight:700;margin-top:4px;color:#17203a">${s.item_count}</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:2px">累计出单 ${s.order_count} 笔</div>
        </div>
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;flex-wrap:wrap;gap:8px">
          <div style="font-weight:700;font-size:15px">🔍 AI 选品研究（该卖什么）</div>
          <button class="btn primary" style="padding:7px 16px;font-size:13px" onclick="aiBossResearch()">生成选品研究</button>
        </div>
        <div style="color:#94a3b8;font-size:12px;margin-bottom:12px">AI 老板研究应季/趋势，输出「该卖什么 + 关键词 + 注意事项 + 建议」，人拍板执行。</div>
        ${research.length ? `
        <details open style="margin-top:4px">
          <summary style="cursor:pointer;color:#2563eb;font-size:13px">📄 最新报告（${esc((research[0].created_at||'').slice(0,10))}）</summary>
          <div style="margin-top:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;font-size:13px;line-height:1.7;color:#334155;max-height:640px;overflow:auto">${mdHtml(research[0].content)}</div>
        </details>` : '<div style="color:#94a3b8;font-size:13px">暂无研究报告，点右上角「生成选品研究」。</div>'}
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px">
        <div style="font-weight:700;font-size:15px;margin-bottom:4px">🧠 决策规则引擎（系统当董事会）</div>
        <div style="color:#94a3b8;font-size:12px;margin-bottom:12px">AI 提议，系统确认事实 + 执行硬约束。标题修改硬约束：每 ${constraints.title_cooldown_days || 14} 天 1 次。</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${ruleStatusHtml}</div>
        <div style="font-size:13px;font-weight:600;color:#475569;margin-bottom:8px">⚡ 待执行动作</div>
        ${ruleActionRows}
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px">
        <div style="font-weight:700;font-size:15px;margin-bottom:4px">📊 经营数据闭环（近7天）</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <div style="flex:1;min-width:90px;background:#f8fafc;border-radius:8px;padding:10px;text-align:center"><div style="font-size:12px;color:#64748b">访客</div><div style="font-size:20px;font-weight:700">${totalVisitors}</div></div>
          <div style="flex:1;min-width:90px;background:#f8fafc;border-radius:8px;padding:10px;text-align:center"><div style="font-size:12px;color:#64748b">支付订单</div><div style="font-size:20px;font-weight:700">${totalOrders7}</div></div>
          <div style="flex:1;min-width:90px;background:#f8fafc;border-radius:8px;padding:10px;text-align:center"><div style="font-size:12px;color:#64748b">支付金额</div><div style="font-size:20px;font-weight:700">¥${fmt(totalAmount7)}</div></div>
        </div>
        <div style="color:#94a3b8;font-size:12px;margin-bottom:8px">数据来源：CDP 抓商家后台（已接入）或手动导入。点击采集后，规则引擎自动评估触发。</div>
        <button class="btn primary" style="padding:7px 16px;font-size:13px;margin-bottom:8px" onclick="aiBossCollect()">🔄 采集今日经营数据</button>
        <button class="btn" style="padding:7px 16px;font-size:13px;margin-bottom:8px;margin-left:6px;background:#17203a;color:#fff" onclick="aiBossDailyRun()">🤖 AI老板上班（完整工作流）</button>
        <details style="margin-top:8px">
          <summary style="cursor:pointer;color:#2563eb;font-size:13px">＋ 手动导入经营数据 / 成交词</summary>
          <div style="margin-top:10px">
            <div style="font-size:12px;color:#64748b;margin-bottom:6px">经营数据（JSON 数组）</div>
            <textarea id="boss-daily-json" placeholder='JSON 数组：[{"goods_id":"...","goods_name":"标题","stat_date":"2026-09-30","visitor_cnt":100,"pay_order_cnt":3,"pay_amount":180,"pay_rate":0.03,"collect_cnt":5}]' style="width:100%;min-height:70px;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;font-family:monospace"></textarea>
            <button class="btn primary" style="padding:6px 14px;font-size:12px;margin-top:6px" onclick="aiBossImportDaily()">导入经营数据</button>
            <div style="font-size:12px;color:#64748b;margin:10px 0 6px">成交词（JSON 数组）</div>
            <textarea id="boss-kw-json" placeholder='JSON 数组：[{"goods_id":"...","keyword":"手套","stat_date":"2026-09-30","pay_order_cnt":2,"pay_rate":0.05}]' style="width:100%;min-height:60px;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;font-family:monospace"></textarea>
            <button class="btn primary" style="padding:6px 14px;font-size:12px;margin-top:6px" onclick="aiBossImportKeywords()">导入成交词</button>
          </div>
        </details>
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px">
        <div style="font-weight:700;font-size:15px;margin-bottom:4px">📋 动作审计（每一步可追溯）</div>
        <div style="color:#94a3b8;font-size:12px;margin-bottom:10px">AI 的每个决策动作 + 验证结果。只有系统验证器返回 VERIFIED_SUCCESS 才进入可操作池。</div>
        ${actionLogHtml}
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px">
        <div style="font-weight:700;font-size:15px;margin-bottom:4px">📔 AI老板工作日志（每次上班留痕）</div>
        <div style="color:#94a3b8;font-size:12px;margin-bottom:10px">定时唤醒后自动记录：采集→评估→决策→执行→复盘，全程可查。</div>
        ${bossLogHtml}
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px">
        <div style="font-weight:700;font-size:15px;margin-bottom:10px">📦 选品（AI老板决策）</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <input id="boss-item-title" placeholder="商品标题" style="flex:2;min-width:160px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px">
          <input id="boss-item-cost" type="number" placeholder="进价" style="flex:1;min-width:80px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px">
          <input id="boss-item-sale" type="number" placeholder="售价" style="flex:1;min-width:80px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px">
          <input id="boss-item-url" placeholder="1688链接(可选)" style="flex:2;min-width:160px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px">
          <button class="btn primary" style="padding:9px 18px;font-size:13px" onclick="aiBossAddItem()">加选品</button>
        </div>
        ${itemRows || '<div style="color:#94a3b8;font-size:13px">暂无选品，先加一个。</div>'}
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
        <div style="font-weight:700;font-size:15px;margin-bottom:4px">🧾 出单记录（出单后你下单填单号，利润只算已发货）</div>
        <div style="color:#94a3b8;font-size:12px;margin-bottom:10px">不虚报：待发货订单不计入「已实现利润」，填了单号才入账。</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <input id="boss-order-title" placeholder="商品标题" style="flex:2;min-width:140px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px">
          <input id="boss-order-qty" type="number" value="1" placeholder="数量" style="flex:1;min-width:60px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px">
          <input id="boss-order-cost" type="number" placeholder="进价" style="flex:1;min-width:80px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px">
          <input id="boss-order-sale" type="number" placeholder="售价" style="flex:1;min-width:80px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px">
          <input id="boss-order-freight" type="number" value="0" placeholder="运费" style="flex:1;min-width:70px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px">
          <button class="btn primary" style="padding:9px 18px;font-size:13px" onclick="aiBossAddOrder()">出单</button>
        </div>
        ${orderRows || '<div style="color:#94a3b8;font-size:13px">暂无订单。</div>'}
      </div>
    </div>
  `;
}

async function aiBossAddItem() {
  const title = $('#boss-item-title').value.trim();
  if (!title) { toast('请填商品标题'); return; }
  try {
    await api('/api/aiboss/items', 'POST', {
      title,
      cost: Number($('#boss-item-cost').value) || 0,
      sale_price: Number($('#boss-item-sale').value) || 0,
      source_url: $('#boss-item-url').value.trim(),
    });
    toast('✅ 已加选品');
    renderAiBoss();
  } catch (e) { toast('❌ ' + e.message); }
}

async function aiBossDeleteItem(id) {
  const ok = await confirmDialog('确定删除这个选品？（不影响已出单记录）', { title: '删除选品', confirmText: '删除' });
  if (!ok) return;
  try {
    await api('/api/aiboss/items/' + id, 'POST', { _action: 'delete' });
    toast('✅ 已删除');
    renderAiBoss();
  } catch (e) { toast('❌ ' + e.message); }
}

function aiBossOrderFromItem(id) {
  const it = _bossData.items.find(x => x.id === id);
  if (!it) return;
  $('#boss-order-title').value = it.title;
  $('#boss-order-cost').value = it.cost;
  $('#boss-order-sale').value = it.sale_price;
  $('#boss-order-qty').value = 1;
  $('#boss-order-freight').value = 0;
  $('#boss-order-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
  toast('已填入出单表单，确认数量/运费后点「出单」');
}

async function aiBossAddOrder() {
  const title = $('#boss-order-title').value.trim();
  if (!title) { toast('请填商品标题'); return; }
  try {
    await api('/api/aiboss/orders', 'POST', {
      title,
      qty: Number($('#boss-order-qty').value) || 1,
      cost: Number($('#boss-order-cost').value) || 0,
      sale_price: Number($('#boss-order-sale').value) || 0,
      freight: Number($('#boss-order-freight').value) || 0,
    });
    toast('✅ 已出单，等你下单填单号');
    renderAiBoss();
  } catch (e) { toast('❌ ' + e.message); }
}

async function aiBossFillTracking(id) {
  const inp = document.querySelector(`.boss-tracking[data-id="${id}"]`);
  const no = inp ? inp.value.trim() : '';
  if (!no) { toast('请先填单号'); return; }
  try {
    await api('/api/aiboss/orders/' + id, 'POST', { tracking_no: no });
    toast('✅ 已发货，利润入账');
    renderAiBoss();
  } catch (e) { toast('❌ ' + e.message); }
}

async function aiBossImportDaily() {
  const raw = $('#boss-daily-json').value.trim();
  if (!raw) { toast('请粘贴 JSON 数组'); return; }
  let rows;
  try { rows = JSON.parse(raw); } catch (e) { toast('❌ JSON 解析失败：' + e.message); return; }
  if (!Array.isArray(rows)) rows = [rows];
  try {
    const r = await api('/api/aiboss/daily', 'POST', { rows });
    toast('✅ 已导入 ' + r.imported + ' 条经营数据');
    renderAiBoss();
  } catch (e) { toast('❌ ' + e.message); }
}

async function aiBossImportKeywords() {
  const raw = $('#boss-kw-json').value.trim();
  if (!raw) { toast('请粘贴 JSON 数组'); return; }
  let rows;
  try { rows = JSON.parse(raw); } catch (e) { toast('❌ JSON 解析失败：' + e.message); return; }
  if (!Array.isArray(rows)) rows = [rows];
  try {
    const r = await api('/api/aiboss/keywords', 'POST', { rows });
    toast('✅ 已导入 ' + r.imported + ' 条成交词');
    renderAiBoss();
  } catch (e) { toast('❌ ' + e.message); }
}

async function aiBossResearch() {
  toast('🔍 AI 老板开始选品研究（约30-60秒）');
  try {
    await api('/api/aiboss/research', 'POST', {});
    setTimeout(() => { toast('✅ 选品研究完成，刷新中…'); renderAiBoss(); }, 60000);
  } catch (e) { toast('❌ ' + e.message); }
}

async function aiBossCollect() {
  toast('🔄 采集已启动，约 30 秒后刷新查看');
  try {
    await api('/api/aiboss/collect', 'POST', {});
    setTimeout(() => { toast('✅ 采集完成，刷新中…'); renderAiBoss(); }, 30000);
  } catch (e) { toast('❌ ' + e.message); }
}

async function aiBossDailyRun() {
  toast('🤖 AI老板开始上班（采集→评估→执行→写日志），约1-2分钟');
  try {
    await api('/api/aiboss/run-daily', 'POST', {});
    setTimeout(() => { toast('✅ 工作流完成，刷新中…'); renderAiBoss(); }, 120000);
  } catch (e) { toast('❌ ' + e.message); }
}

async function aiBossExecute(goods_id, action_type) {
  const acts = (_bossData.dash && _bossData.dash.rules && _bossData.dash.rules.actions) || [];
  const a = acts.find(x => x.goods_id === goods_id && x.action_type === action_type);
  if (!a) { toast('未找到该动作'); return; }
  const isOffshelf = action_type === 'offshelf';
  let ok = true;
  if (isOffshelf) {
    ok = await confirmDialog('确认已在拼多多后台手动下架该商品？系统将记录为「人工下架确认」（无自动验证）。', { title: '确认下架', confirmText: '确认已下架' });
  } else {
    ok = await confirmDialog('执行改标题？系统用成交词生成优化标题（DeepSeek）并通过质量门校验后更新到拼多多后台。', { title: '执行规则动作', confirmText: '执行' });
  }
  if (!ok) return;
  try {
    await api('/api/aiboss/execute', 'POST', {
      goods_id, action_type,
      rule: a.rule, goods_name: a.goods_name, detail: a.detail,
    });
    toast('✅ 已启动执行，约 1 分钟后刷新查看结果');
    setTimeout(() => renderAiBoss(), 60000);
  } catch (e) { toast('❌ ' + e.message); }
}

init();
