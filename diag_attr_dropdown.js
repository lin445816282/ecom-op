// 精确 dump：点开「重要材质」「风格」select 后，抓下拉选项（option/menu 类元素）
const http = require('http');
function get(u){return new Promise((res,rej)=>{const q=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});q.on('error',rej);q.setTimeout(5000,()=>{q.destroy();rej(new Error('timeout'))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m))}},30000);p.set(mid,{res:(v)=>{clearTimeout(to);res(v)},rej:(e)=>{clearTimeout(to);rej(e)}});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});return{ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r&&r.result&&r.result.value!==undefined)return r.result.value;if(r&&r.exceptionDetails)return 'EXC:'+JSON.stringify(r.exceptionDetails).slice(0,150);return undefined;}
const PORT=process.argv[2]||'9234';
async function dumpDropdown(c, labelName){
  const clk=await ev(c,`(()=>{
    const lbl=[...document.querySelectorAll('label')].find(e=>(e.textContent||'').trim()===${JSON.stringify(labelName)}&&e.getBoundingClientRect().width>0);
    if(!lbl) return 'no_label';
    let item=lbl.parentElement;
    for(let i=0;i<5&&item;i++){ if(item.querySelector('[data-testid="beast-core-select"]')) break; item=item.parentElement; }
    const sel=item?item.querySelector('[data-testid="beast-core-select"]'):null;
    if(!sel) return 'no_select';
    const head=sel.querySelector('[data-testid="beast-core-select-header"]')||sel;
    head.scrollIntoView({block:'center'});
    head.click();
    return 'ok';
  })()`);
  console.log(labelName, '点开:', clk);
  if(clk!=='ok') return;
  await sleep(3000);
  // dump option/menu 类元素 + 含材质/风格关键词的叶子
  const r=await ev(c,`(()=>{
    const optEls=[...document.querySelectorAll('[class*="option"],[class*="Option"],[role="option"],[class*="menu"],[class*="Menu"],[class*="dropdown"],[class*="Dropdown"],[class*="popup"],[class*="Popup"],[class*="list"],[class*="List"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;});
    const texts=[...new Set(optEls.map(e=>(e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,60)))].filter(t=>t&&t.length>0&&t.length<60);
    return JSON.stringify(texts.slice(0,30));
  })()`);
  console.log(labelName, '下拉 =>', r);
  await ev(c,`document.body.click()`);
  await sleep(800);
}
(async()=>{
  try{
    const tabs=await get(`http://127.0.0.1:${PORT}/json`);
    let page=tabs.find(t=>t.type==='page'&&/goods_add\/index/.test(t.url||''))||tabs.find(t=>t.type==='page'&&/mms\.pinduoduo/.test(t.url||''));
    if(!page){console.log('NO_PAGE');return;}
    const c=await conn(page.webSocketDebuggerUrl);
    await c.send('Page.enable',{});await c.send('Runtime.enable',{});
    console.log('URL:', await ev(c,'location.href').then(h=>h.slice(0,80)));
    await dumpDropdown(c, '重要材质');
    await dumpDropdown(c, '风格');
    c.ws.close();
  }catch(e){console.log('ERR',e.message);}
})();
