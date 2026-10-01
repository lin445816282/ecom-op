// 重新精确诊断 goods/category：顶部店铺名 + 类目搜索框 + 页面状态
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:9234/json`);
    const page = tabs.find(t=>t.type==='page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),5000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Page.enable',{});
    await send('Runtime.enable',{});

    await send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
    await sleep(8000);

    const r = await send('Runtime.evaluate',{expression:`(function(){
      var b = document.body ? document.body.innerText : '';
      var lines = b.split('\\n').map(s=>s.trim()).filter(s=>s.length>0);
      // 顶部前 20 行（含店铺名）
      var top = lines.slice(0, 20);
      // 类目搜索框
      var catInput = document.querySelector('input[placeholder*="分类"]');
      var catInputPh = catInput ? catInput.placeholder : null;
      // 是否有商品标题输入框（=已进入发布页，跳过类目）
      var titleInput = document.querySelector('input[placeholder*="商品标题"]');
      // 是否有类目搜索结果容器
      var catItems = document.querySelectorAll('.choose-category,[class*="searchItem"]').length;
      return JSON.stringify({
        url: location.href.slice(0,70),
        title: document.title,
        top: top,
        catInput: catInputPh,
        hasTitleInput: !!titleInput,
        catItems: catItems
      });
    })()`, returnByValue:true});
    console.log(r.result.value);
    ws.close();
    process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
