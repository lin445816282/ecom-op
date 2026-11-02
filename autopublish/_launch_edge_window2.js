// 用计划任务执行 .bat（启动有窗口的 Edge 9222）
const { spawnSync } = require('child_process');
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function ps(args) {
  const r = spawnSync('powershell', ['-NoProfile', '-Command', args.join(' ')]);
  return (r.stdout || '') + (r.stderr || '');
}

(async () => {
  // 清理残留
  ps(['Get-CimInstance Win32_Process -Filter "name=\'msedge.exe\'" | Where-Object {$_.CommandLine -like \'*edge-cdp-taobao*\'} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }']);
  await sleep(2000);

  // 计划任务执行 .bat
  const launch = ps([
    "$action = New-ScheduledTaskAction -Execute 'C:\\tmp\\launch_taobao_edge.bat'",
    "$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2)",
    "Register-ScheduledTask -TaskName 'Edge9222Launch' -Action $action -Trigger $trigger -Force | Out-Null",
    "Start-ScheduledTask -TaskName 'Edge9222Launch'",
    "Start-Sleep -Seconds 10",
    "Unregister-ScheduledTask -TaskName 'Edge9222Launch' -Confirm:$false -ErrorAction SilentlyContinue",
    "Write-Host 'launched'"
  ]);
  console.log('启动结果:', launch.trim().slice(0,120) || '(空)');

  await sleep(3);
  const portOk = await new Promise(res => {
    http.get('http://127.0.0.1:9222/json/version', r => { r.resume(); r.on('end', () => res(true)); }).on('error', () => res(false));
  });
  console.log('9222 端口:', portOk ? '存活' : '未启动');

  const win = ps(['Get-Process msedge | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object Id,MainWindowTitle | ConvertTo-Json -Compress']);
  console.log('有窗口的 msedge:', win.trim().slice(0,500) || '(无)');
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
