// 诊断：导航到拼多多运费模板管理页，dump 店铺现有的运费模板名称列表
const http = require('http');
function get(u){return new Promise((res,rej)=>{const q=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});q.on('error',rej);q.setTimeout(5000,()=>{q.destroy();rej(new Error('timeout'))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});return{ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r&&r.result&&r.result.value!==undefined)return r.result.value;return undefined;}
const PORT=process.argv[2]||'9234';
(async()=>{
  try{
    const tabs=await get(`http://127.0.0.1:${PORT}/json`);
    const page=tabs.find(t=>t.type==='page'&&/mms\.pinduoduo/.test(t.url||''))||tabs.find(t=>t.type==='page');
    if(!page){console.log('NO_PAGE');return;}
    const c=await conn(page.webSocketDebuggerUrl);
    await c.send('Page.enable',{});await c.send('Runtime.enable',{});
    const urls=[
      'https://mms.pinduoduo.com/logistics/template',
      'https://mms.pinduoduo.com/logistics/freight_template',
      'https://mms.pinduoduo.com/settings/ship_templates',
      'https://mms.pinduoduo.com/logistics/ship_template/list',
    ];
    for(const u of urls){
      await c.send('Page.navigate',{url:u});
      await sleep(6000);
      const info=await ev(c,`JSON.stringify({url:location.href, title:document.title, body_len:document.body.innerText.length, has_template:document.body.innerText.includes('运费模板')||document.body.innerText.includes('模板')})`);
      console.log('NAV', u, '=>', info);
    }
    // dump 当前页所有含「模板」的可见文本（找模板名称，是否有多仓）
    const names=await ev(c,`(()=>{
      const frags=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.getBoundingClientRect().width>0).map(e=>(e.textContent||'').trim()).filter(t=>t&&t.length<40);
      return JSON.stringify([...new Set(frags)].filter(t=>/多仓|模板|运费|包邮|偏远|按重|按件/.test(t)).slice(0,40));
    })()`);
    console.log('TEMPLATE_FRAGS', names);
    c.ws.close();
  }catch(e){console.log('ERR',e.message);}
})();
