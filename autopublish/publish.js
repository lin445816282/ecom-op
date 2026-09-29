// 拼多多商品上架全流程自动化（嘉裕店 CDP 9232）— 幂等续填版
// 用法：node publish.js [config.json] [port]
// 幂等：每步检测已填状态，已填跳过；草稿已存在则跳过类目选择直接续填。
const http = require('http');
const fs = require('fs');

const PORT = process.argv[3] || process.env.PDD_PORT || '9232';
const CONFIG = process.argv[2] || 'config.json';
const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
const LOGFILE = CONFIG.replace(/\.json$/, '.publish.log');

const sleep = ms => new Promise(r => setTimeout(r, ms));
function log(){
  const msg = Array.prototype.join.call(arguments, ' ');
  const line = '[' + new Date().toTimeString().slice(0,8) + '] ' + msg;
  process.stdout.write(line + '\n');
  try { fs.appendFileSync(LOGFILE, line + '\n', 'utf8'); } catch(e) {}
}
function get(u){return new Promise((res,rej)=>{
  const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});
  req.on('error',rej);
  req.setTimeout(5000,()=>{ req.destroy(); rej(new Error('HTTP超时:'+u)); });
})}

async function conn(wsUrl){
  const ws=new WebSocket(wsUrl);let id=0;const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{
    const mid=++id;p.set(mid,{res,rej});
    const to=setTimeout(()=>{ if(p.has(mid)){ p.delete(mid); rej(new Error('CDP超时:'+m)); } }, 15000);
    ws.send(JSON.stringify({id:mid,method:m,params:pa}));
  });
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  return {ws,send};
}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

async function getPage(pattern){
  const tabs=await get(`http://127.0.0.1:${PORT}/json`);
  const pages = tabs.filter(t=>t.type==='page');
  return pages.find(t=>pattern.test(t.url||''))||null;
}

async function fillByType(c, selector, text){
  const f=await ev(c,`(()=>{const inp=document.querySelector(${JSON.stringify(selector)});if(!inp)return 'no';inp.scrollIntoView({block:'center'});inp.click();inp.focus();return 'ok'})()`);
  if(f!=='ok')return f;
  await sleep(250);
  await c.send('Input.insertText',{text:String(text)});
  await sleep(200);
  return 'ok';
}

