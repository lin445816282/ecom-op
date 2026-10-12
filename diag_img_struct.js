// 诊断 1688 详情页三类图：主图(gallery) / SKU图(sku) / 详情图(detail长图)
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const PORT = process.argv[2] || '9238';
const SRC = process.argv[3];
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    let page = tabs.find(t=>t.type==='page'&&/detail\.1688\.com\/offer/.test(t.url||''));
    if(!page) page = tabs.find(t=>t.type==='page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Runtime.enable',{}); await send('Page.enable',{});
    if(SRC){ await send('Page.navigate',{url:SRC}); }
    let final='';
    for(let i=0;i<25;i++){await sleep(1000);final=(await send('Runtime.evaluate',{expression:'location.href',returnByValue:true})).result.value;if(/detail\.1688\.com\/offer\//.test(final))break;}
    console.log('FINAL:', final.slice(0,90));
    await sleep(2000);
    // 滚动到底触发详情图懒加载
    for(let i=0;i<4;i++){ await send('Runtime.evaluate',{expression:'window.scrollTo(0,document.body.scrollHeight)'}); await sleep(1500); }
    const r = await send('Runtime.evaluate',{expression:`(function(){
      function cls(el){ var c=el.className; return (typeof c==='string')?c:'('+(typeof c)+')'; }
      var out={imgs:[], iframes:0};
      // 主文档所有图
      var imgs=document.querySelectorAll('img');
      for(var i=0;i<imgs.length;i++){
        var im=imgs[i]; var src=im.src||''; var nw=im.naturalWidth||0;
        if(!src||nw<60||src.startsWith('data:'))continue;
        var chain=[]; var el=im;
        for(var k=0;k<7&&el;k++){ chain.push(el.tagName.toLowerCase()+(cls(el)?('.'+cls(el).split(' ').join('.')):'')); el=el.parentElement; }
        out.imgs.push({i:i,nw:nw,nh:im.naturalHeight||0,src:src.slice(0,90).replace(/^https?:\\/\\//,''),chain:chain.join(' > ')});
      }
      // 详情描述 iframe
      var frames=document.querySelectorAll('iframe');
      out.iframes=frames.length;
      var frameInfo=[];
      for(var j=0;j<frames.length;j++){
        var f=frames[j]; var fs=(f.src||'').slice(0,80);
        var fid=(f.id||''), fcls=cls(f);
        if(/desc|detail|content/i.test(fs+fid+fcls)) frameInfo.push({src:fs,id:fid,cls:fcls});
      }
      out.frameInfo=frameInfo;
      return JSON.stringify(out);
    })()`, returnByValue:true});
    const d = JSON.parse(r.result.value);
    console.log('图片数:', d.imgs.length, '| iframe数:', d.iframes);
    d.imgs.forEach(x=>{ console.log('['+x.i+'] '+x.nw+'x'+x.nh+' | '+x.src); console.log('     dom: '+x.chain); });
    if(d.frameInfo.length){ console.log('详情相关 iframe:'); d.frameInfo.forEach(f=>console.log('   '+JSON.stringify(f))); }
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
