// 遍历 1688 商品每个 SKU：点击尺寸 → 记录当前主图 URL + 价格，建立「SKU→图/价格」映射
const http = require('http');
function get(u){return new Promise((res,rej)=>{const q=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});q.on('error',rej);q.setTimeout(5000,()=>{q.destroy();rej(new Error('timeout'))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m))}},30000);p.set(mid,{res:(v)=>{clearTimeout(to);res(v)},rej:(e)=>{clearTimeout(to);rej(e)}});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});return{ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r&&r.result&&r.result.value!==undefined)return r.result.value;if(r&&r.exceptionDetails)return 'EXC:'+JSON.stringify(r.exceptionDetails).slice(0,150);return undefined;}
const PORT=process.argv[2]||'9238';
const OFFER=process.argv[3]||'551898587556';
// 当前主图 + 价格
const curState=`(()=>{
  const big=document.querySelector('[class*="main-image"] img, [class*="mainImg"] img, [class*="gallery"] img, [class*="detail-gallery"] img, [class*="imgWrap"] img');
  const imgs=[...document.querySelectorAll('img')].map(i=>i.src).filter(s=>/cbu01\.alicdn\.com.*\.jpg/.test(s)&&!/tps-/.test(s));
  const priceEl=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&/^¥\\s*[\\d.]+/.test((e.textContent||'').trim()));
  return JSON.stringify({main:big?big.src:'', cbuImgs:[...new Set(imgs)].slice(0,3), price:priceEl?(priceEl.textContent||'').trim().slice(0,20):''});
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

    // 找所有尺寸选项（含「寸」的可见叶子，在 SKU 选择区域内）
    const skus=await ev(c,`(()=>{
      const leaves=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&/寸.*(财字|莲花)/.test((e.textContent||'').trim())&&(e.textContent||'').trim().length<25);
      return JSON.stringify([...new Set(leaves.map(e=>(e.textContent||'').trim()))]);
    })()`);
    console.log('SKU_LIST', skus);
    const skuArr=JSON.parse(skus);

    // 遍历每个 SKU：点击 → 记录主图 + 价格
    for(const sku of skuArr){
      const clk=await ev(c,`(()=>{
        const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&(e.textContent||'').trim()===${JSON.stringify(sku)}&&e.getBoundingClientRect().width>0);
        if(!el) return 'no_el';
        el.scrollIntoView({block:'center'});
        el.click();
        return 'ok';
      })()`);
      await sleep(1500);
      const st=await ev(c,curState);
      console.log('SKU', JSON.stringify(sku), '=>', clk, st);
    }

    c.ws.close();
  }catch(e){console.log('ERR',e.message);}
})();
