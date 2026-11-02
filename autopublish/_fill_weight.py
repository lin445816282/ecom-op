# -*- coding: utf-8 -*-
"""介入：查当前表单重量字段，空则 CDP 键盘法填 3.0。"""
import json, time, urllib.request, websocket

CDP = "http://127.0.0.1:9222"
OUT = r"D:\电商运营\运营工作台\autopublish\_fill_weight.txt"

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
    # 找最新编辑的 publish 表单（catId=50021880 花盆，2616 对应）
    target = None
    for t in tabs:
        u = t.get("url", "")
        if "publish.htm" in u and "catId=50021880" in u and "success" not in u:
            target = t
    if not target:
        # 兜底：任意 publish 页
        for t in tabs:
            u = t.get("url", "")
            if "publish.htm" in u and "success" not in u:
                target = t
                break
    if not target:
        log("NO_PUBLISH_TAB")
        for t in tabs:
            log("  " + t.get("type") + " " + t.get("url","")[:90])
        return
    log("TARGET: " + target.get("url",""))
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

    # 1) 查「物流重量」input 的 value
    q1 = evaluate("""
    (function(){
        var all=document.querySelectorAll('*');
        for(var i=0;i<all.length;i++){
            var t=(all[i].textContent||'').trim();
            if(t.indexOf('物流重量')===0 && t.length<25){
                var inp=all[i].querySelector('input')||(all[i].parentElement&&all[i].parentElement.querySelector('input'));
                if(inp){
                    var r=inp.getBoundingClientRect();
                    return JSON.stringify({val:inp.value, x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2), visible:(r.width>0&&r.height>0)});
                }
            }
        }
        return 'NF_NO_WEIGHT_INPUT';
    })()
    """)
    log("物流重量 input: " + str(q1))

    # 2) 查 GS state 重量字段
    q2 = evaluate("""
    (function(){
        try{
            var e=__SELL_STATE__.getState().engine;
            var fv=e.getModels().formValues;
            return JSON.stringify({deliverWeight:fv.deliverWeight, deliverCard:fv['deliver-card']});
        }catch(err){return 'ERR:'+err.message;}
    })()
    """)
    log("GS 重量字段: " + str(q2))

    # 3) 查 formError 是否有重量相关错误
    q3 = evaluate("""
    (function(){
        try{
            var e=__SELL_STATE__.getState().engine;
            return JSON.stringify(e.getModels().formError);
        }catch(err){return 'ERR:'+err.message;}
    })()
    """)
    log("formError: " + str(q3))

    # 4) 如果 input 空，CDP 键盘法填 3.0
    if str(q1).startswith("{") and '"val":""' in str(q1):
        c = json.loads(q1)
        log("重量为空，开始 CDP 键盘法填 3.0...")
        # scrollIntoView + 点击 focus
        evaluate("(function(){var all=document.querySelectorAll('*');for(var i=0;i<all.length;i++){var t=(all[i].textContent||'').trim();if(t.indexOf('物流重量')===0&&t.length<25){var inp=all[i].querySelector('input')||(all[i].parentElement&&all[i].parentElement.querySelector('input'));if(inp){inp.scrollIntoView({block:'center'});return 'ok';}}}return 'nf';})()")
        time.sleep(0.5)
        c2 = json.loads(evaluate("(function(){var all=document.querySelectorAll('*');for(var i=0;i<all.length;i++){var t=(all[i].textContent||'').trim();if(t.indexOf('物流重量')===0&&t.length<25){var inp=all[i].querySelector('input')||(all[i].parentElement&&all[i].parentElement.querySelector('input'));if(inp){var r=inp.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}}}return 'nf';})()"))
        if str(c2).startswith("{"):
            x, y = c2["x"], c2["y"]
            send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
            send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})
            time.sleep(0.3)
            send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "a", "code": "KeyA", "windowsVirtualKeyCode": 65, "modifiers": 2})
            send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "a", "code": "KeyA", "windowsVirtualKeyCode": 65, "modifiers": 2})
            send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Backspace", "code": "Backspace", "windowsVirtualKeyCode": 8})
            send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Backspace", "code": "Backspace", "windowsVirtualKeyCode": 8})
            send("Input.insertText", {"text": "3.0"})
            time.sleep(0.3)
            send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Tab", "code": "Tab", "windowsVirtualKeyCode": 9})
            send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Tab", "code": "Tab", "windowsVirtualKeyCode": 9})
            time.sleep(0.5)
            # 回读
            back = evaluate("(function(){var all=document.querySelectorAll('*');for(var i=0;i<all.length;i++){var t=(all[i].textContent||'').trim();if(t.indexOf('物流重量')===0&&t.length<25){var inp=all[i].querySelector('input')||(all[i].parentElement&&all[i].parentElement.querySelector('input'));if(inp)return inp.value;}}return 'nf';})()")
            log("填完后 input.value: " + str(back))
            gs2 = evaluate("(function(){try{var e=__SELL_STATE__.getState().engine;var fv=e.getModels().formValues;return JSON.stringify({deliverWeight:fv.deliverWeight, deliverCard:fv['deliver-card']});}catch(err){return 'ERR:'+err.message;}})()")
            log("填完后 GS: " + str(gs2))
    else:
        log("重量已有值或未找到，不填")

    ws.close()
    log("DONE")

if __name__ == "__main__":
    main()
