# -*- coding: utf-8 -*-
import json, urllib.request, websocket
CDP = "http://127.0.0.1:9222"

tabs = json.loads(urllib.request.urlopen(CDP + "/json", timeout=10).read().decode("utf-8"))
t = None
for x in tabs:
    if "publish.htm" in x.get("url","") and "success" not in x.get("url",""):
        t = x; break
if not t:
    print("no tab"); raise SystemExit
ws = websocket.create_connection(t["webSocketDebuggerUrl"], timeout=15, suppress_origin=True)

def raw(expr):
    ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate",
                        "params": {"expression": expr, "returnByValue": True, "awaitPromise": False}}))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == 1:
            print("RAW RESULT:", json.dumps(m, ensure_ascii=False)[:500])
            return m

# 测试1：简单字符串
raw("'hello'")
# 测试2：document.title
raw("document.title")
# 测试3：__SELL_STATE__ 是否存在
raw("typeof __SELL_STATE__")
# 测试4：try/catch 包装
raw("(function(){try{return 'OK:'+(typeof __SELL_STATE__);}catch(e){return 'ERR:'+e.message;}})()")
ws.close()
