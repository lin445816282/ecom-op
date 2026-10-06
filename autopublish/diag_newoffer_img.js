// 诊断：dump 1688 newofferlist 页面 offer 对象的完整字段结构，找主图字段
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})}).on('error',rej)})}
(async()=>{
  const tabs = await get('http://127.0.0.1:9238/json');
  const g = tabs.find(t=>t.type==='page'&&/1688/.test(t.url))||tabs.find(t=>t.type==='page');
  const ws = new WebSocket(g.webSocketDebuggerUrl);
  let id=0; const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r&&r.result?r.result.value:undefined);
  await send('Page.enable',{}); await send('Runtime.enable',{});
  await send('Page.navigate',{url:'https://nixityg.1688.com/page/newofferlist.htm'});
  for(let i=0;i<15;i++){await sleep(1000);const f=await ev('location.href');if(/newofferlist/.test(f||''))break;}
  await sleep(2500);
  for(let i=0;i<3;i++){ await ev('window.scrollTo(0,document.body.scrollHeight)'); await sleep(1500); }
  const r = await ev(`(()=>{
    const pd = window.pageData;
    const found = [];
    function walk(o, depth){
      if(!o || depth>8 || found.length>=5) return;
      if(typeof o==='object'){
        if(o.id && /^\\d{12,}$/.test(String(o.id)) && o.subject){
          found.push(o);
        }
        for(const k in o){ try{ walk(o[k], depth+1); }catch(e){} }
      }
    }
    walk(pd, 0);
    // dump 第一个 offer 对象的所有 keys + 疑似图片字段的值
    const first = found[0];
    if(!first) return JSON.stringify({err:'no offer found', pageDataKeys: pd?Object.keys(pd):[]});
    const keys = Object.keys(first);
    // 找出所有包含 image/img/pic/thumb/photo 的 key
    const imgKeys = keys.filter(k => /image|img|pic|thumb|photo|cover/i.test(k));
    const imgVals = {};
    imgKeys.forEach(k => { imgVals[k] = first[k]; });
    return JSON.stringify({offerKeys: keys, imgKeys: imgVals}, null, 1);
  })()`);
  console.log(r);
  ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1);});
