// 诊断：进发布页（花盆类目）→ dump 商品属性各字段的 select 选项 + radio 选项
const http = require('http');
function get(u){return new Promise((res,rej)=>{const q=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});q.on('error',rej);q.setTimeout(5000,()=>{q.destroy();rej(new Error('timeout'))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m))}},30000);p.set(mid,{res:(v)=>{clearTimeout(to);res(v)},rej:(e)=>{clearTimeout(to);rej(e)}});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});return{ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r&&r.result&&r.result.value!==undefined)return r.result.value;if(r&&r.exceptionDetails)return 'EXC:'+JSON.stringify(r.exceptionDetails).slice(0,150);return undefined;}
const PORT=process.argv[2]||'9234';
(async()=>{
  try{
    const tabs=await get(`http://127.0.0.1:${PORT}/json`);
    let page=tabs.find(t=>t.type==='page'&&/mms\.pinduoduo/.test(t.url||''))||tabs.find(t=>t.type==='page');
    if(!page){console.log('NO_PAGE');return;}
    const c=await conn(page.webSocketDebuggerUrl);
    await c.send('Page.enable',{});await c.send('Runtime.enable',{});await c.send('DOM.enable',{});

    // 1) 进发布页（花盆类目）
    await c.send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
    await sleep(6000);
    await ev(c,`(()=>{const inp=document.querySelector('input[placeholder*="分类"]');if(inp){inp.click();inp.focus();}})()`);
    await sleep(300);
    await c.send('Input.insertText',{text:'花盆'});
    await sleep(500);
    await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await sleep(4000);
    const cat=await ev(c,`(()=>{
      const _norm=s=>String(s||'').replace(/[＞﹥]/g,'>').trim();
      const leaves=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0);
      const el=leaves.find(e=>{const t=_norm(e.textContent||'');return t.includes('花盆')&&t.includes('>')&&t.length<60;});
      if(!el) return 'NO_MATCH:'+leaves.filter(e=>(e.textContent||'').includes('花盆')).map(e=>(e.textContent||'').trim().slice(0,40)).slice(0,10).join('|');
      el.click(); return _norm(el.textContent||'').slice(0,50);
    })()`);
    console.log('类目:', cat);
    if(cat.startsWith('NO_MATCH')){console.log('类目未匹配');c.ws.close();return;}
    await sleep(2000);
    await ev(c,`(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='确认发布该类商品');if(b)b.click();})()`);
    await sleep(6000);
    console.log('发布页:', await ev(c,'location.href'));

    // 2) dump 属性字段 + 点开 select 看选项
    const fields=await ev(c,`(()=>{
      const labels=[...document.querySelectorAll('label')].filter(e=>(e.textContent||'').trim()&&e.getBoundingClientRect().width>0);
      const attrLabels=labels.filter(e=>/材质|风格|类型|二手|定制|预售|品牌|特性|产地/.test(e.textContent||''));
      return JSON.stringify([...new Set(attrLabels.map(e=>(e.textContent||'').trim()))]);
    })()`);
    console.log('属性字段:', fields);

    // 点开「重要材质」select
    for(const ln of ['重要材质','风格']){
      const clk=await ev(c,`(()=>{
        const lbl=[...document.querySelectorAll('label')].find(e=>(e.textContent||'').trim()===${JSON.stringify(ln)}&&e.getBoundingClientRect().width>0);
        if(!lbl) return 'no_label';
        let item=lbl.parentElement;
        for(let i=0;i<4&&item;i++){ if(item.querySelector('[data-testid="beast-core-select"]')) break; item=item.parentElement; }
        const sel=item?item.querySelector('[data-testid="beast-core-select"]'):null;
        if(!sel) return 'no_select';
        const head=sel.querySelector('[data-testid="beast-core-select-header"]')||sel;
        head.scrollIntoView({block:'center'});
        head.click();
        return 'ok';
      })()`);
      console.log(ln, '点开:', clk);
      if(clk==='ok'){
        await sleep(2500);
        const opts=await ev(c,`(()=>{
          const leaves=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0);
          const texts=[...new Set(leaves.map(e=>(e.textContent||'').trim()).filter(t=>t&&t.length>=1&&t.length<15&&/[\u4e00-\u9fa5]/.test(t)))].slice(0,50);
          return JSON.stringify(texts);
        })()`);
        console.log(ln, '选项 =>', opts);
        await ev(c,`document.body.click()`);
        await sleep(800);
      }
    }

    // 3) dump radio 选项（商品类型/是否二手/是否定制/是否预售）
    const radio=await ev(c,`(()=>{
      const names=['商品类型','是否二手','是否定制','是否预售'];
      const out={};
      for(const name of names){
        const lbl=[...document.querySelectorAll('label')].find(e=>(e.textContent||'').trim()===name&&e.getBoundingClientRect().width>0);
        if(!lbl){ out[name]='(无label)'; continue; }
        let item=lbl.parentElement;
        for(let i=0;i<4&&item;i++){ if(item.querySelector('[data-testid="beast-core-radio"]')) break; item=item.parentElement; }
        const radios=item?[...item.querySelectorAll('[data-testid="beast-core-radio"]')]:[];
        out[name]=radios.map(r=>(r.textContent||'').trim().slice(0,12)+'='+r.getAttribute('data-checked'));
      }
      return JSON.stringify(out);
    })()`);
    console.log('RADIO', radio);

    c.ws.close();
  }catch(e){console.log('ERR',e.message);}
})();
