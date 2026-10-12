// 测试：Node 里 MD5 sign + https 请求 mtop 接口拉商品
const http = require('http');
const https = require('https');
const crypto = require('crypto');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})}).on('error',rej)})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const PREFIX = process.argv[2] || 'chidangy';
  const PORT = process.argv[3] || '9238';
  const tabs=await get(`http://127.0.0.1:${PORT}/json`);
  if(!tabs || !tabs.length){ console.log(JSON.stringify({error:'CDP无实例'})); process.exit(1); }
  const g=tabs.find(t=>t.type==='page'&&/1688/.test(t.url))||tabs.find(t=>t.type==='page');
  const ws=new WebSocket(g.webSocketDebuggerUrl);
  let id=0;const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r&&r.result?r.result.value:undefined);
  await send('Page.enable',{}); await send('Runtime.enable',{});
  await send('Page.navigate',{url:`https://${PREFIX}.1688.com/page/offerlist.htm`});
  for(let i=0;i<15;i++){await sleep(1000);const f=await ev('location.href');if(/offerlist/.test(f||''))break;}
  await sleep(3000);
  const info = JSON.parse(await ev(`(()=>{
    const token = (document.cookie.match(/_m_h5_tk=([^_]+)/)||[])[1] || '';
    const memberId = (window.shopPageDataApi||'').match(/sellerMemberId=([^&]+)/)?.[1] || 'b2b-33548186670ae2b';
    return JSON.stringify({token, memberId, cookie: document.cookie});
  })()`));
  const token = info.token;
  const memberId = info.memberId;
  const t = Date.now();
  const appKey = '12574478';
  const params = JSON.stringify({memberId, appdata:{sortType:'wangpu_score',sellerRecommendFilter:false,mixFilter:false,tradenumFilter:false,quantityBegin:null,pageNum:1,count:30}});
  const data = JSON.stringify({componentKey:'Wp_pc_common_offerlist', params});
  const sign = crypto.createHash('md5').update(token + '&' + t + '&' + appKey + '&' + data).digest('hex');
  const body = 'data=' + encodeURIComponent(data);
  const url = 'https://h5api.m.1688.com/h5/mtop.alibaba.alisite.cbu.server.ModuleAsyncService/1.0/?jsv=2.7.5&appKey='+appKey+'&t='+t+'&sign='+sign+'&api=mtop.alibaba.alisite.cbu.server.ModuleAsyncService&v=1.0&type=json&valueType=string&dataType=jsonp&timeout=10000';
  const resp = await new Promise((res,rej)=>{
    const req = https.request(url, {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body),'Cookie':info.cookie,'User-Agent':'Mozilla/5.0','Referer':'https://'+PREFIX+'.1688.com/'}}, (r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res({status:r.statusCode, body:d}));});
    req.on('error',rej); req.write(body); req.end();
  });
  console.log(JSON.stringify({sign, status:resp.status, head:resp.body.slice(0,1000)}, null, 1));
  process.exit(0);
})().catch(e=>{console.log(JSON.stringify({error:e.message}));process.exit(1);});
