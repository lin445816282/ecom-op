
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
    // 导航衣柜
    await send('Page.navigate',{url:'https://detail.1688.com/offer/874253511813.html'});
    let final='';
    for(let i=0;i<20;i++){await sleep(1000);final=(await ev('location.href'))||'';if(/detail\.1688\.com\/offer\//.test(final))break;}
    await sleep(2000);
    // 滚动到底 6 次
    for(let i=0;i<6;i++){ await ev('window.scrollTo(0,document.body.scrollHeight)'); await sleep(1200); }
    // 抓所有 img（含 lazy naturalWidth=0），找长图特征 + 详情区 DOM
    const r = await ev(`(function(){
      var out={longImgs:[], detailDom:[], allImgSrcs:[]};
      var imgs=document.querySelectorAll('img');
      for(var i=0;i<imgs.length;i++){
        var im=imgs[i]; var src=im.src||'';
        if(!src||src.startsWith('data:')||!src.includes('alicdn'))continue;
        var nw=im.naturalWidth||0, nh=im.naturalHeight||0;
        out.allImgSrcs.push({nw:nw,nh:nh,src:src.slice(0,100)});
        // 找长图：naturalWidth>0 且 高>宽*1.3，或 URL 含长图特征
        if((nh>nw*1.3&&nw>200)||/750x|800x|1000x|_sum|detail|desc/i.test(src)){
          var chain=[]; var el=im;
          for(var k=0;k<6&&el;k++){ chain.push(el.tagName.toLowerCase()+((typeof el.className==='string'&&el.className)?('.'+el.className.split(' ').join('.')):'')); el=el.parentElement; }
          out.longImgs.push({nw:nw,nh:nh,src:src.slice(0,100),chain:chain.join(' > ')});
        }
      }
      // 找含"详情"的可点击元素/容器
      var all=document.querySelectorAll('*');
      for(var j=0;j<all.length;j++){
        var e=all[j]; if(e.children.length>0)continue;
        var t=(e.textContent||'').trim();
        if(t==='商品详情'||t==='图文详情'||t==='详情描述'||t==='商品细节'){
          var chain=[]; var el=e;
          for(var k=0;k<5&&el;k++){ chain.push(el.tagName.toLowerCase()+((typeof el.className==='string'&&el.className)?('.'+el.className.split(' ').join('.')):'')); el=el.parentElement; }
          out.detailDom.push({tag:e.tagName,text:t,chain:chain.join(' > ')});
        }
      }
      return JSON.stringify(out);
    })()`);
    const d=JSON.parse(r);
    console.log('=== 长图（可能详情图）===', d.longImgs.length);
    d.longImgs.forEach(x=>console.log('  '+x.nw+'x'+x.nh+' | '+x.src));
    d.longImgs.slice(0,3).forEach(x=>console.log('     dom: '+x.chain));
    console.log('=== 详情相关元素 ===');
    d.detailDom.forEach(x=>console.log('  '+JSON.stringify(x)));
    console.log('=== 所有图尺寸分布 ===');
    var dist={};
    d.allImgSrcs.forEach(x=>{var k=x.nw+'x'+x.nh;dist[k]=(dist[k]||0)+1;});
    Object.keys(dist).sort().forEach(k=>console.log('  '+k+': '+dist[k]+'张'));
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
