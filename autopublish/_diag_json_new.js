// 测试 PUT /json/new 新建 tab 导航 myseller 是否触发崩溃
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function req(u, method){return new Promise((res,rej)=>{const opts={method:method||'GET'};const r=http.request(u,opts,resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});r.on('error',rej);r.setTimeout(8000,()=>{r.destroy();rej(new Error('超时'))});r.end();})}
async function check(tag){ try{ await req('http://127.0.0.1:9222/json/version'); console.log(`[${tag}] 9222 存活`); return true; }catch(e){ console.log(`[${tag}] 9222 崩溃: ${e.message}`); return false; } }

(async()=>{
  console.log('=== 步骤A：PUT /json/new 新建 tab 导航 myseller home ===');
  let newTab;
  try{
    newTab = await req('http://127.0.0.1:9222/json/new?https://myseller.taobao.com/home.htm/QnworkbenchHome/', 'PUT');
    console.log('  新建 tab:', newTab.id || newTab.title || JSON.stringify(newTab).slice(0,100));
  }catch(e){ console.log('  新建 tab 异常:', e.message); }
  await sleep(3);
  await check('新建tab后(3s)');
  await sleep(5);
  await check('新建tab后(8s)');
  // 看当前 tab 列表
  try{
    const tabs = await req('http://127.0.0.1:9222/json');
    console.log('  tabs:', tabs.filter(t=>t.type==='page').map(t=>t.url.slice(0,50)));
  }catch(e){ console.log('  读 tab 异常:', e.message); }
  process.exit(0);
})().catch(e=>{console.log('ERR',e.message);process.exit(1)});
