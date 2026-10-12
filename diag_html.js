
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    const tabs = await get('http://127.0.0.1:9238/json');
    const page = tabs.find(t=>t.type==='page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Runtime.enable',{}); await send('Page.enable',{});
    const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r&&r.result?r.result.value:undefined);

    await send('Page.navigate',{url:'https://detail.1688.com/offer/874253511813.html'});
    for(let i=0;i<20;i++){await sleep(1000);const f=(await ev('location.href'))||'';if(/detail\.1688\.com\/offer\//.test(f))break;}
    await sleep(3000);

    // 抓 HTML 源码，搜索详情长图 URL（cib.jpg 且 O1CN ID 的特征）
    const r = await ev(`(function(){
      var html = document.documentElement.outerHTML;
      // 找所有 cib.jpg URL（详情长图和主图都是这个格式）
      var urls = [];
      var re = /cbu01\\.alicdn\\.com\\/img\\/ibank\\/O1CN[0-9A-Za-z_!-]+-0-cib\\.jpg/g;
      var m;
      while((m=re.exec(html))!==null){ urls.push(m[0]); }
      // 去重
      urls = [...new Set(urls)];
      // 找 v-detail-k 或 description 相关的数据
      var descData = '';
      var idx = html.indexOf('html-description');
      if(idx>=0) descData = html.slice(idx-200, idx+500);
      return JSON.stringify({cibUrlCount: urls.length, cibUrls: urls.slice(0,40), descData: descData.slice(0,600)});
    })()`);
    const d = JSON.parse(r);
    console.log('HTML 里 cib.jpg URL 数:', d.cibUrlCount);
    d.cibUrls.forEach(u=>console.log('  '+u));
    console.log('=== html-description 附近 ===');
    console.log(d.descData.slice(0,500));
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
