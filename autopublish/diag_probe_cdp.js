// 诊断：探测各店铺 CDP 实例是否存活 + 列出当前 tab（找 goods_add/index 发布页）
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(6000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
(async()=>{
  const ports = ['9232','9230','9234','9228','9222'];
  for(const p of ports){
    try{
      const tabs = await get(`http://127.0.0.1:${p}/json`);
      if(!Array.isArray(tabs)){ console.log(`${p}: 非数组响应`, JSON.stringify(tabs).slice(0,80)); continue; }
      const pages = tabs.filter(t=>t.type==='page');
      console.log(`${p}: ${pages.length} 个 page tab`);
      pages.forEach(t=>{
        const u = t.url||'';
        const tag = /goods_add\/index/.test(u) ? ' ★发布页' : (/mms\.pinduoduo/.test(u)?' 后台' : /1688/.test(u)?' 1688' : '');
        console.log(`    ${u.slice(0,90)}${tag}`);
      });
    }catch(e){ console.log(`${p}: 无响应 (${e.message})`); }
  }
})().catch(e=>{console.log('ERR',e.message);process.exit(1)});
