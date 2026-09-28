// 拼多多商品上架全流程自动化（嘉裕店 CDP 9232）
// 用法：node publish.js [config.json]
// 依赖：Node 24+（全局 WebSocket）、config.json（见 config.example.json）
const http = require('http');
const fs = require('fs');

const PORT = process.argv[3] || process.env.PDD_PORT || '9232';
const CONFIG = process.argv[2] || 'config.json';
const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})}).on('error',rej)})}

async function conn(wsUrl){
  const ws=new WebSocket(wsUrl);let id=0;const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  return {ws,send};
}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

async function getPage(pattern){
  const tabs=await get(`http://127.0.0.1:${PORT}/json`);
  return tabs.find(t=>t.type==='page'&&pattern.test(t.url))||tabs.find(t=>t.type==='page');
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
  const g=await getPage(/mms\.pinduoduo\.com/);
  const c=await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{});
  await c.send('Runtime.enable',{});
  await c.send('DOM.enable',{});
  console.log('已连接拼多多后台');

  // ===== Step 1: 选类目（搜索框） =====
  console.log('[1/8] 选类目:', cfg.categoryPath);
  await c.send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
  await sleep(5000);
  await fillByType(c, 'input[placeholder="请输入关键词搜索分类"]', cfg.categoryKeyword);
  await sleep(2000);
  const sel=await ev(c,`(()=>{const el=[...document.querySelectorAll('div,li,span,a')].find(e=>e.textContent.trim()===${JSON.stringify(cfg.categoryPath)});if(el){el.scrollIntoView({block:'center'});el.click();return 'ok';}return 'no category '+${JSON.stringify(cfg.categoryPath)}})()`);
  if(sel!=='ok'){console.log('⚠️ 类目未找到，需人工选:', cfg.categoryPath);}
  await sleep(2000);
  const confirm=await ev(c,`(()=>{const btn=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='确认发布该类商品');if(btn){btn.click();return 'ok';}return 'no confirm'})()`);
  console.log('  类目确认:', confirm);
  await sleep(6000);
  console.log('  发布页:', await ev(c,'location.href'));

  // ===== Step 2: 上传主图（10张） =====
  console.log('[2/8] 上传主图', cfg.images.length, '张');
  const doc=await c.send('DOM.getDocument',{depth:2});
  const qimg=await c.send('DOM.querySelector',{nodeId:doc.root.nodeId, selector:'input[type="file"][accept*="image"]'});
  await c.send('DOM.setFileInputFiles',{nodeId:qimg.nodeId, files:cfg.images.slice(0,10)});
  await sleep(8000);
  console.log('  上传完成');

  // ===== Step 3: 填标题 =====
  console.log('[3/8] 填标题:', cfg.title);
  await fillByType(c, 'input[placeholder*="商品标题组成"]', cfg.title);
  await sleep(500);

  // ===== Step 4: 填规格（二维） =====
  console.log('[4/8] 填规格');
  for(let si=0; si<cfg.specs.length; si++){
    const spec=cfg.specs[si];
    // 添加规格类型
    await ev(c,`(()=>{const btn=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes('添加规格类型'));if(btn){btn.scrollIntoView({block:'center'});btn.click();return 'ok';}return 'no'})()`);
    await sleep(2000);
    // 选规格类型
    const ph=si===0?'规格类型1':'规格类型2';
    await ev(c,`(()=>{const inp=document.querySelector('input[placeholder="${ph}"]');inp.scrollIntoView({block:'center'});inp.click();return 'ok'})()`);
    await sleep(2000);
    await ev(c,`(()=>{const panel=document.querySelector('.ST_dropdownPanel_5-188-0');const items=[...panel.querySelectorAll('*')].filter(e=>e.textContent.trim()===${JSON.stringify(spec.type)}&&e.children.length===0);if(items.length){items[items.length-1].click();return 'ok';}return 'no ${spec.type}'})()`);
    await sleep(1500);
    // 填规格值
    for(const v of spec.values){
      await ev(c,`(()=>{const inps=[...document.querySelectorAll('input[placeholder="请输入规格名称"]')].filter(i=>i.value==='');const inp=inps.sort((a,b)=>b.getBoundingClientRect().y-a.getBoundingClientRect().y)[0];inp.scrollIntoView({block:'center'});inp.click();inp.focus();return 'ok'})()`);
      await sleep(300);
      await c.send('Input.insertText',{text:v});
      await sleep(250);
      await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await sleep(600);
    }
    console.log(`  规格${si+1}[${spec.type}]:`, spec.values.join('/'));
  }

  // ===== Step 5: 填价格库存表（笛卡尔积） =====
  console.log('[5/8] 填价格库存');
  // 等表格完全渲染（虚拟滚动，规格填完需延迟）
  await ev(c,`window.scrollTo(0, document.body.scrollHeight)`);
  await sleep(2500);
  await ev(c,`(()=>{const t=document.querySelector('table,[class*="table"]');if(t)t.scrollIntoView({block:'center'});return 'ok'})()`);
  await sleep(1500);
  const spec1=cfg.specs[0].values, spec2=cfg.specs[1].values;
  const totalRows=spec1.length*spec2.length;
  let idx=0;
  for(const v1 of spec1){
    for(const v2 of spec2){
      const price=cfg.priceBySpec2[v2];
      const rowVals=[cfg.stock, price.pdd, price.danmai];
      for(let col=0;col<3;col++){
        const gidx=idx*4+col;
        const f=await ev(c,`(()=>{const inps=[...document.querySelectorAll('input[placeholder="请输入"]')];const inp=inps[${gidx}];if(!inp)return 'no';inp.scrollIntoView({block:'center'});inp.click();inp.focus();return 'ok'})()`);
        if(f==='ok'){await sleep(200);await c.send('Input.insertText',{text:String(rowVals[col])});await sleep(150);}
      }
      idx++;
    }
  }
  console.log('  已填', idx, '行');

  // ===== Step 6: 上传规格预览图 =====
  console.log('[6/8] 上传规格预览图');
  await ev(c,`window.scrollTo(0, document.body.scrollHeight)`);
  await sleep(1500);
  const qall=await c.send('DOM.querySelectorAll',{nodeId:doc.root.nodeId, selector:'input[type="file"][accept*="image"]'});
  const previewIds=qall.nodeIds.slice(2); // 跳过轮播图+辅助图
  let k=0;
  for(const v1 of spec1){
    const img=cfg.previewImages[v1]||cfg.images[0];
    for(const v2 of spec2){
      if(k>=previewIds.length)break;
      await c.send('DOM.setFileInputFiles',{nodeId:previewIds[k], files:[img]});
      await sleep(500);
      k++;
    }
  }
  console.log('  预览图已传', k, '张');

  // ===== Step 7: 参考价 =====
  console.log('[7/8] 填参考价', cfg.refPrice);
  await fillByType(c, 'input[placeholder="应大于商品最大单买价"]', cfg.refPrice);
  await sleep(500);

  // ===== Step 8: 提交 =====
  console.log('[8/8] 提交前检查错误');
  const err=await ev(c,`(document.body.innerText.match(/错误（\\d+）/)?.[0]||'错误（0）')`);
  console.log('  当前:', err);
  await ev(c,`(()=>{const btn=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes('提交并上架'));if(btn){btn.scrollIntoView({block:'center'});btn.click();return 'ok';}return 'no'})()`);
  // 坑#6：提交后跳转可能 >7 秒，轮询 location.href 直到 /success 或超时
  let finalUrl='';
  for(let i=0;i<30;i++){await sleep(1000);finalUrl=await ev(c,'location.href');if(finalUrl.includes('/success')||finalUrl.includes('goods_add/success'))break;}
  console.log('  提交结果 URL:', finalUrl);
  const m=finalUrl.match(/goods_id=(\d+)/);
  if(finalUrl.includes('/success')){console.log('✅ 上架成功，商品ID:', m?m[1]:'未知');console.log('RESULT_SUCCESS goods_id='+(m?m[1]:''));}
  else console.log('⚠️ 未跳转 success，请检查页面');

  c.ws.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1)});
