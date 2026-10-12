// 精确抓取 1688 商品每个 SKU 的真实价格：点选尺寸 → 读价格元素
const http = require('http');
function get(u){return new Promise((res,rej)=>{const q=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});q.on('error',rej);q.setTimeout(5000,()=>{q.destroy();rej(new Error('timeout'))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m))}},30000);p.set(mid,{res:(v)=>{clearTimeout(to);res(v)},rej:(e)=>{clearTimeout(to);rej(e)}});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});return{ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r&&r.result&&r.result.value!==undefined)return r.result.value;if(r&&r.exceptionDetails)return 'EXC:'+JSON.stringify(r.exceptionDetails).slice(0,150);return undefined;}
const PORT=process.argv[2]||'9238';
const OFFER=process.argv[3]||'551898587556';
// 读价格：找含 ¥ 的数字元素（排除运费），找「起」或价格区间的元素
const readPrice=`(()=>{
  const cands=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/¥/.test(e.textContent||''));
  const prices=cands.map(e=>(e.textContent||'').trim().replace(/\\s+/g,'')).filter(t=>/¥[\\d.]+/.test(t)&&t.length<30);
  // 价格区间元素（如 ¥8.50-¥12.00 或 ¥8.50起）
  const range=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/¥[\\d.]+.*(起|-)¥?[\\d.]*/.test((e.textContent||'').replace(/\\s+/g,''))&&(e.textContent||'').length<40).map(e=>(e.textContent||'').trim().replace(/\\s+/g,''));
  return JSON.stringify({prices:[...new Set(prices)].slice(0,10), range:[...new Set(range)].slice(0,10)});
})()`;
(async()=>{
  try{
    const tabs=await get(`http://127.0.0.1:${PORT}/json`);
    let page=tabs.find(t=>t.type==='page'&&/1688/.test(t.url||''))||tabs.find(t=>t.type==='page');
    if(!page){console.log('NO_PAGE');return;}
    const c=await conn(page.webSocketDebuggerUrl);
    await c.send('Page.enable',{});await c.send('Runtime.enable',{});
    if(!/551898587556/.test(await ev(c,'location.href'))){
      await c.send('Page.navigate',{url:`https://detail.1688.com/offer/${OFFER}.html`});
      await sleep(9000);
    }
    console.log('初始价格:', await ev(c,readPrice));

    // 点选不同尺寸，看价格变化（选 6寸/8寸/9寸 三个代表）
    const testSkus=['6寸彩绘款-财字','8寸彩绘款-财字','9寸彩绘款-财字'];
    for(const sku of testSkus){
      await ev(c,`(()=>{const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&(e.textContent||'').trim()===${JSON.stringify(sku)}&&e.getBoundingClientRect().width>0);if(el){el.scrollIntoView({block:'center'});el.click();return 'ok';}return 'no';})()`);
      await sleep(2000);
      console.log('SKU', JSON.stringify(sku), '=>', await ev(c,readPrice));
    }
    c.ws.close();
  }catch(e){console.log('ERR',e.message);}
})();
