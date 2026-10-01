// 精确复现 publish.js 的匹配逻辑，看为什么没命中
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:9234/json`);
    const page = tabs.find(t=>t.type==='page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),5000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Runtime.enable',{});

    // 复现 publish.js 匹配逻辑（want = AI 生成的类目路径）
    const r = await send('Runtime.evaluate',{expression:`(function(){
      const want = '节庆用品/派对装饰 > 气球 > 波波球';
      const parts = want.split(' > ');
      const lastWord = parts[parts.length-1] || '';
      const midWord = parts.length>=2 ? parts[1] : lastWord;
      const cands = [...document.querySelectorAll('.choose-category,[class*="searchItem"]')];
      const norm = e => (e.textContent||'').trim();
      var detail = {
        want: want,
        parts: parts,
        midWord: midWord,
        lastWord: lastWord,
        candCount: cands.length,
        candTexts: cands.map(norm).slice(0, 6),
        candRaw0: JSON.stringify(norm(cands[0]||{textContent:''})),
        splitTest: JSON.stringify(norm(cands[0]||{textContent:''}).split(' > '))
      };
      let el = cands.find(e=>norm(e)===want);
      detail.step1_exact = el ? 'FOUND' : 'not found';
      if(!el && midWord) {
        el = cands.find(e=>{const lp=norm(e).split(' > ').pop(); return lp===midWord || lp.includes(midWord);});
        detail.step2_midword = el ? 'FOUND: '+norm(el) : 'not found';
      }
      if(!el && midWord) {
        el = cands.find(e=>norm(e).includes(midWord));
        detail.step3_includes = el ? 'FOUND: '+norm(el) : 'not found';
      }
      if(!el && lastWord) {
        el = cands.find(e=>norm(e).includes(lastWord));
        detail.step4_lastword = el ? 'FOUND: '+norm(el) : 'not found';
      }
      detail.finalEl = el ? norm(el) : null;
      return JSON.stringify(detail);
    })()`, returnByValue:true});
    console.log(r.result.value);
    ws.close();
    process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
