// 诊断：抓取 1688 商品页每个 SKU 的名称、价格、图（点不同尺寸切换）
const http = require('http');
function get(u){return new Promise((res,rej)=>{const q=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});q.on('error',rej);q.setTimeout(5000,()=>{q.destroy();rej(new Error('timeout'))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m))}},30000);p.set(mid,{res:(v)=>{clearTimeout(to);res(v)},rej:(e)=>{clearTimeout(to);rej(e)}});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});return{ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r&&r.result&&r.result.value!==undefined)return r.result.value;if(r&&r.exceptionDetails)return 'EXC:'+JSON.stringify(r.exceptionDetails).slice(0,150);return undefined;}
const PORT=process.argv[2]||'9238';
const OFFER=process.argv[3]||'551898587556';
(async()=>{
  try{
    const tabs=await get(`http://127.0.0.1:${PORT}/json`);
    let page=tabs.find(t=>t.type==='page'&&/1688/.test(t.url||''))||tabs.find(t=>t.type==='page');
    if(!page){console.log('NO_PAGE');return;}
    const c=await conn(page.webSocketDebuggerUrl);
    await c.send('Page.enable',{});await c.send('Runtime.enable',{});
    await c.send('Page.navigate',{url:`https://detail.1688.com/offer/${OFFER}.html`});
    await sleep(9000);
    console.log('URL:', await ev(c,'location.href'));

    // 1) 抓取 SKU 列表（点击尺寸/规格的选项，读名称和价格）
    const skuInfo=await ev(c,`(()=>{
      const out={price:(document.querySelector('[class*="price"]')?.textContent||'').trim().slice(0,80)};
      // 找 SKU 相关的文本
      const leaves=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0);
      const skuTexts=[...new Set(leaves.map(e=>(e.textContent||'').trim()).filter(t=>/寸|款|财字|莲花/.test(t)&&t.length<30))].slice(0,40);
      out.skuTexts=skuTexts;
      // 找规格选项容器（常见的 1688 sku 选择器）
      const skuElems=[...document.querySelectorAll('[class*="sku"], [class*="spec"], [class*="offer-attr"], [class*="sku-item"], [class*="value-item"]')].map(e=>e.className);
      out.skuClasses=[...new Set(skuElems)].slice(0,20);
      return JSON.stringify(out);
    })()`);
    console.log('SKU_INFO', skuInfo);

    // 2) 抓取主图（当前 SKU 对应的图）和所有图
    const imgs=await ev(c,`(()=>{
      const imgs=[...document.querySelectorAll('img')].map(i=>i.src).filter(s=>s&&/alicdn|1688|offer/.test(s));
      return JSON.stringify([...new Set(imgs)].slice(0,20));
    })()`);
    console.log('IMGS', imgs);

    c.ws.close();
  }catch(e){console.log('ERR',e.message);}
})();
