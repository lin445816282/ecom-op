
const http = require('http');
const https = require('https');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    const tabs = await get('http://127.0.0.1:9238/json');
    const page = tabs.find(t=>t.type==='page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Runtime.enable',{}); await send('Page.enable',{});
    const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r&&r.result?r.result.value:undefined);

    // 提取 detailId（和 scrape.js 一样的正则）
    const detailId=await ev(`(()=>{
      const html=document.documentElement.outerHTML;
      const m=html.match(/itemcdn\\.tmall\\.com\\/1688offer\\/([A-Za-z0-9]+)/);
      return m?m[1]:'';
    })()`);
    console.log('detailId:', JSON.stringify(detailId));

    if(detailId){
      const detailTxt=await new Promise((res,rej)=>{
        const url='https://itemcdn.tmall.com/1688offer/'+detailId;
        const req=https.get(url,{headers:{'Referer':'https://detail.1688.com/','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}},r=>{
          let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));
        });
        req.on('error',e=>{console.log('https 错误:', e.message); res('');});
      });
      console.log('响应长度:', detailTxt.length);
      // 用新正则测试
      const re = /src=\\"([^"]+cib\.jpg)/g;
      const imgs = [...detailTxt.matchAll(re)].map(x=>x[1]);
      console.log('新正则匹配:', imgs.length, '个');
      console.log('前2个:', imgs.slice(0,2));
    }
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
