// 诊断：dump 商品属性各字段的可选值（select 选项 + radio 选项）
const http = require('http');
function get(u){return new Promise((res,rej)=>{const q=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});q.on('error',rej);q.setTimeout(5000,()=>{q.destroy();rej(new Error('timeout'))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m))}},30000);p.set(mid,{res:(v)=>{clearTimeout(to);res(v)},rej:(e)=>{clearTimeout(to);rej(e)}});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});return{ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r&&r.result&&r.result.value!==undefined)return r.result.value;if(r&&r.exceptionDetails)return 'EXC:'+JSON.stringify(r.exceptionDetails).slice(0,150);return undefined;}
const PORT=process.argv[2]||'9234';
// 点开指定 label 的 select，dump 下拉选项
async function dumpSelectOptions(c, labelName){
  const click=await ev(c,`(()=>{
    const lbl=[...document.querySelectorAll('label')].find(e=>(e.textContent||'').trim()===${JSON.stringify(labelName)}&&e.getBoundingClientRect().width>0);
    if(!lbl) return 'no_label';
    let item=lbl.parentElement;
    for(let i=0;i<3&&item;i++){ if(item.querySelector('[data-testid="beast-core-select"]')) break; item=item.parentElement; }
    const sel=item?item.querySelector('[data-testid="beast-core-select"]'):null;
    if(!sel) return 'no_select';
    const head=sel.querySelector('[data-testid="beast-core-select-header"]')||sel;
    head.scrollIntoView({block:'center'});
    head.click();
    return 'ok';
  })()`);
  if(click!=='ok'){ console.log(labelName, '=>', click); return; }
  await sleep(2500);
  const opts=await ev(c,`(()=>{
    const leaves=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0);
    // 下拉里新增的可见叶子（含中文的短文本）
    const texts=[...new Set(leaves.map(e=>(e.textContent||'').trim()).filter(t=>t&&t.length>=1&&t.length<20&&/[\u4e00-\u9fa5]/.test(t)))].slice(0,40);
    return JSON.stringify(texts);
  })()`);
  console.log(labelName, '选项 =>', opts);
  // 关闭下拉（点别处）
  await ev(c,`document.body.click()`);
  await sleep(800);
}
(async()=>{
  try{
    const tabs=await get(`http://127.0.0.1:${PORT}/json`);
    let page=tabs.find(t=>t.type==='page'&&/goods_add\/index/.test(t.url||''))||tabs.find(t=>t.type==='page'&&/mms\.pinduoduo/.test(t.url||''));
    if(!page){console.log('NO_PAGE');return;}
    const c=await conn(page.webSocketDebuggerUrl);
    await c.send('Page.enable',{});await c.send('Runtime.enable',{});

    await dumpSelectOptions(c, '重要材质');
    await dumpSelectOptions(c, '风格');

    // dump radio 字段的选项（商品类型/是否二手/是否定制/是否预售）
    const radio=await ev(c,`(()=>{
      const labels=['商品类型','是否二手','是否定制','是否预售'];
      const out={};
      for(const name of labels){
        const lbl=[...document.querySelectorAll('label')].find(e=>(e.textContent||'').trim()===${JSON.stringify('x')}&&false) ;
        const all=[...document.querySelectorAll('label')].filter(e=>(e.textContent||'').trim()===name);
        if(!all.length){ out[name]='(无label)'; continue; }
        let item=all[0].parentElement;
        for(let i=0;i<3&&item;i++){ if(item.querySelector('[data-testid="beast-core-radio"]')) break; item=item.parentElement; }
        const radios=item?[...item.querySelectorAll('[data-testid="beast-core-radio"]')]:[];
        out[name]=radios.map(r=>(r.textContent||'').trim()+' checked='+r.getAttribute('data-checked'));
      }
      return JSON.stringify(out);
    })()`);
    console.log('RADIO', radio);

    c.ws.close();
  }catch(e){console.log('ERR',e.message);}
})();
