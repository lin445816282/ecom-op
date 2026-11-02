# -*- coding: utf-8 -*-
"""查「确认创建」按钮 disabled 状态 + SKU 名输入框值。"""
import json, urllib.request, websocket

CDP = "http://127.0.0.1:9222"
OUT = r"D:\电商运营\运营工作台\autopublish\_verify3.txt"

def cdp_req(url, method="GET"):
    req = urllib.request.Request(url, method=method)
    r = urllib.request.urlopen(req, timeout=10)
    return json.loads(r.read().decode("utf-8"))

def log(s):
    with open(OUT, "a", encoding="utf-8") as f:
        f.write(str(s) + "\n")

def main():
    open(OUT, "w", encoding="utf-8").close()
    tabs = cdp_req(CDP + "/json")
    target = None
    for t in tabs:
        u = t.get("url", "")
        if "publish" in u or "item.upload" in u or "item.manager" in u:
            target = t
            break
    if not target:
        log("NO_FORM_TAB"); return
    ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=15, suppress_origin=True)

    def send(method, params=None):
        ws.send(json.dumps({"id": 1, "method": method, "params": params or {}}))
        while True:
            m = json.loads(ws.recv())
            if m.get("id") == 1:
                return m.get("result", {})

    def evaluate(expr):
        r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
        v = r.get("result", {}).get("value")
        if isinstance(v, dict) and "description" in v:
            return v.get("description")
        return v

    # 1) 「确认创建」按钮的 disabled 状态
    q1 = evaluate("""
    (function(){
        var bs=document.querySelectorAll('button');
        var out=[];
        for(var i=0;i<bs.length;i++){
            var t=(bs[i].textContent||'').trim();
            if(t.indexOf('确认')>=0 || t.indexOf('创建')>=0){
                var r=bs[i].getBoundingClientRect();
                out.push({txt:t.slice(0,20), disabled:bs[i].disabled, visible:(r.width>0&&r.height>0), y:Math.round(r.y)});
            }
        }
        return JSON.stringify(out);
    })()
    """)
    log("确认/创建按钮: " + str(q1))

    # 2) SKU 名输入框的值（规格名 + SKU 名）
    q2 = evaluate("""
    (function(){
        var ins=document.querySelectorAll('input[placeholder="请输入"]');
        var out=[];
        for(var i=0;i<ins.length;i++){
            out.push({val:ins[i].value, w:ins[i].offsetWidth});
        }
        return JSON.stringify(out);
    })()
    """)
    log("请输入输入框值: " + str(q2))

    # 3) GS state 里的 customSaleProp（SKU 规格）
    q3 = evaluate("""
    (function(){
        try{
            var e=__SELL_STATE__.getState().engine;
            var fv=e.getModels().formValues;
            return JSON.stringify(fv.customSaleProp).slice(0,500);
        }catch(err){return 'ERR:'+err.message;}
    })()
    """)
    log("customSaleProp: " + str(q3))

    ws.close()
    log("DONE")

if __name__ == "__main__":
    main()
