const http = require('http');
const PORT = '9236';
const WORD = process.argv[2] || '花盆';
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on('error',rej)})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function main(){
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  const page = tabs.find(t=>t.type==='page' && /yangkeduo/.test(t.url)) || tabs.find(t=>t.type==='page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id=0; const pending=new Map();
  const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}))});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result)}});
  await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
  await send('Page.navigate',{url:'https://mobile.yangkeduo.com/search_result.html?search_key='+encodeURIComponent(WORD)});
  await sleep(5000);
  // 读所有叶子元素文本，找含维度名的连续文本
  const expr = `(() => {
    const leaves = [...document.querySelectorAll('div,span')].map(el=>(el.textContent||'').trim()).filter(t=>t.length>=3 && t.length<=80);
    const seen = new Set(); const out = [];
    for(const t of leaves){ if(t && !seen.has(t)){ seen.add(t); out.push(t); } }
    // 提取含维度名的
    const dims = ['材质','风格','摆放','品牌','场景','安装','承重','颜色','工艺','适用','功能'];
    const hits = out.filter(t => dims.some(d => t.startsWith(d) && t.length > d.length));
    // 商品标题（12-60字，含核心词）
    const titles = out.filter(t => t.length>=12 && t.length<=60 && t.includes('${WORD}'));
    return JSON.stringify({filters: hits.slice(0,20), titles: titles.slice(0,30)});
  })()`;
  const r = await send('Runtime.evaluate',{expression:expr,returnByValue:true});
  console.log(r.result.value);
  ws.close(); process.exit(0);
}
main().catch(e=>{console.error('ERR:',e.message);process.exit(1)});
