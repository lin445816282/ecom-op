// 抓取拼多多商品数据(sycm/goods_effect)，输出原始数据（含字体加密的私有区字符）+ 字体URL
// 用法：node scrape_goods_effect.js <端口> <输出文件路径>
const http = require('http');
const fs = require('fs');
const PORT = process.argv[2] || '9232';
const OUT = process.argv[3] || 'C:\\tmp\\goods_effect_raw.json';
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})}).on('error',rej)})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function conn(wsUrl){
  const ws=new WebSocket(wsUrl);let id=0;const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  return {ws,send};
}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r&&r.result&&r.result.value!==undefined)return r.result.value;if(r&&r.exceptionDetails)return 'EXC';return undefined;}
(async()=>{
  const tabs=await get(`http://127.0.0.1:${PORT}/json`);
  let g=tabs.find(t=>t.type==='page'&&/sycm\/goods_effect/.test(t.url))||tabs.find(t=>t.type==='page'&&/mms\.pinduoduo/.test(t.url))||tabs.find(t=>t.type==='page');
  const c=await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{});await c.send('Runtime.enable',{});
  // 若不在 goods_effect 页，先导航
  const cur = await ev(c,'location.href');
  if(!/goods_effect/.test(cur)){
    await c.send('Page.navigate',{url:'https://mms.pinduoduo.com/home/'});
    await sleep(6000);
    await c.send('Page.navigate',{url:'https://mms.pinduoduo.com/sycm/goods_data/overview'});
    await sleep(12000);
  }
  // 滚动加载全部商品
  await ev(c,`(async()=>{ let last=0; for(let i=0;i<40;i++){ window.scrollTo(0, document.body.scrollHeight); await new Promise(r=>setTimeout(r,1000)); const h=document.body.scrollHeight; if(h===last) break; last=h; } return 'ok'; })()`);
  await sleep(2000);
  // 提取 spider-font 的 URL（数字实际用的字体，font-family 含 spider）
  const fontUrl = await ev(c,`(()=>{
    for(const sheet of document.styleSheets){
      try{ for(const rule of sheet.cssRules){ const t=rule.cssText||'';
        const fm=t.match(/font-family:\\s*([^;]+);/);
        if(fm && /spider/i.test(fm[1])){ const m=t.match(/url\\(["']?([^"')]+)["']?\\)/); if(m && !m[1].startsWith('data:')) return m[1]; }
      } }catch(e){}
    }
    return '';
  })()`);
  // 提取每行数据
  const rows = await ev(c,`(()=>{
    const trs=[...document.querySelectorAll('tbody tr')];
    const out=[];
    for(const tr of trs){
      const tds=[...tr.querySelectorAll('td')];
      if(tds.length<9) continue;
      // goods_id: 从 list_id 或标题附近的 "ID:xxx"
      const idHtml = tr.innerHTML;
      const idm = idHtml.match(/ID[:：]\\s*(\\d+)/);
      const gid = idm?idm[1]:'';
      // 商品名
      const titleEl = tr.querySelector('[class*="list_desc"] [data-testid="beast-core-ellipsis"], [class*="list_desc"] .beast-core-ellipsis-1');
      const title = titleEl?(titleEl.textContent||'').trim():'';
      // 数字字段：用 metric 定位，提取 __spider_font 的原始私有区字符
      const getMetric = (m) => {
        const td = tr.querySelector('[data-tracking-params*="metric='+m+'"]');
        if(!td) return '';
        const sf = td.querySelector('[class*="__spider_font"], [class*="spider_font"]');
        return sf?(sf.textContent||'').trim():'';
      };
      out.push({
        gid, title,
        visitor: getMetric(1),    // 商品访客数
        page_view: getMetric(2),  // 商品浏览量
        pay_amount: getMetric(3), // 成交金额
        pay_qty: getMetric(4),    // 成交件数
        pay_order: getMetric(5),  // 成交订单数
        pay_buyer: getMetric(6),  // 成交买家数
        pay_rate: getMetric(7),   // 成交转化率
        collect: getMetric(8),    // 商品收藏用户数
      });
    }
    return JSON.stringify(out);
  })()`);
  const result = JSON.stringify({fontUrl, rows: JSON.parse(rows||'[]'), ts: new Date().toISOString()});
  fs.writeFileSync(OUT, result);
  console.log('已抓取', JSON.parse(rows||'[]').length, '行');
  console.log('字体URL:', fontUrl);
  console.log('输出:', OUT);
  c.ws.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
