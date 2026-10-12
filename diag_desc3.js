
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    const tabs = await get('http://127.0.0.1:9238/json');
    const page = tabs.find(t=>t.type==='page'&&/detail\.1688\.com\/offer/.test(t.url||''))||tabs.find(t=>t.type==='page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Runtime.enable',{}); await send('Page.enable',{});
    const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r&&r.result?r.result.value:undefined);

    // 展开详情
    await ev(`(()=>{const m=document.querySelector('.module-od-product-description');if(m){const h=m.querySelector('.collapse-header')||m;h.scrollIntoView({block:'center'});h.click();return 1;}return 0;})()`);
    await sleep(3000);

    // dump collapse-body 完整结构：所有 img/video/文本 + 长图
    const r = await ev(`(function(){
      const mod=document.querySelector('.module-od-product-description');
      if(!mod) return JSON.stringify({err:'no module'});
      const body=mod.querySelector('.collapse-body')||mod;
      var out={imgs:[], videos:[], text:(body.innerText||'').slice(0,300)};
      var imgs=body.querySelectorAll('img');
      for(var i=0;i<imgs.length;i++){
        var im=imgs[i]; var src=im.src||'';
        if(src.startsWith('data:'))continue;
        out.imgs.push({nw:im.naturalWidth||0, nh:im.naturalHeight||0, src:src.slice(0,120)});
      }
      body.querySelectorAll('video').forEach(function(v){ out.videos.push((v.src||'').slice(0,100)); });
      return JSON.stringify(out);
    })()`);
    console.log(r);
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
