// 验证：选中「其他模板」后，运费模板 select 是否渲染 + 下拉是否有「多仓」模板
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

    // 当前状态：确保 box 展开 + 其他模板选中（若上一脚本已做，保持）
    const st=await ev(c,`(()=>{
      const box=document.querySelector('#cost_template_id');
      if(box && box.style.display==='none'){ box.style.display='block'; }
      const other=[...document.querySelectorAll('#cost_template_id [data-testid="beast-core-radio"]')].find(e=>(e.textContent||'').trim()==='其他模板');
      return JSON.stringify({box:box?box.style.display:'no', other:other?other.getAttribute('data-checked'):'no'});
    })()`);
    console.log('STATE', st);

    // 1) 找「运费模板」的 select（service.cost_template_id）
    const selInfo=await ev(c,`(()=>{
      const sels=[...document.querySelectorAll('[data-testid="beast-core-select"]')].filter(s=>s.getBoundingClientRect().width>0);
      const tpl=sels.map(s=>{
        const fitem=s.closest('[data-testid="beast-core-form-item"]');
        const id=fitem?fitem.id:'';
        const h=s.querySelector('[data-testid="beast-core-select-header"]');
        const hr=h?h.getBoundingClientRect():null;
        return {id, text:h?(h.textContent||'').trim().slice(0,30):'', x:hr?Math.round(hr.x+hr.width/2):0, y:hr?Math.round(hr.y+hr.height/2):0};
      });
      return JSON.stringify(tpl.filter(t=>t.id.includes('cost_template')||t.id.includes('template')));
    })()`);
    console.log('TEMPLATE_SELECT', selInfo);

    // 2) 找 service.cost_template_id 的 select，真实点击展开下拉
    const clickRes=await ev(c,`(()=>{
      const sel=document.querySelector('[id="service.cost_template_id"] [data-testid="beast-core-select"], #cost_template_id [data-testid="beast-core-select"]');
      if(!sel) return 'no_select';
      const head=sel.querySelector('[data-testid="beast-core-select-header"]')||sel;
      head.scrollIntoView({block:'center'});
      const rc=head.getBoundingClientRect();
      return JSON.stringify({x:Math.round(rc.x+rc.width/2),y:Math.round(rc.y+rc.height/2)});
    })()`);
    console.log('SELECT_CLICK', clickRes);
    if(clickRes!=='no_select'){
      const ep=JSON.parse(clickRes);
      await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:ep.x-40,y:ep.y});await sleep(150);
      await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:ep.x,y:ep.y});await sleep(300);
      await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:ep.x,y:ep.y,button:'left',clickCount:1});await sleep(80);
      await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:ep.x,y:ep.y,button:'left',clickCount:1});
    }
    await sleep(2500);
    // 3) dump 下拉内容（找「多仓」）
    const dd=await ev(c,`(()=>{
      const panels=[...document.querySelectorAll('[class*="dropdownPanel"],[class*="DropdownPanel"],[class*="selectPanel"],[class*="option"],[class*="menu"]')].filter(p=>{const r=p.getBoundingClientRect();return r.width>0&&r.height>0;});
      const texts=panels.map(p=>(p.innerText||'').trim().replace(/\\s+/g,' ').slice(0,200)).filter(Boolean);
      // 兜底：找所有含「多仓」的可见叶子
      const leaves=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.getBoundingClientRect().width>0&&/多仓|新疆|西藏|运费模板/.test(e.textContent||''));
      const leafTexts=[...new Set(leaves.map(e=>(e.textContent||'').trim().slice(0,50)))].slice(0,30);
      return JSON.stringify({panels:texts.slice(0,5), 多仓相关leaf:leafTexts});
    })()`);
    console.log('DROPDOWN', dd);

    c.ws.close();
  }catch(e){console.log('ERR',e.message);}
})();
