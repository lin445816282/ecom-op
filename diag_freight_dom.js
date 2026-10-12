// 诊断：导航到商品编辑页，dump 运费模板字段的真实 DOM 结构
// 用法：node diag_freight_dom.js <端口> <goods_id>
const http = require('http');
function get(u){return new Promise((res,rej)=>{const q=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});q.on('error',rej);q.setTimeout(5000,()=>{q.destroy();rej(new Error('timeout'))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});return{ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r&&r.result&&r.result.value!==undefined)return r.result.value;if(r&&r.exceptionDetails)return 'EXC:'+JSON.stringify(r.exceptionDetails).slice(0,200);return undefined;}
const PORT=process.argv[2]||'9234';
const GID=process.argv[3]||'1013427814532';
(async()=>{
  try{
    const tabs=await get(`http://127.0.0.1:${PORT}/json`);
    const page=tabs.find(t=>t.type==='page'&&/goods_list|mms\.pinduoduo/.test(t.url||''))||tabs.find(t=>t.type==='page');
    if(!page){console.log('NO_PAGE');return;}
    const c=await conn(page.webSocketDebuggerUrl);
    await c.send('Page.enable',{});await c.send('Runtime.enable',{});
    // 候选编辑页 URL
    const urls=[
      `https://mms.pinduoduo.com/goods/goods_edit?goods_id=${GID}`,
      `https://mms.pinduoduo.com/goods/edit?goods_id=${GID}`,
      `https://mms.pinduoduo.com/goods/publish?goods_id=${GID}`,
    ];
    for(const u of urls){
      await c.send('Page.navigate',{url:u});
      await sleep(6000);
      const info=await ev(c,`JSON.stringify({url:location.href, title:document.title, has_freight:document.body.innerText.includes('运费模板'), body_len:document.body.innerText.length})`);
      console.log('NAV', u, '=>', info);
      if(info && info.includes('has_freight\":true')){ console.log('FOUND_PAGE'); break; }
    }
    // dump 运费模板相关 DOM：找「运费模板」「其他模板」「推荐默认」「展开修改」文本叶子 + 相关 select
    const dom=await ev(c,`(()=>{
      const out={};
      const txt=(s)=>[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim()===s&&e.getBoundingClientRect().width>0);
      out.其他模板=txt('其他模板').length;
      out.推荐默认=txt('推荐默认').length;
      out.展开修改=txt('展开修改').length;
      out.运费模板label=[...document.querySelectorAll('label')].filter(e=>(e.textContent||'').trim()==='运费模板').length;
      // select 相关
      const sels=[...document.querySelectorAll('[data-testid="beast-core-select"]')];
      out.beast_select=sels.length;
      out.select_headers=sels.map(s=>{const h=s.querySelector('[data-testid="beast-core-select-header"]');return h?((h.textContent||'').trim().slice(0,40)+'@'+JSON.stringify({w:Math.round(h.getBoundingClientRect().width),h:Math.round(h.getBoundingClientRect().height),x:Math.round(h.getBoundingClientRect().x),y:Math.round(h.getBoundingClientRect().y)})):'(no header)'});
      // radio
      const radios=[...document.querySelectorAll('[data-testid="beast-core-radio"]')];
      out.beast_radio=radios.length;
      out.radio_texts=radios.map(r=>(r.textContent||'').trim().slice(0,20)+' checked='+r.getAttribute('data-checked'));
      // 含「运费模板」的可见文本片段
      const frag=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/运费模板/.test(e.textContent||'')&&e.getBoundingClientRect().width>0).map(e=>(e.textContent||'').trim().slice(0,50));
      out.freight_fragments=[...new Set(frag)].slice(0,20);
      return JSON.stringify(out);
    })()`);
    console.log('DOM', dom);
    c.ws.close();
  }catch(e){console.log('ERR',e.message);}
})();
