// 走类目流程进拼多多发布页，dump「商品详情」上传区 DOM
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const PORT = process.argv[2] || '9234';
const KW = process.argv[3] || '收纳柜';
const CAT = process.argv[4] || '收纳整理 > 收纳用具 > 收纳柜 > 收纳柜';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    let page = tabs.find(t=>t.type==='page'&&/mms\.pinduoduo\.com/.test(t.url||''))||tabs.find(t=>t.type==='page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Runtime.enable',{}); await send('Page.enable',{}); await send('DOM.enable',{});
    const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r&&r.result?r.result.value:undefined);

    // 1. 导航类目页
    await send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
    await sleep(6000);
    console.log('类目页 URL:', (await ev('location.href')).slice(0,80));

    // 2. 搜索类目
    const focus=await ev(`(()=>{const inp=document.querySelector('input[placeholder*="分类"]');if(!inp)return 'no input';inp.scrollIntoView({block:'center'});inp.click();inp.focus();return 'ok'})()`);
    console.log('搜索框:', focus);
    if(focus==='ok'){
      await send('Input.insertText',{text:KW});
      await sleep(500);
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await sleep(4000);
    }
    // 3. 选类目
    const sel=await ev(`(()=>{
      const _norm=s=>String(s||'').replace(/[＞﹥]/g,'>').replace(/／/g,'/').replace(/\\s+/g,' ').trim();
      const want=_norm(${JSON.stringify(CAT)});
      const parts=want.split(' > ');
      const midWord=parts.length>=2?parts[1]:'';
      const lastWord=parts[parts.length-1]||'';
      let cands=[...document.querySelectorAll('.choose-category,[class*="searchItem"]')];
      if(!cands.length){ cands=[...document.querySelectorAll('*')].filter(e=>{ if(e.children.length!==0)return false; const r=e.getBoundingClientRect(); if(r.width<1||r.height<1)return false; const t=_norm(e.textContent||''); return t.length>=2&&t.length<=80&&(t.includes(midWord)||t.includes(${JSON.stringify(KW)})); }); }
      const norm=e=>_norm(e.textContent||'');
      let el=cands.find(e=>norm(e)===want);
      if(!el&&midWord)el=cands.find(e=>{const lp=norm(e).split(' > ').pop();return lp===midWord||lp.includes(midWord);});
      if(!el&&lastWord)el=cands.find(e=>norm(e).includes(lastWord));
      if(el){el.scrollIntoView({block:'center'});el.click();return norm(el);}
      return '';
    })()`);
    console.log('选类目:', sel);
    await sleep(2000);
    // 4. 点确认
    const confirm=await ev(`(()=>{const btn=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='确认发布该类商品');if(btn){btn.click();return 'ok';}return 'no confirm'})()`);
    console.log('确认:', confirm);
    await sleep(6000);
    console.log('发布页 URL:', (await ev('location.href')).slice(0,100));

    // 5. dump 详情图区
    for(let i=0;i<5;i++){ await ev('window.scrollTo(0,document.body.scrollHeight)'); await sleep(1200); }
    const r=await ev(`(function(){
      var out={fileInputs:[], detailTitles:[], richText:[]};
      var fis=document.querySelectorAll('input[type="file"]');
      fis.forEach(function(f,i){
        var el=f, chain=[];
        for(var k=0;k<6&&el;k++){ chain.push(el.tagName.toLowerCase()+((typeof el.className==='string'&&el.className)?('.'+el.className.split(' ').join('.')):'')); el=el.parentElement; }
        out.fileInputs.push({i:i, accept:f.accept||'', chain:chain.join(' > ')});
      });
      // 详情标题
      var all=document.querySelectorAll('*');
      for(var j=0;j<all.length;j++){
        var e=all[j]; if(e.children.length>0)continue;
        var t=(e.textContent||'').trim();
        if(t==='商品详情'||t==='图文详情'||t==='商品描述'||t==='详情描述'||t==='商品图片') out.detailTitles.push({tag:e.tagName,cls:(typeof e.className==='string')?e.className:''});
      }
      // 富文本编辑器（contenteditable / 文本域）
      var rt=document.querySelectorAll('[contenteditable="true"], textarea');
      rt.forEach(function(e,i){ if(e.getBoundingClientRect().height>0) out.richText.push({tag:e.tagName,cls:(typeof e.className==='string')?e.className:'',ph:e.placeholder||''}); });
      return JSON.stringify(out);
    })()`);
    const d=JSON.parse(r);
    console.log('=== file inputs ('+d.fileInputs.length+') ===');
    d.fileInputs.forEach(x=>console.log('  ['+x.i+'] accept='+x.accept+' | '+x.chain));
    console.log('=== 详情标题 ===');
    d.detailTitles.forEach(x=>console.log('  '+JSON.stringify(x)));
    console.log('=== 富文本/textarea ===');
    d.richText.forEach(x=>console.log('  '+JSON.stringify(x)));
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
