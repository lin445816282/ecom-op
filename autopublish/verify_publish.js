// 回查验证脚本 — 检查提交的 goods_id 在拼多多后台的真实状态（在售/草稿/下架/不存在）
// 用法：node verify_publish.js <端口> <goods_id1,goods_id2,...>
// 输出：stdout 最后一行 JSON {statuses: {goods_id: "published|draft|offshelf|missing", ...}}
const http = require('http');

const PORT = process.argv[2] || '9234';
const IDS = (process.argv[3] || '').split(',').map(s=>s.trim()).filter(Boolean);

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})}).on('error',rej)})}
async function conn(wsUrl){
  const ws=new WebSocket(wsUrl);let id=0;const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('ws timeout')),10000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  return {ws,send};
}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r&&r.result&&r.result.value!==undefined)return r.result.value;if(r&&r.exceptionDetails)return 'EXC';return undefined;}

(async()=>{
  if(!IDS.length){console.log(JSON.stringify({error:'no ids'}));process.exit(1);}
  const tabs=await get(`http://127.0.0.1:${PORT}/json`);
  const g=tabs.find(t=>t.type==='page'&&/mms\.pinduoduo/.test(t.url||''))||tabs.find(t=>t.type==='page');
  if(!g){console.log(JSON.stringify({error:'no pdd tab'}));process.exit(1);}
  const c=await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{});await c.send('Runtime.enable',{});
  await c.send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/goods_list'});
  await sleep(9000);

  const statuses={};
  const remaining=new Set(IDS);

  // 按 tab 顺序检查：在售中 → 草稿箱 → 已下架 → 已售罄 → 已驳回
  const tabsCheck=[
    ['在售中','published'],
    ['草稿箱','draft'],
    ['已下架','offshelf'],
    ['已售罄','soldout'],
    ['已驳回','rejected'],
  ];
  for(const [tabName, status] of tabsCheck){
    if(!remaining.size)break;
    // 点击 tab
    const clicked=await ev(c,`(function(){var el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&(e.textContent||'').trim().startsWith('${tabName}'));if(el){el.click();return 1}return 0})()`);
    await sleep(3500);
    const txt=await ev(c,'document.body.innerText')||'';
    for(const id of [...remaining]){
      if(txt.includes(id)){
        statuses[id]=status;
        remaining.delete(id);
      }
    }
  }
  // 剩余 = 不存在
  for(const id of remaining){statuses[id]='missing';}

  console.log(JSON.stringify({statuses}));
  c.ws.close();
})().catch(e=>{console.log(JSON.stringify({error:String(e.message||e)}));process.exit(1)});
