
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
    await sleep(2000);
    // 滚动到详情模块，触发懒加载
    await ev(`(()=>{const b=document.querySelector('.module-od-product-description .collapse-body');if(b){b.scrollIntoView({block:'center'});}return 1;})()`);
    await sleep(2000);

    // dump collapse-body 完整 HTML（含所有 img 标签，不管是否加载）
    const r = await ev(`(function(){
      const body=document.querySelector('.module-od-product-description .collapse-body');
      if(!body) return JSON.stringify({err:'no body'});
      var html=body.innerHTML;
      // 找所有 img src（正则提取，不管 naturalWidth）
      var srcs=[];
      var re=/src="([^"]+)"/g; var m;
      while((m=re.exec(html))!==null){ if(/alicdn|1688|cloud\.video|img\.al/.test(m[1])) srcs.push(m[1].slice(0,120)); }
      // 找所有 lazy 相关属性
      var lazyAttrs=[];
      var re2=/(data-src|data-lazyload|data-original|data-url)="([^"]+)"/g; var m2;
      while((m2=re2.exec(html))!==null){ lazyAttrs.push(m2[1]+'='+m2[2].slice(0,120)); }
      return JSON.stringify({htmlLen:html.length, imgSrcs:srcs, lazyAttrs:lazyAttrs, tail:html.slice(-300)});
    })()`);
    console.log(r);
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
