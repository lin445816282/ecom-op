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
};

const state = { view:'dashboard', shop:'拼多多', products:[], knowledge:[], calendar:[], templates:[], tasks:[], keywords:[], promotionHistory:[] };

// 店铺过滤辅助（当前店铺视角）
const shopProducts = () => state.products.filter(p => (p.shop||'拼多多') === state.shop);
const shopKeywords = () => state.keywords.filter(k => (k.shop||'拼多多') === state.shop);
const shopTasks = () => state.tasks.filter(t => (t.shop||'拼多多') === state.shop);

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
  // 标题生成词表
  const coreWords = kws.filter(k=>k.category==='核心词' && k.status!=='弃用');
  const attrWords = kws.filter(k=>k.category==='属性词' && k.status!=='弃用');
  const sceneWords = kws.filter(k=>k.category==='场景词' && k.status!=='弃用');
  const specWords = kws.filter(k=>k.category==='规格词' && k.status!=='弃用');
  const genTitles = (core, n) => {
    const pick = arr => arr.length ? arr[Math.floor(Math.random()*arr.length)].word : '';
    const templates = [
      (a1,a2,sc,sp) => core + a1 + a2 + sc,
      (a1,a2,sc,sp) => core + a1 + sc + sp,
      (a1,a2,sc,sp) => a1 + core + a2 + sc,
      (a1,a2,sc,sp) => core + a1 + sp + a2,
      (a1,a2,sc,sp) => core + sc + a1 + a2,
    ];
    const titles = new Set();
    let guard = 0;
    while (titles.size < n && guard < 300) {
      guard++;
      const a1 = pick(attrWords), a2 = pick(attrWords), sc = pick(sceneWords), sp = pick(specWords);
      const t = templates[guard % templates.length](a1, a2, sc, sp);
      if (t.length <= 30 && t.length >= 6) titles.add(t);
    }
    return [...titles];
  };
  const statusCls = s => ({'待用':'blue','在用':'green','弃用':'gray'}[s]||'blue');
  const hotCls = h => ({'热':'red','中':'amber','长尾':'gray'}[h]||'gray');
  const relCls = r => ({'高':'green','中':'blue','低':'gray'}[r]||'gray');

  const kwRow = k => `
    <div class="task-row" style="align-items:center">
      <div class="task-body" style="flex:1">
        <div class="task-title">${esc(k.word)}</div>
        <div class="task-meta">${esc(k.source||'')} · ${esc(k.category||'')}</div>
      </div>
      <span class="tag ${hotCls(k.hot)}" title="热度">🔥${esc(k.hot||'—')}</span>
      <span class="tag ${relCls(k.relevance)}" style="margin:0 4px" title="关联性">${esc(k.relevance||'—')}关联</span>
      <span class="tag ${statusCls(k.status)}">${esc(k.status||'待用')}</span>
      <button class="btn sm" style="margin-left:6px" onclick="window.__kwStatus && window.__kwStatus('${k.id}')">状态</button>
      <button class="btn sm danger" onclick="window.__delKw && window.__delKw('${k.id}')">删</button>
    </div>`;

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
      <div class="panel-header"><h2>✨ 标题生成器</h2><span class="badge">核心词 + 属性词 + 场景词 + 规格词</span></div>
      <div class="field-row">
        <div class="field"><label>核心词</label>
          <select id="tg-core">${coreWords.map(w=>`<option value="${esc(w.word)}">${esc(w.word)}</option>`).join('') || '<option value="">（无核心词）</option>'}</select>
        </div>
        <div class="field"><label>生成条数</label>
          <select id="tg-n"><option>5</option><option>8</option><option>10</option></select>
        </div>
      </div>
      <div class="form-actions"><button class="btn primary" id="tg-btn">✨ 生成标题</button></div>
      <div id="tg-result" style="margin-top:12px"></div>
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
          <div class="form-actions"><button type="submit" class="btn primary">添加关键词</button></div>
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

  renderList();

  // 标题生成
  $('#tg-btn').onclick = () => {
    const core = $('#tg-core').value;
    const n = parseInt($('#tg-n').value) || 5;
    if (!core) { $('#tg-result').innerHTML = '<div class="empty">请先添加核心词</div>'; return; }
    const titles = genTitles(core, n);
    $('#tg-result').innerHTML = titles.length
      ? titles.map((t,i)=>`<div class="task-row"><span class="tag green">${i+1}</span><div class="task-body"><div class="task-title">${esc(t)}</div><div class="task-meta">${t.length} 字</div></div><button class="btn sm" onclick="navigator.clipboard&&navigator.clipboard.writeText('${esc(t)}')">复制</button></div>`).join('')
      : '<div class="empty">属性词/场景词不足，请先补充关键词</div>';
  };

  $('#kw-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {word: fd.get('word'), category: fd.get('category'), source: fd.get('source')||'manual', product: fd.get('product')||'门后挂钩'};
    try {
      await api('/api/keywords','POST',body);
      await loadKeywordsOnly();
      renderKeywords();
      toast('已添加关键词');
    } catch(err){ toast(err.message); }
  });

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
  const [p,k,c,tpl,tasks,kw,ph] = await Promise.all([
    api('/api/products'), api('/api/knowledge'), api('/api/calendar'),
    api('/api/task-templates'), api('/api/tasks'), api('/api/keywords'),
    api('/api/promotion-history'),
  ]);
  state.products = p.items || [];
  state.knowledge = k.items || [];
  state.calendar = c.items || [];
  state.templates = tpl.items || [];
  state.tasks = tasks.items || [];
  state.keywords = kw.items || [];
  state.promotionHistory = ph.items || [];
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
