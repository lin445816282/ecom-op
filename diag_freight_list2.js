// 精确 dump：点 select 后，完整列出下拉面板里的所有模板选项
const http = require('http');
function get(u){return new Promise((res,rej)=>{const q=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});q.on('error',rej);q.setTimeout(5000,()=>{q.destroy();rej(new Error('timeout'))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m))}},30000);p.set(mid,{res:(v)=>{clearTimeout(to);res(v)},rej:(e)=>{clearTimeout(to);rej(e)}});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});return{ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r&&r.result&&r.result.value!==undefined)return r.result.value;if(r&&r.exceptionDetails)return 'EXC:'+JSON.stringify(r.exceptionDetails).slice(0,150);return undefined;}
const PORT=process.argv[2]||'9234';
(async()=>{
  try{
    const tabs=await get(`http://127.0.0.1:${PORT}/json`);
    let page=tabs.find(t=>t.type==='page'&&/goods_add\/index/.test(t.url||''))||tabs.find(t=>t.type==='page'&&/mms\.pinduoduo/.test(t.url||''));
    if(!page){console.log('NO_PAGE');return;}
    const c=await conn(page.webSocketDebuggerUrl);
    await c.send('Page.enable',{});await c.send('Runtime.enable',{});

    // 点 select
    const sc=await ev(c,`(()=>{
      const s=document.querySelector('[id="service.cost_template_id"] [data-testid="beast-core-select"], #cost_template_id [data-testid="beast-core-select"]');
      if(!s) return 'no_select';
      const head=s.querySelector('[data-testid="beast-core-select-header"]')||s;
      head.scrollIntoView({block:'center'});
      const rc=head.getBoundingClientRect();
      return JSON.stringify({x:Math.round(rc.x+rc.width/2),y:Math.round(rc.y+rc.height/2)});
    })()`);
    if(sc!=='no_select'){
      const ep=JSON.parse(sc);
      await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:ep.x,y:ep.y,button:'left',clickCount:1});await sleep(80);
      await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:ep.x,y:ep.y,button:'left',clickCount:1});
    }
    await sleep(3000);
    // dump 所有下拉 option 类元素（beast select 选项常用 class）
    const opts=await ev(c,`(()=>{
      const sel=[...document.querySelectorAll('*')].filter(e=>/option|Option|menuItem|MenuItem|listItem|ListItem/.test(e.className||'')&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0);
      const texts=[...new Set(sel.map(e=>(e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,60)))].filter(t=>t&&t.length>2);
      return JSON.stringify(texts.slice(0,50));
    })()`);
    console.log('OPTION_CLASS', opts);
    // 兜底：找所有「多仓」或「按重」或「模板」相关可见叶子（完整）
    const all=await ev(c,`(()=>{
      const leaves=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0);
      const tpl=leaves.filter(e=>/多仓|按重|按件|包邮|运费模板|不配送/.test(e.textContent||'')).map(e=>(e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,60));
      return JSON.stringify([...new Set(tpl)].slice(0,50));
    })()`);
    console.log('ALL_TEMPLATE_LEAVES', all);
    c.ws.close();
  }catch(e){console.log('ERR',e.message);}
})();
