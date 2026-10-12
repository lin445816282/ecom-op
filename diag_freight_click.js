// 测试：找到能真正「展开 template-box + 选中其他模板 radio」的点击方式
const http = require('http');
function get(u){return new Promise((res,rej)=>{const q=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});q.on('error',rej);q.setTimeout(5000,()=>{q.destroy();rej(new Error('timeout'))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m))}},30000);p.set(mid,{res:(v)=>{clearTimeout(to);res(v)},rej:(e)=>{clearTimeout(to);rej(e)}});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});return{ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r&&r.result&&r.result.value!==undefined)return r.result.value;if(r&&r.exceptionDetails)return 'EXC:'+JSON.stringify(r.exceptionDetails).slice(0,150);return undefined;}
const PORT=process.argv[2]||'9234';
const boxState=()=>`(()=>{const box=document.querySelector('#cost_template_id');const other=[...document.querySelectorAll('#cost_template_id [data-testid="beast-core-radio"]')].find(e=>(e.textContent||'').trim()==='其他模板');return JSON.stringify({boxDisplay:box?box.style.display:'no_box', otherChecked:other?other.getAttribute('data-checked'):'no'});})()`;
(async()=>{
  try{
    const tabs=await get(`http://127.0.0.1:${PORT}/json`);
    let page=tabs.find(t=>t.type==='page'&&/goods_add\/index/.test(t.url||''))||tabs.find(t=>t.type==='page'&&/mms\.pinduoduo/.test(t.url||''));
    if(!page){console.log('NO_PAGE');return;}
    const c=await conn(page.webSocketDebuggerUrl);
    await c.send('Page.enable',{});await c.send('Runtime.enable',{});

    // 测试1：element.click() 点「展开修改」
    console.log('=== 测试1: element.click() 点展开修改 ===');
    const t1=await ev(c,`(()=>{
      const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&(e.textContent||'').trim()==='展开修改');
      if(!el) return 'no_btn';
      el.click();
      return 'clicked';
    })()`);
    console.log('click()', t1);
    await sleep(2000);
    console.log('state', await ev(c,boxState()));

    // 测试2：dispatchMouseEvent 真实点击「展开修改」
    console.log('=== 测试2: dispatchMouseEvent 点展开修改 ===');
    const t2=await ev(c,`(()=>{
      const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&(e.textContent||'').trim()==='展开修改');
      if(!el) return 'no_btn';
      el.scrollIntoView({block:'center'});
      const rc=el.getBoundingClientRect();
      return JSON.stringify({x:Math.round(rc.x+rc.width/2),y:Math.round(rc.y+rc.height/2)});
    })()`);
    console.log('btn coord', t2);
    if(t2!=='no_btn'){
      const ep=JSON.parse(t2);
      await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:ep.x-40,y:ep.y});await sleep(150);
      await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:ep.x,y:ep.y});await sleep(300);
      await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:ep.x,y:ep.y,button:'left',clickCount:1});await sleep(80);
      await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:ep.x,y:ep.y,button:'left',clickCount:1});
    }
    await sleep(2000);
    console.log('state', await ev(c,boxState()));

    // 测试3：JS 强制展开 + 找 radio 的真实 input 元素 + native setter 设 checked + change 事件
    console.log('=== 测试3: JS强制展开 + native setter 设 radio ===');
    const t3=await ev(c,`(()=>{
      const box=document.querySelector('#cost_template_id');
      if(box){ box.style.display='block'; box.style.height='auto'; }
      const line=document.querySelector('.goods-basic-line.template');
      if(line){ line.style.height='auto'; line.style.overflow='visible'; }
      const label=[...document.querySelectorAll('#cost_template_id [data-testid="beast-core-radio"]')].find(e=>(e.textContent||'').trim()==='其他模板');
      if(!label) return 'no_other';
      const input=label.querySelector('input[type="radio"]');
      if(!input) return 'no_input';
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'checked').set;
      setter.call(input,true);
      input.dispatchEvent(new Event('click',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
      return JSON.stringify({inputFound:true, checked:input.checked, dataChecked:label.getAttribute('data-checked')});
    })()`);
    console.log('native setter', t3);
    await sleep(2000);
    console.log('state', await ev(c,boxState()));

    // 测试4：检查是否有 React fiber 可操作，dump radio input 结构
    console.log('=== 测试4: dump radio label 结构 ===');
    const t4=await ev(c,`(()=>{
      const label=[...document.querySelectorAll('#cost_template_id [data-testid="beast-core-radio"]')].find(e=>(e.textContent||'').trim()==='其他模板');
      if(!label) return 'no_other';
      const input=label.querySelector('input');
      return JSON.stringify({labelHtml:label.outerHTML.slice(0,400), hasInput:!!input, inputType:input?input.type:'no'});
    })()`);
    console.log(t4);

    c.ws.close();
  }catch(e){console.log('ERR',e.message);}
})();
