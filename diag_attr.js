// 诊断：dump 拼多多发布页「商品属性」区块的字段结构和填写方式
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
    if(!page){console.log('NO_PAGE(发布页已关闭？)');return;}
    console.log('TAB', page.url.slice(0,90));
    const c=await conn(page.webSocketDebuggerUrl);
    await c.send('Page.enable',{});await c.send('Runtime.enable',{});

    // dump 属性相关的 label + 输入控件
    const r=await ev(c,`(()=>{
      const labels=[...document.querySelectorAll('label')].filter(e=>(e.textContent||'').trim()&&e.getBoundingClientRect().width>0);
      const attrLabels=labels.filter(e=>/材质|风格|场景|工艺|特性|类型|使用形式|品牌|产地|是否/.test(e.textContent||''));
      const out=[];
      for(const lbl of attrLabels){
        const name=(lbl.textContent||'').trim();
        // 找 label 关联的输入控件（兄弟/父级里的 input/select）
        let item=lbl.parentElement;
        for(let i=0;i<3&&item;i++){ if(item.querySelector('input,select,[data-testid="beast-core-select"]')) break; item=item.parentElement; }
        const inp=item?item.querySelector('input[type="text"],input:not([type])') : null;
        const sel=item?item.querySelector('[data-testid="beast-core-select"]') : null;
        const radio=item?item.querySelector('[data-testid="beast-core-radio"]') : null;
        out.push({name, hasInput:!!inp, inputVal:inp?(inp.value||inp.placeholder||'') : '', hasSelect:!!sel, selText:sel?(sel.textContent||'').trim().slice(0,30):'', hasRadio:!!radio});
      }
      return JSON.stringify(out);
    })()`);
    console.log('ATTR_FIELDS', r);

    // dump 所有含「属性」的区块标题
    const sec=await ev(c,`(()=>{
      const leaves=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.getBoundingClientRect().width>0&&/(商品属性|属性|参数)/.test(e.textContent||''));
      return JSON.stringify([...new Set(leaves.map(e=>(e.textContent||'').trim()))].slice(0,20));
    })()`);
    console.log('ATTR_SECTION', sec);

    c.ws.close();
  }catch(e){console.log('ERR',e.message);}
})();
