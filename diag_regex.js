
const https = require('https');
(async()=>{
const txt = await new Promise((res,rej)=>{
  https.get('https://itemcdn.tmall.com/1688offer/icoss321896289995efbdbb8a49250c',{headers:{'Referer':'https://detail.1688.com/','User-Agent':'Mozilla/5.0'}},r=>{
    let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));
  }).on('error',()=>res(''));
});
console.log('响应长度:', txt.length);
const idx = txt.indexOf('src=');
console.log('src 附近原始:', JSON.stringify(txt.slice(idx, idx+80)));
const tests = [
  [/src=\\?"([^"]+cib\.jpg)/g, 'A: src=\\\\?"(...)'],
  [/src=\\"([^"]+cib\.jpg)/g, 'B: src=\\\\\\"(...)'],
  [/src=\\?\"([^"]+cib\.jpg)/g, 'C: src=\\\\?\\"(...)'],
  [/src="([^"]+cib\.jpg)/g, 'D: src="(...)'],
];
for(const [re, name] of tests){
  const m = txt.match(re);
  console.log(name, '->', m ? m.length : 0, '个', m ? m[0].slice(0,60) : '');
}
})();
