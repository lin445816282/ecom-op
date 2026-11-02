# -*- coding: utf-8 -*-
"""查询当前表单：店铺分类、确认创建按钮、套餐类型 的状态。"""
import json, urllib.request, websocket

CDP = "http://127.0.0.1:9222"
OUT = r"D:\电商运营\运营工作台\autopublish\_query.txt"

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
    log("URL: " + target.get("url", ""))
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

    # 1) 搜「店铺分类」「分类」相关文本
    q1 = evaluate("""
    (function(){
        var out=[];
        var walker=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        var n;
        while(n=walker.nextNode()){
            var t=(n.textContent||'').trim();
            if((t.indexOf('店铺分类')>=0 || t.indexOf('店内分类')>=0 || t.indexOf('宝贝分类')>=0) && t.length<30){
                out.push(t);
            }
        }
        return JSON.stringify(out.slice(0,20));
    })()
    """)
    log("=== 店铺分类相关文本 ===\n" + str(q1))

    # 2) 搜「确认创建」按钮状态
    q2 = evaluate("""
    (function(){
        var bs=[].slice.call(document.querySelectorAll('button'));
        var out=[];
        for(var i=0;i<bs.length;i++){
            var t=(bs[i].textContent||'').trim();
            if(t.indexOf('确认')>=0 || t.indexOf('创建')>=0){
                out.push({txt:t.slice(0,20), disabled:bs[i].disabled, visible:bs[i].offsetWidth>0});
            }
        }
        return JSON.stringify(out.slice(0,10));
    })()
    """)
    log("=== 确认/创建按钮 ===\n" + str(q2))

    # 3) 搜「套餐类型」下拉状态
    q3 = evaluate("""
    (function(){
        var out=[];
        var all=document.querySelectorAll('*');
        for(var i=0;i<all.length;i++){
            var t=(all[i].textContent||'').trim();
            if(t.indexOf('套餐类型')>=0 && t.length<20){
                out.push({tag:all[i].tagName, cls:all[i].className.toString().slice(0,40), txt:t});
            }
        }
        return JSON.stringify(out.slice(0,10));
    })()
    """)
    log("=== 套餐类型元素 ===\n" + str(q3))

    # 4) 当前页面滚动位置 + 是否有抽屉打开
    q4 = evaluate("""
    (function(){
        return JSON.stringify({
            scrollY: window.scrollY,
            bodyHeight: document.body.scrollHeight,
            hasDrawer: !!document.querySelector('.sku-decouple-drawer-container, .next-drawer, [class*=drawer]'),
            drawerVisible: (function(){var d=document.querySelector('.sku-decouple-drawer-container, .next-drawer');return d?d.offsetHeight>0:false;})()
        });
    })()
    """)
    log("=== 页面/抽屉状态 ===\n" + str(q4))

    ws.close()
    log("DONE")

if __name__ == "__main__":
    main()
