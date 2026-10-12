const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const PORT = process.argv[2] || '9234';
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    console.log('tabs:', tabs ? tabs.length : 0);
    if(tabs) tabs.forEach((t,i)=>{ if(t.type==='page') console.log('['+i+'] '+(t.url||'').slice(0,90)+' | '+(t.title||'').slice(0,30)); });
  }catch(e){ console.log('ERR', e.message); }
})();
