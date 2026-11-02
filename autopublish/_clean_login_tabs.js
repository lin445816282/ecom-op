// 确认登录态 + 清理 loginmyseller tab（保留 myseller home tab）
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function req(u, method){return new Promise((res,rej)=>{const opts={method:method||'GET'};const r=http.request(u,opts,resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});r.on('error',rej);r.setTimeout(8000,()=>{r.destroy();rej(new Error('超时'))});r.end();})}

(async()=>{
  const tabs = await req('http://127.0.0.1:9222/json');
  const pages = tabs.filter(t=>t.type==='page');
  console.log('当前 page tabs:');
  pages.forEach(t=>console.log('  ', t.id.slice(0,12), '|', t.url.slice(0,70)));

  // 关闭所有 loginmyseller tab
  let closed = 0;
  for(const t of pages){
    if(/loginmyseller/.test(t.url||'')){
      try{ await req(`http://127.0.0.1:9222/json/close/${t.id}`); closed++; console.log('  关闭 loginmyseller tab:', t.id.slice(0,12)); }catch(e){ console.log('  关闭失败:', e.message); }
    }
  }
  console.log('关闭 loginmyseller tab 数:', closed);

  // 确认是否有 myseller home tab，没有则新建一个
  await sleep(1000);
  const tabs2 = await req('http://127.0.0.1:9222/json');
  const pages2 = tabs2.filter(t=>t.type==='page');
  const home = pages2.find(t=>/myseller\.taobao\.com\/home/.test(t.url||''));
  console.log('清理后 tabs:', pages2.map(t=>t.url.slice(0,50)));
  console.log('myseller home tab:', home ? '存在' : '不存在');
  process.exit(0);
})().catch(e=>{console.log('ERR',e.message);process.exit(1)});