(async()=>{
  log('启动，端口=' + PORT + '，config=' + CONFIG);

  // ===== 连接：总是新建干净 tab（关闭残留发布页，避免误复用上一个商品的脏草稿导致规格错乱） =====
  // 注意：连续上架多个商品时，上一个商品的发布页(goods_add/index)还开着，续填会误复用导致规格类型错乱。
  let c = null;
  // 清理残留发布页：导航走所有 goods_add/index（排除 success 结果页），让下方 getPage 找不到发布页
  try{
    const _stale = await get(`http://127.0.0.1:${PORT}/json`);
    for(const _sp of (_stale||[]).filter(t=>t.type==='page' && /goods_add\/index/.test(t.url||''))){
      try{ const _sc=await conn(_sp.webSocketDebuggerUrl); await _sc.send('Page.navigate',{url:'about:blank'}); _sc.ws.close(); log('已清理残留发布页 tab'); }catch(e){}
    }
  }catch(e){}
  let pubPage = null;  // 强制新建，不续填
  if(pubPage){
    // 发布页已存在 → 续填模式
    try{
      c=await conn(pubPage.webSocketDebuggerUrl);
      await Promise.race([
        c.send('Page.enable',{}),
        sleep(5000).then(()=>{ throw new Error('发布页无响应'); }),
      ]);
      await c.send('Runtime.enable',{});
      await c.send('DOM.enable',{});
      log('♻️ 续填模式：复用现有发布页 ' + pubPage.url.slice(0,100));
    }catch(e){
      log('⚠️ 发布页复用失败(' + e.message + ')，改为从零新建');
      pubPage=null; c=null;
    }
  }

  if(!c){
    // 新建干净 tab（避免复用被残留进程卡死的 tab）
    let g=await getPage(/mms\.pinduoduo\.com/);
    if(g){
      try{
        c=await conn(g.webSocketDebuggerUrl);
        await Promise.race([c.send('Page.enable',{}), sleep(5000).then(()=>{throw new Error('复用页无响应')})]);
        await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});
      }catch(e){ g=null; }
    }
    if(!g){
      const ver=await get(`http://127.0.0.1:${PORT}/json/version`);
      const bc=await conn(ver.webSocketDebuggerUrl);
      const nt=await bc.send('Target.createTarget',{url:'about:blank'});
      const tid=nt.targetId; bc.ws.close();
      await sleep(1000);
      const tabs=await get(`http://127.0.0.1:${PORT}/json`);
      const ng=tabs.find(t=>t.id===tid)||tabs.find(t=>t.type==='page'&&/blank/.test(t.url||''));
      if(!ng){ log('❌ 新建 tab 失败'); process.exit(1); }
      c=await conn(ng.webSocketDebuggerUrl);
      await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});
    }
    log('已连接干净 tab，从零开始');

    // ===== Step 1: 选类目 =====
    log('[1/8] 选类目: ' + cfg.categoryPath);
    await c.send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
    await sleep(6000);
    await fillByType(c, 'input[placeholder="请输入关键词搜索分类"]', cfg.categoryKeyword);
    await sleep(2500);
    // 模糊匹配类目：精确 → 前两级前缀+最后级关键词 → 前两级前缀 → 最后级关键词
    const sel=await ev(c,`(()=>{
      const want=${JSON.stringify(cfg.categoryPath)};
      const parts = want.split(' > ');
      const prefix = parts.length >= 2 ? parts.slice(0,2).join(' > ') : want;
      const lastWord = parts[parts.length-1] || '';
      const cands = [...document.querySelectorAll('.choose-category,[class*="searchItem"]')];
      const norm = e => (e.textContent||'').trim();
      // 1. 精确匹配完整路径
      let el = cands.find(e=>norm(e)===want);
      // 2. 前两级前缀 + 最后级关键词包含
      if(!el) el = cands.find(e=>{const t=norm(e); return t.startsWith(prefix) && t.includes(lastWord);});
      // 3. 前两级前缀（取第一个，拼多多搜索结果按相关度排序）
      if(!el) el = cands.find(e=>norm(e).startsWith(prefix));
      // 4. 最后级关键词包含
      if(!el) el = cands.find(e=>norm(e).includes(lastWord));
      if(el){ el.scrollIntoView({block:'center'}); el.click(); return 'ok'; }
      return 'no category';
    })()`);
    log('  类目选择:', sel);
    if(sel!=='ok'){ log('❌ 类目未匹配，终止（类目路径与拼多多实际不一致，需人工确认）'); c.ws.close(); process.exit(1); }
    await sleep(2000);
    const confirm=await ev(c,`(()=>{const btn=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='确认发布该类商品');if(btn){btn.click();return 'ok';}return 'no confirm'})()`);
    log('  类目确认:', confirm);
    if(confirm!=='ok'){ log('❌ 类目确认按钮未找到，终止'); c.ws.close(); process.exit(1); }
    await sleep(6000);
    const href=await ev(c,'location.href');
    log('  发布页:', href);
    if(!href || !/goods_add\/index/.test(href)){ log('❌ 未跳转发布页，终止'); c.ws.close(); process.exit(1); }
  }

  // ===== 当前页面标题/URL =====
  const curUrl = await ev(c, 'location.href');
  log('当前页面:', curUrl ? curUrl.slice(0,100) : '(空)');

  // ===== Step 2: 上传主图 =====
  log('[2/8] 上传主图', cfg.images.length, '张');
  // 检测主图区是否已有图（file input 附近是否已有缩略图）
  const hasMainImg = await ev(c, `(()=>{const up=[...document.querySelectorAll('input[type="file"][accept*="image"]')];return up.length})()`);
  log('  图片 file input 数:', hasMainImg);
  const doc=await c.send('DOM.getDocument',{depth:3});
  const qimg=await c.send('DOM.querySelector',{nodeId:doc.root.nodeId, selector:'input[type="file"][accept*="image"]'});
  if(qimg && qimg.nodeId){
    await c.send('DOM.setFileInputFiles',{nodeId:qimg.nodeId, files:cfg.images.slice(0,10)});
    await sleep(8000);
    log('  上传完成');
  } else {
    log('  ⚠️ 未找到主图 file input');
  }

  // ===== Step 3: 填标题 =====
  log('[3/8] 填标题');
  const titleVal = await ev(c, `(()=>{const i=document.querySelector('input[placeholder*="商品标题组成"]');return i?i.value:undefined})()`);
  if(titleVal){ log('  标题已填，跳过:', titleVal.slice(0,20)); }
  else{
    await fillByType(c, 'input[placeholder*="商品标题组成"]', cfg.title);
    log('  已填标题:', cfg.title.slice(0,20));
  }

  // ===== Step 4: 填规格（幂等） =====
  log('[4/8] 填规格');
  for(let si=0; si<cfg.specs.length; si++){
    const spec=cfg.specs[si];
    const ph = si===0?'规格类型1':'规格类型2';
    const specTypeVal = await ev(c, `(()=>{const i=document.querySelector('input[placeholder="${ph}"]');return i?i.value:undefined})()`);
    if(specTypeVal){
      log(`  规格类型${si+1} 已填[${specTypeVal}]，跳过添加`);
    } else {
      // 添加规格类型
      await ev(c,`(()=>{const btn=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim().includes('添加规格类型'));if(btn){btn.scrollIntoView({block:'center'});btn.click();return 'ok';}return 'no'})()`);
      await sleep(2000);
      await ev(c,`(()=>{const inp=document.querySelector('input[placeholder="${ph}"]');if(inp){inp.scrollIntoView({block:'center'});inp.click();return 'ok'}return 'no'})()`);
      await sleep(2000);
      // 选规格类型（下拉面板）
      await ev(c,`(()=>{const panel=document.querySelector('[class*="dropdownPanel"],[class*="dropdown-panel"]');if(!panel)return 'no panel';const items=[...panel.querySelectorAll('*')].filter(e=>(e.textContent||'').trim()===${JSON.stringify(spec.type)}&&e.children.length===0);if(items.length){items[items.length-1].click();return 'ok';}return 'no ${spec.type}'})()`);
      await sleep(1500);
      log(`  已添加规格类型${si+1}: ${spec.type}`);
    }
    // 填规格值（幂等：只填空 input）
    let filled=0;
    for(const v of spec.values){
      const f=await ev(c,`(()=>{const inps=[...document.querySelectorAll('input[placeholder="请输入规格名称"]')].filter(i=>!i.value);const inp=inps.sort((a,b)=>b.getBoundingClientRect().y-a.getBoundingClientRect().y)[0];if(!inp)return 'no empty';inp.scrollIntoView({block:'center'});inp.click();inp.focus();return 'ok'})()`);
      if(f!=='ok'){ log(`  ⚠️ 规格值[${v}] 无空位`); continue; }
      await sleep(300);
      await c.send('Input.insertText',{text:v});
      await sleep(250);
      await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await sleep(600);
      filled++;
    }
    log(`  规格${si+1}[${spec.type}]: 填 ${filled}/${spec.values.length}`);
  }

  // ===== 构造 SKU 行（统一 1 维 / 2 维规格） =====
  const specsArr = cfg.specs || [];
  const skuRows = [];
  if(specsArr.length <= 1){
    // 1 维规格：每个规格值是独立 SKU 行，价格和预览图都按该值取
    const spec = specsArr[0] || {values: []};
    for(const v of spec.values){
      const price = cfg.priceBySpec2[v] || {pdd: 0, danmai: 0};
      const img = cfg.previewImages[v] || cfg.images[0];
      skuRows.push({price, img});
    }
  } else {
    // 2 维规格：笛卡尔积，价格按规格2值，预览图按规格1值
    const spec1 = specsArr[0].values, spec2 = specsArr[1].values;
    for(const v1 of spec1){
      for(const v2 of spec2){
        const price = cfg.priceBySpec2[v2] || {pdd: 0, danmai: 0};
        const img = cfg.previewImages[v1] || cfg.images[0];
        skuRows.push({price, img});
      }
    }
  }
  const totalSku = skuRows.length;
  log('  SKU 共', totalSku, '行（', specsArr.length, '维规格）');

  // ===== Step 5: 填价格库存（x 坐标精确匹配列） =====
  log('[5/8] 填价格库存');
  await ev(c,`window.scrollTo(0, document.body.scrollHeight)`);
  await sleep(2000);
  // 每行 4 个「请输入」：库存(x~605)/拼单价(x~709)/单买价(x~877)/规格编码(x~1131)
  let filledRows=0;
  for(let i=0; i<skuRows.length; i++){
    const price = skuRows[i].price;
    const rowVals=[String(cfg.stock), String(price.pdd), String(price.danmai)];
    const baseIdx = filledRows*4;
    for(let col=0; col<3; col++){
      const gidx = baseIdx + col;
      const f=await ev(c,`(()=>{const inps=[...document.querySelectorAll('input[placeholder="请输入"]')];const inp=inps[${gidx}];if(!inp)return 'no';inp.scrollIntoView({block:'center'});inp.click();inp.focus();return 'ok'})()`);
      if(f==='ok'){ await sleep(200); await c.send('Input.insertText',{text:rowVals[col]}); await sleep(150); }
      else log(`  ⚠️ 行${filledRows} col${col} 无输入框`);
    }
    filledRows++;
  }
  log('  已填', filledRows, '行 / 共', totalSku, '行');
  // 补填：首行库存常因「滚动到底→scrollIntoView回滚」焦点丢失而漏填，检查所有行补填空的库存/价格单元格
  for(let pass=0; pass<3; pass++){
    const emptyCells = await ev(c, `(()=>{
      const inps=[...document.querySelectorAll('input[placeholder="请输入"]')];
      const out=[];
      for(let i=0;i<inps.length;i++){
        if(i%4===3) continue; // 跳过规格编码列
        if(!inps[i].value) out.push(i);
      }
      return JSON.stringify(out);
    })()`);
    let empties=[];
    try{ empties=JSON.parse(emptyCells||'[]'); }catch(e){}
    if(!empties.length) break;
    for(const idx of empties){
      const row = Math.floor(idx/4);
      const col = idx%4;
      const pr = skuRows[row] ? skuRows[row].price : {pdd:0,danmai:0};
      const val = col===0 ? String(cfg.stock) : col===1 ? String(pr.pdd) : String(pr.danmai);
      if(!val) continue;
      await ev(c,`(()=>{const inp=[...document.querySelectorAll('input[placeholder="请输入"]')][${idx}];if(!inp)return 'no';inp.scrollIntoView({block:'center'});inp.click();inp.focus();return 'ok'})()`);
      await sleep(400);
      await c.send('Input.insertText',{text:val});
      await sleep(300);
    }
    log('  补填', empties.length, '个空单元格');
  }

  // ===== Step 6: 上传规格预览图（逐个，每次找第一个未上传行） =====
  log('[6/8] 上传规格预览图');
  await ev(c,`window.scrollTo(0, document.body.scrollHeight)`);
  await sleep(1500);
  let k=0;
  for(const row of skuRows){
    if(k>=totalSku) break;
    // 找第一个含 file input 的 goods-sku-img（即当前未上传的行）
    const found=await ev(c,`(()=>{const imgs=[...document.querySelectorAll('.goods-sku-img')];const t=imgs.find(e=>e.querySelector('input[type="file"]'));if(!t)return 'no empty';t.scrollIntoView({block:'center'});return 'ok'})()`);
    if(found!=='ok'){ log('  ⚠️ 第'+(k+1)+'行无未上传槽位（可能已传满）'); break; }
    await sleep(400);
    const doc3=await c.send('DOM.getDocument',{depth:3});
    const qfi=await c.send('DOM.querySelector',{nodeId:doc3.root.nodeId, selector:'.goods-sku-img input[type="file"]'});
    if(!qfi || !qfi.nodeId){ log('  ⚠️ 定位 file input 失败'); break; }
    await c.send('DOM.setFileInputFiles',{nodeId:qfi.nodeId, files:[row.img]});
    await sleep(800);
    k++;
  }
  log('  预览图已传', k, '张 / 共', totalSku, '张');

  // ===== Step 7: 参考价 =====
  log('[7/8] 填参考价', cfg.refPrice);
  const refVal = await ev(c, `(()=>{const i=document.querySelector('input[placeholder*="应大于"]');return i?i.value:undefined})()`);
  if(refVal){ log('  参考价已填，跳过:', refVal); }
  else{
    const r=await fillByType(c, 'input[placeholder*="应大于"]', cfg.refPrice);
    log('  参考价填写:', r);
  }

  // ===== Step 8: 提交 =====
  log('[8/8] 提交前检查');
  const err=await ev(c,`(()=>{const m=document.body.innerText.match(/错误（(\d+)）/);return m?m[0]:'错误（0）'})()`);
  log('  错误计数:', err);
  const submit=await ev(c,`(()=>{const btn=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim().includes('提交并上架'));if(btn){btn.scrollIntoView({block:'center'});btn.click();return 'ok';}return 'no submit btn'})()`);
  log('  提交按钮:', submit);
  if(submit==='ok'){
    let finalUrl='';
    for(let i=0;i<40;i++){ await sleep(1000); finalUrl=await ev(c,'location.href'); if(/\/success|goods_add\/success|goods\/list/.test(finalUrl)) break; }
    log('  提交结果 URL:', finalUrl);
    if(/\/success/.test(finalUrl)){ const m=finalUrl.match(/goods_id=(\d+)/); log('✅ 上架成功，商品ID:', m?m[1]:'未知'); log('RESULT_SUCCESS goods_id='+(m?m[1]:'')); }
    else log('⚠️ 提交后未跳转 success，请检查页面（可能已成功跳商品列表，或需人工确认）');
  } else {
    log('⚠️ 未找到提交按钮，请人工检查页面');
  }

  // 保留 tab 供人工查看，不关闭
  c.ws.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1)});
