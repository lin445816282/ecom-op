// 干净诊断拼多多 goods/category 页面：新建tab + 导航 + 完整dump
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const PORT = process.argv[2] || '9234';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    const page = tabs.find(t=>t.type==='page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Page.enable',{});
    await send('Runtime.enable',{});

    await send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
    await sleep(8000);

    const r = await send('Runtime.evaluate',{expression:`(function(){
      var out = {
        url: location.href.slice(0,100),
        title: document.title,
        body: (document.body?document.body.innerText:'').slice(0,1500),
        iframes: [],
        inputs: []
      };
      document.querySelectorAll('iframe').forEach(function(f){
        out.iframes.push({src: (f.src||'').slice(0,80), w: Math.round(f.getBoundingClientRect().width), h: Math.round(f.getBoundingClientRect().height)});
      });
      document.querySelectorAll('input').forEach(function(i){
        if(i.placeholder) out.inputs.push({ph: i.placeholder.slice(0,40), type: i.type});
      });
      return JSON.stringify(out);
    })()`, returnByValue:true});
    console.log(r.result.value);
    ws.close();
    process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
