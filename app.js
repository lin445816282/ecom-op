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

function renderDashboard() {
  const p = shopProducts();
  const count = p.length;
  const avgMargin = count ? p.reduce((s,x)=>s+x.margin,0)/count : 0;
  let totalAdSpend = p.reduce((s,x)=>s+(x.ad_spend||0),0);
  let totalOrders = p.reduce((s,x)=>s+(x.orders||0),0);
  const risky = p.filter(x => x.break_even_roi!==Infinity && x.break_even_roi > 3.5).length;
  const done = shopTasks().filter(t=>t.done).length;

  $('#view-dashboard').innerHTML = `
    <section class="hero">
      <div>
        <h2>今日运营工作台</h2>
        <p>先测款、后内功、小预算冷启动，再用真实成交数据决定放量还是拖价。所有指标都围绕“到手价毛利”和“保本投产”做判断，避免烧钱买亏损流量。</p>
      </div>
      <button class="cta" data-nav="products">＋ 新增商品投产</button>
    </section>

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

function renderProducts() {
  $('#view-products').innerHTML = productFormHTML() + productTableHTML();
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
    if (p) {
      $('#view-products').innerHTML = productFormHTML(p) + productTableHTML();
      renderProducts();
    }
  });
  $$('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('确认删除该商品？')) return;
    try { await api(`/api/products/${b.dataset.del}`,'DELETE'); await loadAll(); renderProducts(); toast('已删除'); }
    catch(err){ toast(err.message); }
  });
  const exp = $('#export-btn');
  if (exp) exp.onclick = () => window.open(BASE + '/api/products/export','_blank');
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
  const products = ['全部产品', ...new Set(kws.map(k => k.product || '门后挂钩'))];
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
    return `
    <div class="task-row" style="align-items:center">
      <div class="task-body" style="flex:1">
        <div class="task-title">${esc(k.word)}</div>
        <div class="task-meta">${esc(k.source||'')} · ${esc(k.category||'')} · ${esc(k.pool_type||'main')}池 · 权重${esc(k.weight!=null?k.weight:5)}${dimStr}</div>
      </div>
      <span class="tag ${hotCls(k.hot)}" title="热度">🔥${esc(k.hot||'—')}</span>
      <span class="tag ${relCls(k.relevance)}" style="margin:0 4px" title="关联性">${esc(k.relevance||'—')}关联</span>
      <span class="tag ${statusCls(k.status)}">${esc(k.status||'待用')}</span>
      <button class="btn sm" style="margin-left:6px" onclick="window.__kwStatus && window.__kwStatus('${k.id}')">状态</button>
      <button class="btn sm danger" onclick="window.__delKw && window.__delKw('${k.id}')">删</button>
    </div>`;
  };

  // 四维筛选状态（产品 × 分类 × 热度 × 关联性）
  const f = {product:'全部产品', cat:'全部', hot:'全部热度', rel:'全部关联'};
  const applyFilter = () => kws.filter(k =>
    (f.product==='全部产品' || (k.product||'门后挂钩')===f.product) &&
    (f.cat==='全部' || k.category===f.cat) &&
    (f.hot==='全部热度' || k.hot===f.hot) &&
    (f.rel==='全部关联' || k.relevance===f.rel)
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
      <div class="panel-header"><h2>✨ 标题生成器</h2><span class="badge">核心词+属性+场景+规格 · 热度加权 · 长尾词直推</span></div>
      <div class="field-row">
        <div class="field"><label>核心词</label>
          <select id="tg-core">${coreWords.map(w=>`<option value="${esc(w.word)}">${esc(w.word)}</option>`).join('') || '<option value="">（无核心词）</option>'}</select>
        </div>
        <div class="field"><label>生成条数</label>
          <select id="tg-n"><option>5</option><option>8</option><option>10</option></select>
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
            <datalist id="kw-prod-list">${products.filter(p=>p!=='全部产品').map(p=>`<option value="${esc(p)}">`).join('')}</datalist>
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
          ${products.map(p=>`<button class="tab ${p==='全部产品'?'active':''}" data-v="${esc(p)}">${esc(p)}${p==='全部产品'?'':` (${prodCounts[p]||0})`}</button>`).join('')}
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
        <div style="margin-top:10px;display:flex;gap:8px">
          <button class="btn sm primary" id="kw-best-btn">🔥 热 + 高关联</button>
          <button class="btn sm" id="kw-clear-btn">清除筛选</button>
          <button class="btn sm" id="kw-clean-btn">🧹 批量清洗</button>
        </div>
        <div id="kw-list" style="margin-top:12px;max-height:360px;overflow-y:auto"></div>
      </div>
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

  // 一键热+高关联
  $('#kw-best-btn').onclick = () => {
    f.hot = '热'; f.rel = '高';
    $$('#kw-hot-tabs .tab').forEach(x=>x.classList.toggle('active', x.dataset.v==='热'));
    $$('#kw-rel-tabs .tab').forEach(x=>x.classList.toggle('active', x.dataset.v==='高'));
    renderList();
  };
  // 清除筛选
  $('#kw-clear-btn').onclick = () => {
    f.product='全部产品'; f.cat='全部'; f.hot='全部热度'; f.rel='全部关联';
    $$('#kw-prod-tabs .tab').forEach(x=>x.classList.toggle('active', x.dataset.v==='全部产品'));
    $$('#kw-cat-tabs .tab').forEach(x=>x.classList.toggle('active', x.dataset.v==='全部'));
    $$('#kw-hot-tabs .tab').forEach(x=>x.classList.toggle('active', x.dataset.v==='全部热度'));
    $$('#kw-rel-tabs .tab').forEach(x=>x.classList.toggle('active', x.dataset.v==='全部关联'));
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
    const n = parseInt($('#tg-n').value) || 5;
    const platform = $('#tg-platform').value || 'all';
    if (!core) { $('#tg-result').innerHTML = '<div class="empty">请先添加核心词</div>'; return; }
    $('#tg-result').innerHTML = '<div class="empty">生成中…</div>';
    try {
      const resp = await api('/api/titles/generate', 'POST', {core, n, platform});
      const combined = resp.items || [];       // 后端模板+结构化词库生成
      const direct = platform === 'all' ? longtailTitles : longtailTitles;  // 长尾词直推
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
              <button class="btn sm" style="margin-left:4px" onclick="navigator.clipboard&&navigator.clipboard.writeText('${esc(t)}')">复制</button>
            </div>`;
          }).join('')
        : '<div class="empty">词表不足，请先补充关键词</div>';
    } catch(err) {
      $('#tg-result').innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
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

async function init() {
  $('#date-pill').textContent = todayCN();
  $$('.nav-item').forEach(b => b.onclick = () => setView(b.dataset.view));
  $$('[data-nav]').forEach(b => b.onclick = () => setView(b.dataset.nav));
  // 店铺切换
  $$('.shop-btn').forEach(b => b.onclick = () => {
    $$('.shop-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    state.shop = b.dataset.shop;
    setView(state.view);
  });
  await loadAll();
  setView('dashboard');
}
init();
