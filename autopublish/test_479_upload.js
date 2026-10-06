// 测试：欧世艺(9228) 主图上传是否成功 + 下一步是否跳转（验证任务479根因）
const http = require('http');
const PORT = '9228';
const IMGS = [
  'C:\\tmp\\pdd-publish\\task_479\\img_1.jpg',
  'C:\\tmp\\pdd-publish\\task_479\\img_2.jpg',
  'C:\\tmp\\pdd-publish\\task_479\\img_3.jpg',
  'C:\\tmp\\pdd-publish\\task_479\\img_4.jpg',
  'C:\\tmp\\pdd-publish\\task_479\\img_5.jpg',
  'C:\\tmp\\pdd-publish\\task_479\\img_6.jpg',
  'C:\\tmp\\pdd-publish\\task_479\\img_7.jpg',
];
const TITLE = '欧世艺铁艺壁挂镜子客厅玄关沙发背景墙装饰挂件';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{
  const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});
  req.on('error',rej); req.setTimeout(6000,()=>{req.destroy();rej(new Error('HTTP超时'))});
})}
async function conn(wsUrl){
  const ws=new WebSocket(wsUrl);let id=0;const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{
    const mid=++id;p.set(mid,{res,rej});
    const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);
    ws.send(JSON.stringify({id:mid,method:m,params:pa}));
  });
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  return {ws,send};
}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  let g = tabs.filter(t=>t.type==='page').find(t=>/mms\.pinduoduo\.com/.test(t.url||'')) || null;
  let c;
  if(g){ c=await conn(g.webSocketDebuggerUrl); await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{}); }
  else { console.log('无 mms tab'); process.exit(1); }

  // 确保在 goods/category 发布页
  const cur = await ev(c,'location.href');
  console.log('[1] 当前URL:', cur);
  if(!/goods\/category/.test(cur||'')){
    await c.send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
    await sleep(8000);
    console.log('[1] 已导航到 goods/category');
  }

  // 找主图 file input
  const docF = await c.send('DOM.getDocument',{depth:3});
  const qimgF = await c.send('DOM.querySelector',{nodeId:docF.root.nodeId,selector:'input[type="file"]'});
  console.log('[2] 主图 file input:', qimgF && qimgF.nodeId ? '找到' : '未找到');

  // 上传前数量
  const beforeN = await ev(c, `(()=>{const m=(document.body.innerText||'').match(/上传图片\\s*\\((\\d+)\\s*\\//);return m?parseInt(m[1]):-1})()`);
  console.log('[3] 上传前数量:', beforeN);

  if(qimgF && qimgF.nodeId){
    await c.send('DOM.setFileInputFiles',{nodeId:qimgF.nodeId,files:IMGS});
    console.log('[4] setFileInputFiles 已调用');
    // 轮询上传数量
    for(let i=0;i<20;i++){
      await sleep(2000);
      const n = await ev(c, `(()=>{const m=(document.body.innerText||'').match(/上传图片\\s*\\((\\d+)\\s*\\//);return m?parseInt(m[1]):-1})()`);
      console.log('    上传轮询', i+1, ':', n);
      if(n>=7){ console.log('[5] ✅ 上传完成 7 张'); break; }
    }
  }

  // 填标题
  const fillOk = await ev(c, `(()=>{const inp=document.querySelector('input[placeholder*="商品标题组成"]');if(!inp)return 'no input';inp.scrollIntoView({block:"center"});inp.click();inp.focus();return 'ok'})()`);
  console.log('[6] 标题 input:', fillOk);
  if(fillOk==='ok'){ await c.send('Input.insertText',{text:TITLE}); await sleep(500); }
  const titleVal = await ev(c, `(()=>{const inp=document.querySelector('input[placeholder*="商品标题组成"]');return inp?inp.value:'(无)')()`);
  console.log('[7] 标题值:', (titleVal||'').slice(0,30));

  // 点下一步
  console.log('[8] 点「下一步」');
  const pos = await ev(c, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('下一步'));if(!b)return null;b.scrollIntoView({block:"center"});const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)})()`);
  if(!pos){ console.log('    未找到下一步按钮'); }
  else {
    await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pos.x-60,y:pos.y}); await sleep(200);
    await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pos.x,y:pos.y}); await sleep(400);
    await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:pos.x,y:pos.y,button:'left',clickCount:1}); await sleep(150);
    await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pos.x,y:pos.y,button:'left',clickCount:1});
    console.log('    已点击');
    // 等跳转
    for(let i=0;i<5;i++){
      await sleep(3000);
      const h = await ev(c,'location.href');
      console.log('    轮询URL', i+1, ':', h);
      if(/goods_add\/index/.test(h||'')){ console.log('[9] ✅ 已跳转发布页'); break; }
    }
  }

  // 最终状态：有没有拦截提示
  const finalState = await ev(c, `(()=>{
    const t=(document.body.innerText||'').replace(/\\s+/g,' ');
    return JSON.stringify({
      url: location.href,
      hasToast: t.includes('请先') || t.includes('请上传') || t.includes('请填写') || t.includes('请选择'),
      uploadState: (t.match(/上传图片\\s*\\(\\d+\\s*\\/\\d+\\)/)||[''])[0],
      bodyTail: t.slice(-600)
    }, null, 1);
  })()`);
  console.log('[10] 最终状态:');
  console.log(finalState);

  c.ws.close();
})().catch(e=>{ console.log('❌ 异常:', e.message); process.exit(1); });
