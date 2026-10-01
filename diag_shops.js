// 诊断各店铺 CDP 端口实际登录的店铺名
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const PORTS = [9228, 9230, 9232, 9234];
(async()=>{
  for(const PORT of PORTS){
    try{
      const tabs = await get(`http://127.0.0.1:${PORT}/json`);
      const page = tabs && tabs.find(t=>t.type==='page');
      if(!page){ console.log(PORT, '→ 无 page tab'); continue; }
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),5000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
      let id=0; const p=new Map();
      function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
      ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
      await send('Runtime.enable',{});
      const r = await send('Runtime.evaluate',{expression:`(function(){
        var b = document.body ? document.body.innerText : '';
        var m = b.match(/[\\u4e00-\\u9fa5A-Za-z]{2,12}(旗舰店|专营店|专卖店)/);
        return JSON.stringify({shop: m ? m[0] : '未识别', url: location.href.slice(0,60)});
      })()`, returnByValue:true});
      console.log(PORT, '→', r.result.value);
      ws.close();
    }catch(e){ console.log(PORT, '→ ERR', e.message); }
  }
})();
