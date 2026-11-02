# -*- coding: utf-8 -*-
"""确认：重量填后 formError 是否清除 + 当前表单类目。"""
import json, urllib.request, websocket

CDP = "http://127.0.0.1:9222"
OUT = r"D:\电商运营\运营工作台\autopublish\_confirm.txt"

def log(s):
    with open(OUT, "a", encoding="utf-8") as f:
        f.write(str(s) + "\n")

def main():
    open(OUT, "w", encoding="utf-8").close()
    tabs = json.loads(urllib.request.urlopen(CDP + "/json", timeout=10).read().decode("utf-8"))
    target = None
    for t in tabs:
        u = t.get("url", "")
        if "publish.htm" in u and "success" not in u:
            target = t
            break
    if not target:
        log("NO_TAB"); return
    log("URL: " + target.get("url",""))
    ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=15, suppress_origin=True)

    def ev(expr):
        ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True, "awaitPromise": True}}))
        while True:
            m = json.loads(ws.recv())
            if m.get("id") == 1:
                v = m.get("result", {}).get("value")
                if isinstance(v, dict) and "description" in v:
                    return v.get("description")
                return v

    log("重量 input: " + str(ev("(function(){var all=document.querySelectorAll('*');for(var i=0;i<all.length;i++){var t=(all[i].textContent||'').trim();if(t.indexOf('物流重量')===0&&t.length<25){var inp=all[i].querySelector('input');if(inp)return inp.value;}}return 'nf';})()")))
    log("formError: " + str(ev("(function(){try{var e=__SELL_STATE__.getState().engine;return JSON.stringify(e.getModels().formError);}catch(err){return 'ERR:'+err.message;}})()")))
    log("类目: " + str(ev("(function(){try{var e=__SELL_STATE__.getState().engine;var c=e.getModels().formValues.category;return JSON.stringify(c?c.categorySelect:{name:'nf'});}catch(err){return 'ERR:'+err.message;}})()")))
    log("标题: " + str(ev("(function(){try{var e=__SELL_STATE__.getState().engine;return e.getModels().formValues.title;}catch(err){return 'ERR';}})()")))
    ws.close()
    log("DONE")

if __name__ == "__main__":
    main()
