
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

    await ev(`(()=>{const m=document.querySelector('.module-od-product-description');if(m){const h=m.querySelector('.collapse-header')||m;h.click();return 1;}return 0;})()`);
    await sleep(2500);

    // 检查 v-detail-k.html-description 的 shadow DOM + 内容
    const r = await ev(`(function(){
      const v=document.querySelector('v-detail-k.html-description')||document.querySelector('v-detail-k');
      if(!v) return JSON.stringify({err:'no v-detail-k'});
      var out={hasShadow:!!v.shadowRoot, innerHTML:v.innerHTML.slice(0,800), childCount:v.childElementCount};
      // shadow DOM 里的图
      var imgs=[];
      if(v.shadowRoot){
        var si=v.shadowRoot.querySelectorAll('img');
        si.forEach(function(im){ imgs.push({nw:im.naturalWidth||0, nh:im.naturalHeight||0, src:(im.src||'').slice(0,120)}); });
      }
      out.shadowImgs=imgs;
      // light DOM 里的图
      var li=v.querySelectorAll('img');
      var lImgs=[];
      li.forEach(function(im){ lImgs.push({nw:im.naturalWidth||0, nh:im.naturalHeight||0, src:(im.src||'').slice(0,120)}); });
      out.lightImgs=lImgs;
      return JSON.stringify(out);
    })()`);
    console.log(r);
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
