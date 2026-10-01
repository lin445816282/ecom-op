// 分析 x5sec 滑块验证页的 DOM 结构，定位滑块元素
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const PORT = process.argv[2] || '9238';
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    const page = tabs.find(t=>t.type==='page');
    if(!page){ console.log('NO_PAGE'); return; }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Runtime.enable',{});
    const r = await send('Runtime.evaluate',{expression:`(function(){
      var out = {classes: [], slider: null, frames: 0, iframes: []};
      // 找滑块相关元素
      var els = document.querySelectorAll('*');
      for (var i=0;i<els.length;i++){
        var id = els[i].id || '';
        var cls = (els[i].className && typeof els[i].className === 'string') ? els[i].className : '';
        if (/slide|slider|nc_|btn_slide|drag|verify|nc-icon/i.test(id+'_'+cls)){
          var rect = els[i].getBoundingClientRect();
          if(rect.width > 0){
            out.classes.push({tag: els[i].tagName, id: id, cls: cls.slice(0,80), x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height)});
          }
        }
      }
      out.frames = document.querySelectorAll('iframe').length;
      document.querySelectorAll('iframe').forEach(function(f){
        out.iframes.push({src: (f.src||'').slice(0,100), x: f.getBoundingClientRect().x, y: f.getBoundingClientRect().y, w: f.getBoundingClientRect().width, h: f.getBoundingClientRect().height});
      });
      return JSON.stringify(out);
    })()`, returnByValue:true});
    console.log((r && r.result && r.result.value) || '无');
    ws.close();
    process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
