# -*- coding: utf-8 -*-
"""查 2623 价格表（querySelectorAll，含 skuPrice/skuStock 的 input）。"""
import json, urllib.request, websocket

CDP = "http://127.0.0.1:9222"
OUT = r"D:\电商运营\运营工作台\autopublish\_price2.txt"

def log(s):
    with open(OUT, "a", encoding="utf-8") as f:
        f.write(str(s) + "\n")

def main():
    open(OUT, "w", encoding="utf-8").close()
    tabs = json.loads(urllib.request.urlopen(CDP + "/json", timeout=10).read().decode("utf-8"))
    target = None
    for t in tabs:
        u = t.get("url", "")
        if "publish.htm" in u and "catId=50020846" in u and "success" not in u:
            target = t; break
    if not target:
        for t in tabs:
            u = t.get("url", "")
            if "publish.htm" in u and "success" not in u:
                target = t; break
    if not target:
        log("NO_TAB"); return
    log("URL: " + target.get("url",""))
    ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=15, suppress_origin=True)

    def evaluate(expr):
        ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True, "awaitPromise": True}}))
        while True:
            m = json.loads(ws.recv())
            if m.get("id") == 1:
                v = m.get("result", {}).get("value")
                if isinstance(v, dict) and "description" in v:
                    return v.get("description")
                return v

    # 所有含 skuPrice / skuStock 的 td 及其 input 值
    log("价格表td: " + str(evaluate("(function(){var out=[];var tds=document.querySelectorAll('td[id*=skuPrice], td[id*=skuStock]');for(var i=0;i<tds.length;i++){var inp=tds[i].querySelector('input');out.push({id:tds[i].id, val:inp?inp.value:'noinput'});}return JSON.stringify(out);})()")))
    # 页面是否在 iframe（body 元素数量）
    log("body检查: " + str(evaluate("(function(){return JSON.stringify({hasBody:!!document.body, title:document.title, inputCount:document.querySelectorAll('input').length});})()")))
    ws.close()
    log("DONE")

if __name__ == "__main__":
    main()
