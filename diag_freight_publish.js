// 诊断：走「发布新商品→选类目→进发布页」，dump 运费模板字段真实 DOM
// 关键：点「展开修改」前后对比 .template-box 展开状态 + 「其他模板」radio 是否渲染
const http = require('http');
function get(u){return new Promise((res,rej)=>{const q=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});q.on('error',rej);q.setTimeout(5000,()=>{q.destroy();rej(new Error('timeout'))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m))}},30000);p.set(mid,{res:(v)=>{clearTimeout(to);res(v)},rej:(e)=>{clearTimeout(to);rej(e)}});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});return{ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r&&r.result&&r.result.value!==undefined)return r.result.value;if(r&&r.exceptionDetails)return 'EXC:'+JSON.stringify(r.exceptionDetails).slice(0,150);return undefined;}
const PORT=process.argv[2]||'9234';
const KW=process.argv[3]||'挂钩';
(async()=>{
  try{
    const tabs=await get(`http://127.0.0.1:${PORT}/json`);
    let page=tabs.find(t=>t.type==='page'&&/mms\.pinduoduo/.test(t.url||''))||tabs.find(t=>t.type==='page'&&/blank/.test(t.url||''))||tabs.find(t=>t.type==='page');
    if(!page){console.log('NO_PAGE');return;}
    const c=await conn(page.webSocketDebuggerUrl);
    await c.send('Page.enable',{});await c.send('Runtime.enable',{});await c.send('DOM.enable',{});

    // 1) 导航类目页
    await c.send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
    await sleep(6000);

    // 2) 搜索类目（Input.insertText + Enter）
    const focus=await ev(c,`(()=>{const inp=document.querySelector('input[placeholder*="分类"]');if(!inp)return 'no_input';inp.scrollIntoView({block:'center'});inp.click();inp.focus();return 'ok'})()`);
    console.log('FOCUS', focus);
    if(focus==='ok'){
      await sleep(300);
      await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17});
      await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65});
      await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65});
      await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17});
      await c.send('Input.insertText',{text:KW});
      await sleep(500);
      await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    }
    await sleep(4000);
    // 3) 选匹配类目（含「挂钩」的可见叶子）
    const selCat=await ev(c,`(()=>{
      const cands=[...document.querySelectorAll('.choose-category,[class*="searchItem"]')];
      let list=cands;
      if(!cands.length){ list=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&(e.textContent||'').trim().includes('挂钩')); }
      const el=list.find(e=>(e.textContent||'').trim().includes('挂钩')&&(e.textContent||'').trim().includes('>'));
      if(!el) return 'NO_MATCH';
      el.scrollIntoView({block:'center'});
      el.click();
      return (el.textContent||'').trim().slice(0,60);
    })()`);
    console.log('SEL_CAT', selCat);
    if(selCat==='NO_MATCH'){ console.log('类目未匹配，终止'); c.ws.close(); return; }
    await sleep(2000);

    // 4) 点「确认发布该类商品」
    const confirm=await ev(c,`(()=>{const btn=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='确认发布该类商品');if(btn){btn.click();return 'ok';}return 'no confirm'})()`);
    console.log('CONFIRM', confirm);
    await sleep(6000);
    const href=await ev(c,'location.href');
    console.log('PUBLISH_PAGE', href);
    if(!/goods_add\/index/.test(href||'')){ console.log('未进发布页，终止'); c.ws.close(); return; }

    // 5) dump 运费模板字段初始状态
    const dump=async(label)=>{
      const d=await ev(c,`(()=>{
        const o={label:${JSON.stringify(label)}};
        o.展开修改=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim()==='展开修改').map(e=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}});
        o.其他模板=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim()==='其他模板'&&e.getBoundingClientRect().width>0).length;
        o.推荐默认=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim().includes('推荐默认')).length;
        const box=document.querySelector('#cost_template_id');
        o.cost_template_id=box?{display:box.style.display||'(未内联)', cls:box.className, childCount:box.children.length}:null;
        const tb=document.querySelector('.template-box');
        o.template_box=tb?{display:getComputedStyle(tb).display, cls:tb.className}:null;
        const radios=[...document.querySelectorAll('#cost_template_id [data-testid="beast-core-radio"]')];
        o.radio_count=radios.length;
        o.radio_texts=radios.map(r=>(r.textContent||'').trim().slice(0,20)+' checked='+r.getAttribute('data-checked'));
        const sels=[...document.querySelectorAll('[data-testid="beast-core-select"]')].filter(s=>s.getBoundingClientRect().width>0);
        o.select_count=sels.length;
        o.select_headers=sels.map(s=>{const h=s.querySelector('[data-testid="beast-core-select-header"]');return h?((h.textContent||'').trim().slice(0,30)):'(无header)'});
        // 含「运费模板」的可见文本
        const frag=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/运费模板/.test(e.textContent||'')&&e.getBoundingClientRect().width>0).map(e=>(e.textContent||'').trim().slice(0,40));
        o.freight_frag=[...new Set(frag)].slice(0,10);
        return JSON.stringify(o);
      })()`);
      console.log('DUMP', d);
    };
    await dump('初始(展开修改前)');

    // 6) 点「展开修改」（第一个）
    const expand=await ev(c,`(()=>{
      const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&(e.textContent||'').trim()==='展开修改');
      if(!el) return 'no_expand';
      el.scrollIntoView({block:'center'});
      const rc=el.getBoundingClientRect();
      return JSON.stringify({x:Math.round(rc.x+rc.width/2), y:Math.round(rc.y+rc.height/2)});
    })()`);
    console.log('EXPAND_BTN', expand);
    if(expand!=='no_expand'){
      const ep=JSON.parse(expand);
      await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:ep.x-40,y:ep.y});
      await sleep(150);
      await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:ep.x,y:ep.y});
      await sleep(300);
      await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:ep.x,y:ep.y,button:'left',clickCount:1});
      await sleep(80);
      await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:ep.x,y:ep.y,button:'left',clickCount:1});
    }
    await sleep(2500);
    await dump('点展开修改后(2.5s)');
    await sleep(2500);
    await dump('点展开修改后(5s)');

    c.ws.close();
  }catch(e){console.log('ERR',e.message);}
})();
