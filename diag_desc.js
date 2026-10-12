// 诊断 1688 详情页的「商品详情」长图区（iframe + 详情描述 DOM）
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const PORT = process.argv[2] || '9238';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    let page = tabs.find(t=>t.type==='page'&&/detail\.1688\.com\/offer/.test(t.url||''))||tabs.find(t=>t.type==='page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Runtime.enable',{}); await send('Page.enable',{});
    // 滚到底
    for(let i=0;i<5;i++){ await send('Runtime.evaluate',{expression:'window.scrollTo(0,document.body.scrollHeight)'}); await sleep(1200); }
    await sleep(1000);
    const r = await send('Runtime.evaluate',{expression:`(function(){
      var out={iframes:[], descText:'', descImgs:[]};
      // 所有 iframe
      document.querySelectorAll('iframe').forEach(function(f,i){
        out.iframes.push({i:i, src:(f.src||'').slice(0,120), id:f.id||'', cls:(typeof f.className==='string'?f.className:''), w:f.clientWidth, h:f.clientHeight});
      });
      // 找「商品详情」相关标题文本
      var all = document.querySelectorAll('*');
      for(var j=0;j<all.length;j++){
        var e=all[j];
        var t=(e.textContent||'').trim();
        if(t==='商品详情'||t==='商品细节'||t==='产品详情'||t==='详情'){
          out.descText += '['+e.tagName+'.'+((typeof e.className==='string')?e.className:'')+'] ';
          // 往下找 img
          var node=e, imgs=[];
          for(var k=0;k<3&&node;k++){ node=node.parentElement; }
          if(node){ node.querySelectorAll('img').forEach(function(im){ if(im.src&&im.naturalWidth>200) imgs.push({src:im.src.slice(0,90), w:im.naturalWidth, h:im.naturalHeight}); }); }
          out.descImgs.push({title:e.tagName, imgs:imgs.slice(0,20)});
          break;
        }
      }
      // 找可能的长图容器（含 desc/detail 的 div，看里面有没有图）
      var containers = document.querySelectorAll('[id*="desc"],[id*="detail"],[class*="desc"],[class*="detail"]');
      var cInfo=[];
      for(var m=0;m<containers.length;m++){
        var c=containers[m];
        var cimgs=c.querySelectorAll('img');
        var big=[];
        cimgs.forEach(function(im){ if(im.src&&im.naturalWidth>=200) big.push({src:(im.src||'').slice(0,80), w:im.naturalWidth, h:im.naturalHeight}); });
        if(big.length) cInfo.push({sel:c.tagName.toLowerCase()+((c.id)?('#'+c.id):'')+((typeof c.className==='string'&&c.className)?('.'+c.className.split(' ').join('.')):''), n:big.length, sample:big.slice(0,3)});
      }
      out.containers=cInfo;
      return JSON.stringify(out);
    })()`, returnByValue:true});
    const d = JSON.parse(r.result.value);
    console.log('=== iframes ===');
    d.iframes.forEach(f=>console.log('  ['+f.i+'] '+f.src+' | id='+f.id+' cls='+f.cls+' | '+f.w+'x'+f.h));
    console.log('=== 详情标题文本 ===');
    console.log('  '+d.descText);
    d.descImgs.forEach(x=>{ console.log('  标题'+x.title+' 下有 '+x.imgs.length+' 张大图'); x.imgs.forEach(im=>console.log('    '+im.w+'x'+im.h+' '+im.src)); });
    console.log('=== 含图的长图容器 ===');
    d.containers.forEach(c=>{ console.log('  '+c.sel+' ('+c.n+'张)'); c.sample.forEach(s=>console.log('    '+s.w+'x'+s.h+' '+s.src)); });
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
