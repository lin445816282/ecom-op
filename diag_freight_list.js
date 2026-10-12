// 诊断：在 goods_list 页面找「编辑」入口的跳转方式/URL，定位商品编辑页真实 URL
const http = require('http');
function get(u){return new Promise((res,rej)=>{const q=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});q.on('error',rej);q.setTimeout(5000,()=>{q.destroy();rej(new Error('timeout'))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});return{ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r&&r.result&&r.result.value!==undefined)return r.result.value;return undefined;}
const PORT=process.argv[2]||'9234';
(async()=>{
  try{
    const tabs=await get(`http://127.0.0.1:${PORT}/json`);
    const page=tabs.find(t=>t.type==='page'&&/goods_list/.test(t.url||''))||tabs.find(t=>t.type==='page');
    if(!page){console.log('NO_PAGE');return;}
    const c=await conn(page.webSocketDebuggerUrl);
    await c.send('Page.enable',{});await c.send('Runtime.enable',{});
    await c.send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/goods_list'});
    await sleep(8000);
    // dump 页面里所有 a 标签的 href（找 edit/publish/goods_id 相关），以及「编辑」按钮的 onclick
    const info=await ev(c,`(()=>{
      const out={url:location.href, body_len:document.body.innerText.length};
      const as=[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).filter(h=>/goods|edit|publish/i.test(h));
      out.a_hrefs=[...new Set(as)].slice(0,40);
      const btns=[...document.querySelectorAll('button,[role="button"]')].map(b=>(b.textContent||'').trim()).filter(t=>t&&t.length<20);
      out.buttons=[...new Set(btns)].slice(0,60);
      return JSON.stringify(out);
    })()`);
    console.log('LIST', info);
    // 尝试点击「编辑」按钮（第一个），看跳转 URL
    const clicked=await ev(c,`(()=>{
      const b=[...document.querySelectorAll('button,[role="button"],a')].find(x=>/编辑/.test((x.textContent||'').trim())&&(x.textContent||'').trim().length<10);
      if(!b) return 'no_edit_btn';
      b.scrollIntoView({block:'center'});
      b.click();
      return 'clicked';
    })()`);
    console.log('CLICK', clicked);
    await sleep(5000);
    const after=await ev(c,`JSON.stringify({url:location.href, has_freight:document.body.innerText.includes('运费模板'), body_len:document.body.innerText.length})`);
    console.log('AFTER', after);
    c.ws.close();
  }catch(e){console.log('ERR',e.message);}
})();
