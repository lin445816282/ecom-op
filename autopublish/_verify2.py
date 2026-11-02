# -*- coding: utf-8 -*-
"""验证2：scrollIntoView 后打开 SKU 抽屉，查「确认创建」按钮真实文本。"""
import json, time, urllib.request, websocket

CDP = "http://127.0.0.1:9222"
OUT = r"D:\电商运营\运营工作台\autopublish\_verify2.txt"

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

    # 1) scrollIntoView 到「创建规格」按钮，返回视口坐标
    loc = evaluate("""
    (function(){
        var bs=document.querySelectorAll('button');
        for(var i=0;i<bs.length;i++){
            var t=(bs[i].textContent||'').trim();
            if(t.indexOf('创建规格')>=0 && bs[i].offsetWidth>0){
                bs[i].scrollIntoView({block:'center'});
                return 'scrolled';
            }
        }
        return 'NF';
    })()
    """)
    time.sleep(0.8)
    loc2 = evaluate("""
    (function(){
        var bs=document.querySelectorAll('button');
        for(var i=0;i<bs.length;i++){
            var t=(bs[i].textContent||'').trim();
            if(t.indexOf('创建规格')>=0){
                var r=bs[i].getBoundingClientRect();
                return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),txt:t});
            }
        }
        return 'NF';
    })()
    """)
    log("创建规格按钮(滚动后): " + str(loc2))
    if str(loc2).startswith("{"):
        c = json.loads(loc2)
        send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": c["x"], "y": c["y"], "button": "left", "clickCount": 1})
        send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": c["x"], "y": c["y"], "button": "left", "clickCount": 1})
        time.sleep(2.5)
        # 2) 查抽屉内所有可见按钮（y>0）
        btns = evaluate("""
        (function(){
            var bs=document.querySelectorAll('button');
            var out=[];
            for(var i=0;i<bs.length;i++){
                var t=(bs[i].textContent||'').trim();
                var r=bs[i].getBoundingClientRect();
                if(r.width>0 && r.height>0 && r.y>0 && r.y<800){
                    out.push({txt:t.slice(0,20), y:Math.round(r.y)});
                }
            }
            return JSON.stringify(out);
        })()
        """)
        log("视口内可见按钮: " + str(btns))
        # 3) 也查抽屉容器内的按钮文本
        drawer_btns = evaluate("""
        (function(){
            var d=document.querySelector('.sku-decouple-drawer-container');
            if(!d) return 'NO_DRAWER_CONTAINER';
            var bs=d.querySelectorAll('button');
            var out=[];
            for(var i=0;i<bs.length;i++){
                out.push((bs[i].textContent||'').trim().slice(0,20));
            }
            return JSON.stringify(out);
        })()
        """)
        log("sku-decouple-drawer-container 内按钮: " + str(drawer_btns))
        # ESC 关闭
        send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Escape", "code": "Escape", "windowsVirtualKeyCode": 27, "nativeVirtualKeyCode": 27})
        send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Escape", "code": "Escape", "windowsVirtualKeyCode": 27, "nativeVirtualKeyCode": 27})

    ws.close()
    log("DONE")

if __name__ == "__main__":
    main()
