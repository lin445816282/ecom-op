
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

    // 1. 找详情描述模块，点展开（collapse-header）
    const expand = await ev(`(()=>{
      const mod=document.querySelector('.module-od-product-description');
      if(!mod) return 'no module';
      const head=mod.querySelector('.collapse-header')||mod.querySelector('h1')||mod;
      head.scrollIntoView({block:'center'});
      head.click();
      return 'clicked';
    })()`);
    console.log('展开详情:', expand);
    await sleep(3000);

    // 2. 展开后再抓长图
    const r = await ev(`(function(){
      var out={longImgs:[], descHtml:''};
      const mod=document.querySelector('.module-od-product-description');
      if(mod){
        out.descHtml=(mod.innerHTML||'').slice(0,500);
        var imgs=mod.querySelectorAll('img');
        for(var i=0;i<imgs.length;i++){
          var im=imgs[i]; var src=im.src||'';
          if(!src||src.startsWith('data:'))continue;
          var nw=im.naturalWidth||0, nh=im.naturalHeight||0;
          var chain=[]; var el=im;
          for(var k=0;k<5&&el;k++){ chain.push(el.tagName.toLowerCase()+((typeof el.className==='string'&&el.className)?('.'+el.className.split(' ').join('.')):'')); el=el.parentElement; }
          out.longImgs.push({nw:nw,nh:nh,src:src.slice(0,110),chain:chain.join(' > ')});
        }
      }
      return JSON.stringify(out);
    })()`);
    const d=JSON.parse(r);
    console.log('=== 详情模块展开后的图 ===', d.longImgs.length);
    d.longImgs.forEach(x=>console.log('  '+x.nw+'x'+x.nh+' | '+x.src));
    console.log('=== 详情模块 HTML 片段 ===');
    console.log(d.descHtml.slice(0,500));
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
