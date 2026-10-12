// 诊断：dump 指定 CDP 端口的所有 tab（type + url + title），用于定位运费模板页面
const http = require('http');
function get(u){return new Promise((res,rej)=>{const q=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});q.on('error',rej);q.setTimeout(5000,()=>{q.destroy();rej(new Error('timeout'))})})}
const PORT = process.argv[2] || '9234';
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    if(!Array.isArray(tabs)){ console.log('NOT_ARRAY', JSON.stringify(tabs).slice(0,200)); return; }
    for(const t of tabs){
      console.log(JSON.stringify({type:t.type, url:(t.url||'').slice(0,120), title:(t.title||'').slice(0,60), ws:(t.webSocketDebuggerUrl||'').slice(0,60)}));
    }
  }catch(e){ console.log('ERR', e.message); }
})();
