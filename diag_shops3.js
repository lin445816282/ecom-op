// dump 各端口 body 全文，找店铺名（账号信息区域）
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const PORTS = [9230, 9232];
(async()=>{
  for(const PORT of PORTS){
    try{
      const tabs = await get(`http://127.0.0.1:${PORT}/json`);
      const page = tabs && tabs.find(t=>t.type==='page');
      if(!page){ console.log(PORT, '→ 无 page'); continue; }
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),5000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
      let id=0; const p=new Map();
      function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
      ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
      await send('Runtime.enable',{});
      const r = await send('Runtime.evaluate',{expression:`(function(){
        var b = document.body ? document.body.innerText : '';
        var idx = b.indexOf('账号信息');
        var seg = idx >= 0 ? b.slice(idx, idx+120) : '';
        var m = b.match(/[\\u4e00-\\u9fa5A-Za-z·]{2,20}(旗舰店|专营店|专卖店|企业店|工厂)/);
        return JSON.stringify({shop: m ? m[0] : '未识别', aroundAccount: seg.replace(/\\n/g,' ')});
      })()`, returnByValue:true});
      const v = JSON.parse(r.result.value);
      console.log(PORT, '→', v.shop, '|', v.aroundAccount.slice(0,80));
      ws.close();
    }catch(e){ console.log(PORT, '→ ERR', e.message); }
  }
})();
