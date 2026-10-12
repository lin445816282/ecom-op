// 精简 e2e：从当前 goods/category 页开始，选类目进发布页 → element.click 运费模板流程
const http = require('http');
function get(u){return new Promise((res,rej)=>{const q=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});q.on('error',rej);q.setTimeout(5000,()=>{q.destroy();rej(new Error('timeout'))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m))}},25000);p.set(mid,{res:(v)=>{clearTimeout(to);res(v)},rej:(e)=>{clearTimeout(to);rej(e)}});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});return{ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r&&r.result&&r.result.value!==undefined)return r.result.value;if(r&&r.exceptionDetails)return 'EXC:'+JSON.stringify(r.exceptionDetails).slice(0,150);return undefined;}
const PORT=process.argv[2]||'9234';
(async()=>{
  try{
    const tabs=await get(`http://127.0.0.1:${PORT}/json`);
    let page=tabs.find(t=>t.type==='page'&&/goods\/category/.test(t.url||''))||tabs.find(t=>t.type==='page'&&/mms\.pinduoduo/.test(t.url||''))||tabs.find(t=>t.type==='page');
    if(!page){console.log('NO_PAGE');return;}
    const c=await conn(page.webSocketDebuggerUrl);
    await c.send('Page.enable',{});await c.send('Runtime.enable',{});

    console.log('当前URL:', await ev(c,'location.href'));

    // 若不在 category 页，导航
    const cur=await ev(c,'location.href');
    if(!/goods\/category/.test(cur||'')){
      await c.send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
      await sleep(6000);
    }

    // 选类目
    const inp=await ev(c,`(()=>{const i=document.querySelector('input[placeholder*="分类"]');if(!i)return 'no_input';i.click();i.focus();return 'ok';})()`);
    console.log('input:', inp);
    if(inp==='ok'){
      await sleep(300);
      await c.send('Input.insertText',{text:'挂钩'});
      await sleep(500);
      await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    }
    await sleep(4000);
    const cat=await ev(c,`(()=>{const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&(e.textContent||'').trim().includes('挂钩')&&(e.textContent||'').trim().includes('>'));if(!el)return 'NO_MATCH';el.click();return (e.textContent||'').trim().slice(0,50);})()`);
    console.log('类目:', cat);
    if(cat==='NO_MATCH'){console.log('类目未匹配');c.ws.close();return;}
    await sleep(2000);
    await ev(c,`(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='确认发布该类商品');if(b)b.click();})()`);
    await sleep(6000);
    console.log('发布页:', await ev(c,'location.href'));

    // element.click 展开
    await ev(c,`(()=>{const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&(e.textContent||'').trim()==='展开修改');if(el)el.click();})()`);
    await sleep(2000);
    console.log('box:', await ev(c,`(()=>{const b=document.querySelector('#cost_template_id');return b?b.style.display:'no'})()`));

    // element.click 点其他模板 label
    await ev(c,`(()=>{const l=[...document.querySelectorAll('#cost_template_id [data-testid="beast-core-radio"]')].find(e=>(e.textContent||'').trim()==='其他模板');if(l)l.click();})()`);
    await sleep(2500);
    console.log('radio:', await ev(c,`(()=>{const rs=[...document.querySelectorAll('#cost_template_id [data-testid="beast-core-radio"]')];return JSON.stringify(rs.map(r=>(r.textContent||'').trim().slice(0,22)+'='+r.getAttribute('data-checked')));})()`));
    console.log('select:', await ev(c,`(()=>{const s=document.querySelector('[id="service.cost_template_id"] [data-testid="beast-core-select"], #cost_template_id [data-testid="beast-core-select"]');if(!s)return 'no_select';const h=s.querySelector('[data-testid="beast-core-select-header"]');return h?(h.textContent||'').trim().slice(0,40):'(无)';})()`));

    // element.click 点 select，dump 下拉
    await ev(c,`(()=>{const s=document.querySelector('[id="service.cost_template_id"] [data-testid="beast-core-select"], #cost_template_id [data-testid="beast-core-select"]');if(s){const h=s.querySelector('[data-testid="beast-core-select-header"]')||s;h.scrollIntoView({block:'center'});h.click();}})()`);
    await sleep(3000);
    console.log('下拉:', await ev(c,`(()=>{const leaves=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&/多仓|按重|按件|包邮|模板|不配送|海南|新疆|西藏/.test(e.textContent||''));return JSON.stringify([...new Set(leaves.map(e=>(e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,50)))].slice(0,40));})()`));

    c.ws.close();
  }catch(e){console.log('ERR',e.message);}
})();
