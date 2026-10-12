// 深挖：dump「展开修改」按钮 HTML + template-box 结构，测试 JS 强制展开后 radio 能否点击
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
    if(!page){console.log('NO_PAGE(需先跑 diag_freight_publish 进发布页)');return;}
    console.log('TAB', page.url.slice(0,80));
    const c=await conn(page.webSocketDebuggerUrl);
    await c.send('Page.enable',{});await c.send('Runtime.enable',{});

    // 1) dump「展开修改」按钮 HTML 结构
    const btnHtml=await ev(c,`(()=>{
      const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&(e.textContent||'').trim()==='展开修改');
      if(!el) return 'no_expand_btn';
      let html=el.outerHTML.slice(0,300);
      let chain=[];
      let p=el;
      for(let i=0;i<4&&p;i++){ chain.push(p.tagName+'.'+(p.className&&typeof p.className==='string'?p.className.split(' ')[0]:'')+'|display='+(p.style?p.style.display:'?')); p=p.parentElement; }
      return JSON.stringify({html, chain});
    })()`);
    console.log('BTN_HTML', btnHtml);

    // 2) dump template-box 完整结构
    const boxHtml=await ev(c,`(()=>{
      const box=document.querySelector('#cost_template_id');
      if(!box) return 'no_box';
      return JSON.stringify({cls:box.className, display:box.style.display, inner:box.innerHTML.slice(0,1500)});
    })()`);
    console.log('BOX_HTML', boxHtml);

    // 3) JS 强制展开 template-box，看 radio 是否可见 + 能否点击「其他模板」
    const forceExpand=await ev(c,`(()=>{
      const box=document.querySelector('#cost_template_id');
      if(box){ box.style.display='block'; box.style.height='auto'; }
      const line=document.querySelector('.goods-basic-line.template');
      if(line){ line.style.height='auto'; line.style.overflow='visible'; }
      // 找「其他模板」radio 的可见状态
      const label=[...document.querySelectorAll('#cost_template_id [data-testid="beast-core-radio"]')].find(e=>(e.textContent||'').trim()==='其他模板');
      if(!label) return 'no_other_label';
      const rc=label.getBoundingClientRect();
      return JSON.stringify({found:true, x:Math.round(rc.x+rc.width/2), y:Math.round(rc.y+rc.height/2), w:Math.round(rc.width), h:Math.round(rc.height), checked:label.getAttribute('data-checked')});
    })()`);
    console.log('FORCE_EXPAND', forceExpand);

    // 4) 如果 radio 可见，真实鼠标点击「其他模板」
    let fp={};
    try{ fp=JSON.parse(forceExpand||'{}'); }catch(e){}
    if(fp.found && fp.w>0 && fp.h>0){
      await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:fp.x-40,y:fp.y});
      await sleep(150);
      await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:fp.x,y:fp.y});
      await sleep(300);
      await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:fp.x,y:fp.y,button:'left',clickCount:1});
      await sleep(80);
      await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:fp.x,y:fp.y,button:'left',clickCount:1});
      await sleep(2000);
      const after=await ev(c,`(()=>{
        const label=[...document.querySelectorAll('#cost_template_id [data-testid="beast-core-radio"]')].find(e=>(e.textContent||'').trim()==='其他模板');
        const sel=document.querySelector('[id="service.cost_template_id"] [data-testid="beast-core-select"], #cost_template_id [data-testid="beast-core-select"]');
        return JSON.stringify({其他模板checked:label?label.getAttribute('data-checked'):'no', select_rendered:sel?Math.round(sel.getBoundingClientRect().height):0});
      })()`);
      console.log('AFTER_CLICK_OTHER', after);
    } else {
      console.log('radio 不可见或未找到，跳过点击');
    }

    c.ws.close();
  }catch(e){console.log('ERR',e.message);}
})();
