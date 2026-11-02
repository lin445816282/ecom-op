// 等待登录结果：轮询检查登录态（跳转 myseller home = 成功；滑块弹出 = 需拖）
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}

(async()=>{
  for(let i=1;i<=10;i++){
    await sleep(3000);
    const tabs = await get('http://127.0.0.1:9222/json');
    const pages = tabs.filter(t=>t.type==='page');
    const home = pages.find(t=>/myseller\.taobao\.com\/home/.test(t.url||''));
    const login = pages.find(t=>/loginmyseller|login\.taobao/.test(t.url||''));
    console.log(`[${i*3}s] home=${home?'✅出现':'✗'} | login=${login?'仍在登录页':'已离开'} | tabs=${pages.map(t=>t.url.slice(0,45)).join(' , ')}`);
    if(home){ console.log('✅ 登录成功！'); break; }
  }
  process.exit(0);
})().catch(e=>{console.log('ERR',e.message);process.exit(1)});
