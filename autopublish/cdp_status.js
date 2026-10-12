// CDP 实例存活探测：访问各端口的 /json，输出 JSON [{port, alive}]。
// 用法：node cdp_status.js [port1 port2 ...]（不传则默认全部实例端口）
// 在 Windows 侧运行（node.exe），127.0.0.1 指向 Windows 本机 CDP 端口。
const http = require('http');
const DEFAULT_PORTS = [9238, 9232, 9230, 9234, 9228];
const args = process.argv.slice(2).map(Number).filter(n => n > 0);
const ports = args.length ? args : DEFAULT_PORTS;

function probe(p) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port: p, path: '/json', timeout: 4000 }, r => {
      r.resume();
      r.on('end', () => resolve({ port: p, alive: true }));
    });
    req.on('error', () => resolve({ port: p, alive: false }));
    req.on('timeout', () => { req.destroy(); resolve({ port: p, alive: false }); });
  });
}

(async () => {
  const out = [];
  for (const p of ports) out.push(await probe(p));
  console.log(JSON.stringify(out));
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
