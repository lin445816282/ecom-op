# -*- coding: utf-8 -*-
"""截图当前 9222 表单。"""
import json, base64, urllib.request, websocket

CDP = "http://127.0.0.1:9222"
OUT = r"D:\电商运营\运营工作台\autopublish\_shot.png"

def cdp_req(url, method="GET"):
    req = urllib.request.Request(url, method=method)
    r = urllib.request.urlopen(req, timeout=10)
    return json.loads(r.read().decode("utf-8"))

tabs = cdp_req(CDP + "/json")
target = None
for t in tabs:
    u = t.get("url", "")
    if "publish" in u or "item.upload" in u or "item.manager" in u:
        target = t
        break
if not target:
    print("NO_FORM_TAB")
else:
    ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=15, suppress_origin=True)
    ws.send(json.dumps({"id": 1, "method": "Page.captureScreenshot", "params": {"format": "png"}}))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == 1:
            data = m.get("result", {}).get("data", "")
            break
    with open(OUT, "wb") as f:
        f.write(base64.b64decode(data))
    print("SAVED")
    ws.close()
