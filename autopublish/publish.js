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

  // ===== 连接：优先复用已存在的发布页（续填），否则新建干净 tab =====
  let c = null;
  let pubPage = await getPage(/goods_add/);
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
    // 优先「最近使用的分类」（choose-category），其次搜索结果
    const sel=await ev(c,`(()=>{
      const want=${JSON.stringify(cfg.categoryPath)};
      // 1. 最近使用的分类
      let el=[...document.querySelectorAll('.choose-category')].find(e=>(e.textContent||'').trim().includes(want));
      // 2. 搜索项
      if(!el) el=[...document.querySelectorAll('[class*="searchItem"]')].find(e=>(e.textContent||'').trim()===want);
      // 3. 兜底：全页文本精确匹配
      if(!el) el=[...document.querySelectorAll('div,li,span,a')].find(e=>(e.textContent||'').trim()===want);
      if(el){ el.scrollIntoView({block:'center'}); el.click(); return 'ok'; }
      return 'no category';
    })()`);
    log('  类目选择:', sel);
    await sleep(2000);
    const confirm=await ev(c,`(()=>{const btn=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='确认发布该类商品');if(btn){btn.click();return 'ok';}return 'no confirm'})()`);
    log('  类目确认:', confirm);
    await sleep(6000);
    const href=await ev(c,'location.href');
    log('  发布页:', href);
    if(!href || !/goods_add/.test(href)){ log('⚠️ 类目选择未成功跳转发布页'); }
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

  // ===== Step 5: 填价格库存（x 坐标精确匹配列） =====
  log('[5/8] 填价格库存');
  await ev(c,`window.scrollTo(0, document.body.scrollHeight)`);
  await sleep(2000);
  const spec1=cfg.specs[0].values, spec2=cfg.specs[1].values;
  const totalRows=spec1.length*spec2.length;
  // 每行 4 个「请输入」：库存(x~605)/拼单价(x~709)/单买价(x~877)/规格编码(x~1131)
  let filledRows=0;
  for(const v1 of spec1){
    for(const v2 of spec2){
      const price=cfg.priceBySpec2[v2] || {pdd:0, danmai:0};
      const rowVals=[String(cfg.stock), String(price.pdd), String(price.danmai)];
      // 定位当前行的 3 个输入（按 y 坐标分组，取未填的行的前3个「请输入」）
      const baseIdx = filledRows*4;
      for(let col=0; col<3; col++){
        const gidx = baseIdx + col;
        const f=await ev(c,`(()=>{const inps=[...document.querySelectorAll('input[placeholder="请输入"]')];const inp=inps[${gidx}];if(!inp)return 'no';inp.scrollIntoView({block:'center'});inp.click();inp.focus();return 'ok'})()`);
        if(f==='ok'){ await sleep(200); await c.send('Input.insertText',{text:rowVals[col]}); await sleep(150); }
        else log(`  ⚠️ 行${filledRows} col${col} 无输入框`);
      }
      filledRows++;
    }
  }
  log('  已填', filledRows, '行 / 共', totalRows, '行');

  // ===== Step 6: 上传规格预览图（逐个，每次找第一个未上传行） =====
  log('[6/8] 上传规格预览图');
  await ev(c,`window.scrollTo(0, document.body.scrollHeight)`);
  await sleep(1500);
  const totalSku = spec1.length * spec2.length;
  let k=0;
  for(const v1 of spec1){
    const img=cfg.previewImages[v1]||cfg.images[0];
    for(const v2 of spec2){
      if(k>=totalSku) break;
      // 找第一个含 file input 的 goods-sku-img（即当前未上传的行）
      const found=await ev(c,`(()=>{const imgs=[...document.querySelectorAll('.goods-sku-img')];const t=imgs.find(e=>e.querySelector('input[type="file"]'));if(!t)return 'no empty';t.scrollIntoView({block:'center'});return 'ok'})()`);
      if(found!=='ok'){ log('  ⚠️ 第'+(k+1)+'行无未上传槽位（可能已传满）'); break; }
      await sleep(400);
      const doc3=await c.send('DOM.getDocument',{depth:3});
      const qfi=await c.send('DOM.querySelector',{nodeId:doc3.root.nodeId, selector:'.goods-sku-img input[type="file"]'});
      if(!qfi || !qfi.nodeId){ log('  ⚠️ 定位 file input 失败'); break; }
      await c.send('DOM.setFileInputFiles',{nodeId:qfi.nodeId, files:[img]});
      await sleep(800);
      k++;
    }
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
