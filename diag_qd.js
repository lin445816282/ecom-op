// dump 拼多多发布页 quick_decoration（快速装修/详情图）区结构
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const PORT = process.argv[2] || '9234';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    let page = tabs.find(t=>t.type==='page'&&/goods_add\/index/.test(t.url||''))||tabs.find(t=>t.type==='page'&&/mms\.pinduoduo\.com/.test(t.url||''))||tabs.find(t=>t.type==='page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Runtime.enable',{}); await send('Page.enable',{});
    const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r&&r.result?r.result.value:undefined);
    console.log('TAB URL:', (await ev('location.href')).slice(0,90));
    // 滚到底
    for(let i=0;i<4;i++){ await ev('window.scrollTo(0,document.body.scrollHeight)'); await sleep(1000); }
    const r=await ev(`(function(){
      var out={qdText:'', qdStruct:[], labels:[]};
      // quick_decoration 容器
      var qd=document.querySelector('[class*="quick_decoration"], [class*="quick-decoration"]');
      if(qd){
        out.qdText=(qd.innerText||'').replace(/\\s+/g,' ').slice(0,300);
        // 找它附近的标题
        var p=qd;
        for(var k=0;k<4&&p;k++){
          var prev=p.previousElementSibling;
          if(prev){ var pt=(prev.textContent||'').trim(); if(pt) out.labels.push(pt.slice(0,60)); }
          p=p.parentElement;
        }
        // qd 里的图片和上传按钮
        var imgs=qd.querySelectorAll('img');
        out.qdImgCount=imgs.length;
        var btn=qd.querySelector('input[type="file"]');
        out.qdHasFileInput=!!btn;
        out.qdAccept=btn?btn.accept:'';
        // qd 里已上传的图片（上传后的预览）
        var ups=[];
        imgs.forEach(function(im){ if(im.src&&!im.src.startsWith('data:')) ups.push(im.src.slice(0,80)); });
        out.qdUploaded=ups.slice(0,10);
      }
      // 找所有「商品详情」「图文详情」「快速装修」「详情」标题及其附近
      var all=document.querySelectorAll('*');
      var titles=[];
      for(var j=0;j<all.length;j++){
        var e=all[j]; if(e.children.length>0)continue;
        var t=(e.textContent||'').trim();
        if(/商品详情|图文详情|快速装修|详情装修|商品描述/.test(t)&&t.length<20) titles.push(t);
      }
      out.titles=titles.slice(0,10);
      return JSON.stringify(out);
    })()`);
    const d=JSON.parse(r);
    console.log('=== quick_decoration 区 ===');
    console.log('  文本:', d.qdText||'(未找到 quick_decoration 容器)');
    console.log('  图片数:', d.qdImgCount, '| 有 file input:', d.qdHasFileInput, '| accept:', d.qdAccept);
    console.log('  已上传图:', JSON.stringify(d.qdUploaded));
    console.log('  附近标签:', JSON.stringify(d.labels));
    console.log('=== 详情相关标题 ===');
    console.log('  '+JSON.stringify(d.titles));
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
