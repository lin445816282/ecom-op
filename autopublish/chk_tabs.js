const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})}).on('error',rej)})}
(async()=>{
  const tabs=await get('http://127.0.0.1:9238/json');
  tabs.filter(t=>t.type==='page').forEach(t=>console.log(t.url.slice(0,100)));
  process.exit(0);
})();
