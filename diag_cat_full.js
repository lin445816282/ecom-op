// 完整验证：模拟 publish.js 修复后的 searchAndSelectCategory（Input.insertText + Ctrl+A + Enter + 归一化匹配）
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',()=>res(null))})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const PORT = process.argv[2] || '9232';
const KW = process.argv[3] || '收纳箱';
const WANT = process.argv[4] || '收纳整理 > 收纳用具 > 储物箱 > 收纳箱';
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    let page = tabs.find(t=>t.type==='page' && /goods\/category/.test(t.url||'')) || tabs.find(t=>t.type==='page' && /mms\.pinduoduo/.test(t.url||''));
    if(!page){ console.log('NO_PAGE'); return; }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Page.enable',{});
    await send('Runtime.enable',{});
    await send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
    await sleep(8000);

    // 聚焦 + Ctrl+A + Input.insertText + Enter（publish.js 修复后逻辑）
    const focus = await send('Runtime.evaluate',{expression:`(function(){
      var inp=document.querySelector('input[placeholder*="分类"]');
      if(!inp) return 'NO_INPUT';
      inp.scrollIntoView({block:'center'}); inp.click(); inp.focus();
      return 'OK';
    })()`, returnByValue:true});
    console.log('聚焦:', focus.result.value);
    await sleep(300);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17});
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17});
    await send('Input.insertText',{text:KW});
    await sleep(500);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await sleep(4500);

    // 模拟 publish.js 匹配逻辑（归一化 + 选择器 + 匹配）
    const r = await send('Runtime.evaluate',{expression:`(function(){
      var _norm=s=>String(s||'').replace(/[＞﹥]/g,'>').replace(/／/g,'/').replace(/\\s+/g,' ').trim();
      var want=_norm(${JSON.stringify(WANT)});
      var parts=want.split(' > ');
      var lastWord=parts[parts.length-1]||'';
      var midWord=parts.length>=2?parts[1]:lastWord;
      var kw=_norm(${JSON.stringify(KW)});
      var cands=[...document.querySelectorAll('.choose-category,[class*="searchItem"]')];
      if(!cands.length){
        cands=[...document.querySelectorAll('*')].filter(e=>{
          if(e.children.length!==0) return false;
          var r=e.getBoundingClientRect();
          if(r.width<1||r.height<1) return false;
          var t=_norm(e.textContent||'');
          return t.length>=2&&t.length<=80&&(t.includes(midWord)||t.includes(kw));
        });
      }
      var norm=e=>_norm(e.textContent||'');
      var el=cands.find(e=>norm(e)===want);
      var hitStep='exact';
      if(!el&&midWord){ el=cands.find(e=>{var lp=norm(e).split(' > ').pop();return lp===midWord||lp.includes(midWord);}); hitStep='midWord-last'; }
      if(!el&&midWord){ el=cands.find(e=>norm(e).includes(midWord)); hitStep='midWord-includes'; }
      if(!el&&lastWord){ el=cands.find(e=>norm(e).includes(lastWord)); hitStep='lastWord'; }
      if(!el&&kw){ el=cands.find(e=>norm(e).includes(kw)); hitStep='kw'; }
      return JSON.stringify({candsCount: cands.length, matched: el?norm(el):null, hitStep: hitStep});
    })()`, returnByValue:true});
    console.log('=== 匹配结果 ===');
    console.log(r.result.value);
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
