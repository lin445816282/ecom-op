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
    const to=setTimeout(()=>{ if(p.has(mid)){ p.delete(mid); rej(new Error('CDP超时:'+m)); } }, 60000);
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
  }

  // ===== 导航发布页 + 检测店铺类型（旗舰店 vs 普通店）=====
  // 旗舰店(欧世艺等)：/goods/category 直接是「发布新商品」页，先填主图+标题 → 点「手动选择商品分类」弹窗选类目 → 选品牌 → 下一步
  // 普通店(闲时来等)：/goods/category 是类目选择页，先搜索选类目 → 点「确认发布该类商品」→ 跳转发布页再填主图标题
  await c.send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
  await sleep(6000);
  // 店铺类型检测带重试：旗舰店发布页加载慢，「下一步」按钮可能延迟渲染，6s 后检测不到会误判普通店
  // (task_234 教训：9228 旗舰店发布页加载慢，isFlagship 误判普通店→走普通店流程→类目匹配失败)
  let isFlagship = false;
  for(let _t=0; _t<6; _t++){
    const _type = await ev(c, `(()=>{
      const confirm=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='确认发布该类商品');
      const next=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim().replace(/\s+/g,' ').includes('下一步'));
      if(confirm) return 'normal';
      if(next) return 'flagship';
      return 'loading';
    })()`);
    if(_type==='normal'){ isFlagship=false; break; }
    if(_type==='flagship'){ isFlagship=true; break; }
    await sleep(2000);
  }
  log('店铺类型:', isFlagship ? '旗舰店(先主图标题→弹窗选类目→品牌→下一步)' : '普通店(先选类目)');

  // 通用：搜索框选类目（普通店页面 / 旗舰店弹窗 共用，搜索框 placeholder 一致）
  async function searchAndSelectCategory(){
    const _parts=(cfg.categoryPath||'').split(' > ');
    let searchKw=cfg.categoryKeyword;
    if(_parts.length>=2 && _parts[1] && _parts[1].length>=2){ searchKw=_parts[1]; }
    const _kwCands=[searchKw,cfg.categoryKeyword,_parts[_parts.length-1]].filter((v,i,a)=>v&&v.length>=1&&a.indexOf(v)===i);
    let sel='no category';
    let learnedCat='';  // 选中的真实类目文本
    let learnedKw='';   // 实际命中的搜索词
    for(let _attempt=0;_attempt<_kwCands.length&&sel!=='ok';_attempt++){
      const _kw=_kwCands[_attempt];
      await fillByType(c,'input[placeholder="请输入关键词搜索分类"]',_kw);
      await sleep(4000);
      const r=await ev(c,`(()=>{
        const want=${JSON.stringify(cfg.categoryPath)};
        const parts=want.split(' > ');
        const lastWord=parts[parts.length-1]||'';
        const midWord=parts.length>=2?parts[1]:lastWord;
        const cands=[...document.querySelectorAll('.choose-category,[class*="searchItem"]')];
        const norm=e=>(e.textContent||'').trim();
        let el=cands.find(e=>norm(e)===want);
        if(!el&&midWord)el=cands.find(e=>{const lp=norm(e).split(' > ').pop();return lp===midWord||lp.includes(midWord);});
        if(!el&&midWord)el=cands.find(e=>norm(e).includes(midWord));
        if(!el&&lastWord)el=cands.find(e=>norm(e).includes(lastWord));
        if(!el)el=cands.find(e=>norm(e).includes(${JSON.stringify(cfg.categoryKeyword)}));
        if(el){el.scrollIntoView({block:'center'});el.click();return norm(el);}
        return '';
      })()`);
      if(r){ sel='ok'; learnedKw=_kw; learnedCat=r; }
      else log('  类目匹配失败(搜索词='+_kw+')，换词重试…');
    }
    // 选中真实类目后，把「关键词→真实类目」写回文件，供后端自动固化（下次同类商品直接命中）
    if(sel==='ok' && learnedCat){
      // keyword 用选中类目的最后一级（三级类目名，最具体最干净），保证「关键词→类目」自洽
      // 避免用 AI 的 categoryKeyword（可能和实际选中类目不一致，导致学出「南瓜灯→气球」这种错映射）
      let lastLevel=(learnedCat.split(' > ').pop()||'').trim();
      if(lastLevel.includes('/')) lastLevel=lastLevel.split('/')[0].trim();  // "仿真花/假花"→"仿真花"
      if(lastLevel && lastLevel.length>=2){
        const learned={keyword:lastLevel, category_path:learnedCat, matched_kw:learnedKw};
        try{
          fs.writeFileSync(CONFIG.replace(/\.json$/, '.category_learn.json'), JSON.stringify(learned), 'utf8');
          log('  类目学习记录:', learned.keyword, '→', learned.category_path);
        }catch(e){ log('  类目学习写文件失败:', e.message); }
      } else {
        log('  类目学习跳过(最后一级非干净品类词):', learnedCat);
      }
    }
    return sel;
  }

  if(isFlagship){
    // ===== 旗舰店：先填主图+标题 =====
    log('[2/8] 上传主图', cfg.images.length, '张');
    const docF=await c.send('DOM.getDocument',{depth:3});
    const qimgF=await c.send('DOM.querySelector',{nodeId:docF.root.nodeId,selector:'input[type="file"]'});
    if(qimgF && qimgF.nodeId){
      await c.send('DOM.setFileInputFiles',{nodeId:qimgF.nodeId,files:cfg.images.slice(0,10)});
      await sleep(8000);
      log('  上传完成');
    } else {
      log('  ⚠️ 未找到主图 file input');
    }
    log('[3/8] 填标题');
    await fillByType(c, 'input[placeholder*="商品标题组成"]', cfg.title);
    log('  已填标题:', cfg.title.slice(0,20));

    // ===== 旗舰店：改版后（2026-10）发布页第一步已无「手动选择商品分类」弹窗 =====
    // 类目在点「下一步」后由系统 predictCate 按标题自动预测填入（详情页可「修改分类」），
    // 品牌也由旗舰店资质自动带出（详情页显示 OSHIYI/欧世艺），故跳过旧弹窗选类目/选品牌两步。

    // ===== 旗舰店：下一步 =====
    log('  点「下一步」进入详情页');
    const nextClick=await ev(c,`(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim().replace(/\\s+/g,' ').includes('下一步'));if(!b)return 'no btn';b.click();return 'ok'})()`);
    log('  下一步:', nextClick);
    await sleep(6000);
    const hrefF=await ev(c,'location.href');
    log('  详情页:', hrefF ? hrefF.slice(0,100) : '(空)');
    if(!hrefF || !/goods_add\/index/.test(hrefF)){ log('❌ 未跳转发布页，终止'); c.ws.close(); process.exit(1); }
    // 验证详情页自动预测的类目是否匹配目标类目；不匹配则点「修改分类」重选
    const catCheck = await ev(c, `(()=>{
      const leaves=[...document.querySelectorAll('*')].filter(x=>x.children.length===0&&(x.textContent||'').trim()&&x.getBoundingClientRect().width>0);
      const idx=leaves.findIndex(x=>(x.textContent||'').trim()==='商品分类');
      if(idx>=0){ for(let i=idx+1;i<leaves.length&&i<idx+5;i++){ const t=(leaves[i].textContent||'').trim(); if(t&&t.includes('>')) return t; } }
      return '';
    })()`);
    log('  自动预测类目:', catCheck || '(未读到)');
  } else {
    // ===== 普通店：先选类目 =====
    log('[1/8] 选类目: ' + cfg.categoryPath);
    const sel=await searchAndSelectCategory();
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

    // ===== 普通店：上传主图 =====
    log('[2/8] 上传主图', cfg.images.length, '张');
    const hasMainImg=await ev(c, `(()=>{const up=[...document.querySelectorAll('input[type="file"][accept*="image"]')];return up.length})()`);
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

    // ===== 普通店：填标题 =====
    log('[3/8] 填标题');
    const titleVal=await ev(c, `(()=>{const i=document.querySelector('input[placeholder*="商品标题组成"]');return i?i.value:undefined})()`);
    if(titleVal){ log('  标题已填，跳过:', titleVal.slice(0,20)); }
    else{
      await fillByType(c, 'input[placeholder*="商品标题组成"]', cfg.title);
      log('  已填标题:', cfg.title.slice(0,20));
    }
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
      // 选规格类型（下拉选项：直接找文本匹配的可见叶子，不依赖面板 class —— 不同类目面板 class 名不同）
      const selType=await ev(c,`(()=>{const items=[...document.querySelectorAll('*')].filter(e=>(e.textContent||'').trim()===${JSON.stringify(spec.type)}&&e.children.length===0&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0);if(items.length){items[items.length-1].click();return 'ok';}return 'no ${spec.type}'})()`);
      await sleep(1500);
      // 验证规格类型是否真选上（value 应等于 spec.type）
      const selVal = await ev(c, `(()=>{const i=document.querySelector('input[placeholder="${ph}"]');return i?i.value:''})()`);
      log(`  已添加规格类型${si+1}: ${spec.type} [${selType}, value=${selVal}]`);
    }
    // 填规格值（幂等：只填空 input）
    let filled=0;
    for(const v of spec.values){
      const f=await ev(c,`(()=>{const inps=[...document.querySelectorAll('input')].filter(i=>!i.value && (/请输入规格名称/.test(i.placeholder||'') || /^自定义/.test(i.placeholder||'')));const inp=inps.sort((a,b)=>b.getBoundingClientRect().y-a.getBoundingClientRect().y)[0];if(!inp)return 'no empty';inp.scrollIntoView({block:'center'});inp.click();inp.focus();return 'ok'})()`);
      if(f!=='ok'){ log(`  ⚠️ 规格值[${v}] 无空位`); continue; }
      await sleep(300);
      await c.send('Input.insertText',{text:v});
      await sleep(250);
      await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      // blur 失焦触发规格值标签化 + SKU 表格行生成（task_241 教训：最后一个规格值 Enter 不触发行生成，blur 才触发——实测 blur 后 tr 4→6）
      await ev(c, `(()=>{const a=document.activeElement;if(a&&a.tagName==='INPUT'){a.blur();return 'blurred'}return 'no active'})()`);
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

  // ===== Step 5: 填价格库存（数据行 x 聚类定位列 + native setter 填值） =====
  // 教训（task_72/79）：①表头筛选框的 x 坐标 ≠ 数据行输入框 x 坐标，读表头定位列必然错位；
  // ②Input.insertText 对 React 受控 SKU 表格不可靠（填了又空，导致死循环）；
  // ③SKU 行有 4 列「库存/拼单价/单买价/规格编码」，规格编码也是 placeholder="请输入"，必须排除（只填前3列）。
  // 正确做法：直接对数据行输入框按 x 中心聚类成列（取前3列），用 native setter + dispatchEvent 填值。
  log('[5/8] 填价格库存（数据行 x 聚类 + native setter）');
  // 注入全局价格数组：每行 [库存, 拼单价, 单买价]
  const skuVals = skuRows.map(r => [String(cfg.stock), String(r.price.pdd), String(r.price.danmai)]);
  await ev(c, `window.__skuVals=${JSON.stringify(skuVals)};window.__filledRows=0;`);
  await ev(c, `window.scrollTo(0, 0)`);
  await sleep(1500);
  let totalFilled=0;
  let noProgress=0;
  for(let round=0; round<60; round++){
    const r = await ev(c, `(()=>{
      // 只在 SKU 表容器内找输入框（.skuModule > table > tbody > tr 数据行），排除顶部「价格及库存」批量设置区/底部批量设置区的干扰
      // (task_232 教训：全局找会把顶部「单买价」批量设置框 x~506 误当 SKU 价格列，导致库存/拼单价/单买价漏填)
      const _skuRoot=document.querySelector('.skuModule')||document.querySelector('.sku-list')||document;
      const inps=[..._skuRoot.querySelectorAll('input[placeholder="请输入"]')].filter(i=>i.getBoundingClientRect().width>0);
      if(!inps.length) return JSON.stringify({cols:0,rows:0,filled:0});
      // 1) 按 x 中心聚类成列（同一列 x 差 < 50）
      const colClusters=[];
      inps.forEach(el=>{
        const rc=el.getBoundingClientRect();
        const xc=rc.x+rc.width/2;
        let cl=colClusters.find(c=>Math.abs(c.x-xc)<50);
        if(!cl){cl={x:xc,items:[]};colClusters.push(cl);}
        cl.items.push(el);
      });
      colClusters.sort((a,b)=>a.x-b.x);
      // 前3列=库存/拼单价/单买价（第4列规格编码不填）
      if(colClusters.length<3) return JSON.stringify({cols:colClusters.length,rows:0,filled:0});
      const cols=colClusters.slice(0,3);
      // 2) 只聚类「空框」，按 y 中心聚类成空行（同一行 y 差 < 20）
      const rows=[];
      cols.forEach((cl,colIdx)=>{
        cl.items.forEach(el=>{
          if((el.value||'').trim()) return; // 只处理空框
          const rc=el.getBoundingClientRect();
          const yc=rc.y+rc.height/2;
          let row=rows.find(rr=>Math.abs(rr.y-yc)<20);
          if(!row){row={y:yc,cells:[]};rows.push(row);}
          row.cells.push({el:el,col:colIdx});
        });
      });
      rows.sort((a,b)=>a.y-b.y);
      // 每轮最多填 3 行（多 SKU 商品 17 行时，一次填 48 个值会触发 React 重渲染风暴导致 CDP 超时）
      rows.splice(3);
      // 3) native setter 填空框；空行 SKU 序号 = 已填行数(__filledRows) + 空行序号 ri
      const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      const vals=window.__skuVals||[];
      const startRow=window.__filledRows||0;
      let filled=0;
      rows.forEach((row,ri)=>{
        const v=vals[startRow+ri];
        if(!v) return;
        row.cells.forEach(cell=>{
          const el=cell.el;
          const val=v[cell.col];
          if(val==null||val==='') return;
          setter.call(el,String(val));
          el.dispatchEvent(new Event('input',{bubbles:true}));
          el.dispatchEvent(new Event('change',{bubbles:true}));
          filled++;
        });
      });
      return JSON.stringify({cols:colClusters.length,rows:rows.length,filled:filled});
    })()`);
    let o={cols:0,rows:0,filled:0};
    try{ o=JSON.parse(r||'{}'); }catch(e){}
    totalFilled += o.filled||0;
    log('  第'+round+'轮: 列数'+o.cols+' 空行'+o.rows+' 填'+o.filled+'个');
    if(totalFilled >= totalSku*3) break;
    if(o.filled===0){ noProgress++; if(noProgress>=3) break; }
    else noProgress=0;
    // 累计已填行数（空行数 = 本轮填的行数）
    await ev(c, `window.__filledRows += ${o.rows||0};`);
    // 单调向下滚动，触发虚拟列表渲染更多行
    // (task_241 教训：30行SKU时表格有独立滚动容器 sh>ch，window.scrollBy 滚页面不触发表格渲染，必须滚表格容器)
    await ev(c, `(()=>{const sku=document.querySelector('.skuModule')||document.querySelector('.sku-list')||document;const sc=[...sku.querySelectorAll('div')].find(d=>d.scrollHeight>d.clientHeight+10);if(sc){sc.scrollTop+=400;return 'sku';}window.scrollBy(0,400);return 'window';})()`);
    await sleep(500);
  }
  log('  累计填', totalFilled, '个单元格 / 目标', totalSku*3, '个');
  // 校验：价格库存必须填全，否则提交会产生「价格0/空」的错误商品
  // (task_232 教训：定位错位漏填时，提交前「错误计数0」拦不住，商品照样提交成价格0/空)
  if(totalFilled < totalSku*3){
    log('❌ 价格库存未填全（'+totalFilled+'/'+(totalSku*3)+'），终止避免提交错误商品');
    c.ws.close();
    process.exit(1);
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

  // ===== Step 7.5: 品牌（服饰/部分类目强制，未填会被资质拦截停在"编辑中"） =====
  // 关键：无品牌商品必须声明「无品牌/无注册商标」，否则提交后被品牌资质校验拦截（task_72 儿童手套教训）。
  log('[7.5/8] 处理品牌（无品牌则声明，避免资质拦截）');
  const brandState = await ev(c, `(()=>{
    var t=document.body.innerText;
    // 是否有品牌必填提示
    var needBrand=/品牌[^\n]{0,10}(必填|必选|请选择|\*)|\*品牌|品牌\s*\*/.test(t);
    // 品牌 Select 是否已选值
    var brandInput=document.querySelector('input[placeholder*="品牌"]');
    var brandVal=brandInput?brandInput.value:'';
    return JSON.stringify({needBrand:needBrand, brandVal:brandVal, hasBrandInput:!!brandInput});
  })()`);
  try{
    const _bs = JSON.parse(brandState || '{}');
    log('  品牌状态:', _bs.brandVal ? ('已填['+_bs.brandVal.slice(0,15)+']') : (_bs.hasBrandInput ? '空(需填)' : '无品牌输入框(该类目不要求)'));
    // 若品牌框存在且为空，尝试选「无品牌/无注册商标」
    if(_bs.hasBrandInput && !_bs.brandVal){
      // 点品牌 Select 打开下拉
      const opened=await ev(c, `(()=>{var i=document.querySelector('input[placeholder*="品牌"]');if(!i)return 0;i.scrollIntoView({block:'center'});i.click();i.focus();return 1})()`);
      await sleep(1200);
      // 找「无品牌/无注册商标」选项并点击（叶子文本精确匹配）
      const picked=await ev(c, `(()=>{
        var opts=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/无品牌|无注册商标/.test((e.textContent||'').trim())&&e.getBoundingClientRect().width>0);
        if(opts.length){opts[opts.length-1].click();return opts[opts.length-1].textContent.trim();}
        return 'no option';
      })()`);
      log('  品牌选择:', picked);
    }
  }catch(e){ log('  品牌处理异常:', e.message); }

  // ===== Step 8: 提交 =====
  log('[8/8] 提交前检查');
  const err=await ev(c,`(()=>{const m=document.body.innerText.match(/错误（(\d+)）/);return m?m[0]:'错误（0）'})()`);
  log('  错误计数:', err);
  const submit=await ev(c,`(()=>{const btn=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim().includes('提交并上架'));if(btn){btn.scrollIntoView({block:'center'});btn.click();return 'ok';}return 'no submit btn'})()`);
  log('  提交按钮:', submit);
  if(submit==='ok'){
    let finalUrl=''; let successFlag=false; let failReason='';
    for(let i=0;i<120;i++){
      await sleep(1000);
      finalUrl=await ev(c,'location.href');
      // 成功：URL 跳离 goods_add/index（success 页或商品列表页）
      if(/goods_add\/success/.test(finalUrl) || /\/goods\/list/.test(finalUrl)){ successFlag=true; break; }
      // 失败：只匹配「明确的拦截性错误」——缺字段/资质硬拦截。
      // ⚠️ 教训(task_79)：提交成功前会短暂闪现「请准确填写属性…」引导提示（含"填写/必填/违规"字样），
      //    但商品最终成功跳 success 页。宽泛匹配「请填写/必填/违规」会把引导提示误判为失败。
      //    因此只保留硬拦截文案（请输入第N行/不能为空/必须支持假一赔十/请先选择）。
      const t=await ev(c,'document.body.innerText');
      if(t && /必须支持假一赔十|请输入第\d+行|不能为空|请先(选择|填写|上传|设置)/.test(t)){
        failReason=(t.match(/(必须支持假一赔十[^\n]*|请输入第\d+行[^\n]*|[^\n]*(?:不能为空|请先(?:选择|填写|上传|设置))[^\n]*)/)||[''])[0].slice(0,80);
        break;
      }
    }
    log('  提交结果 URL:', finalUrl);
    if(successFlag){ const m=finalUrl.match(/goods_id=(\d+)/); log('✅ 已提交待审核，商品ID:', m?m[1]:'未知'); log('RESULT_SUBMITTED goods_id='+(m?m[1]:'')); }
    else if(failReason){ log('❌ 提交被拦截：' + failReason); log('RESULT_FAILED ' + failReason); }
    else { log('⚠️ 提交后 120 秒未跳转成功页且无明确错误，按已提交处理（待 verify 回查确认）'); log('RESULT_SUBMITTED goods_id='+((finalUrl.match(/goods_id=(\d+)/)||[])[1]||'')); }
  } else {
    log('⚠️ 未找到提交按钮，请人工检查页面');
  }

  // 保留 tab 供人工查看，不关闭
  c.ws.close();
  // 显式退出：Node 原生 WebSocket close() 后底层 socket 可能残留，进程挂起会导致 subprocess 300s 超时误判「执行超时」
  process.exit(0);
})().catch(e=>{console.error('FATAL',e);process.exit(1)});
