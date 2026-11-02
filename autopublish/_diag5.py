# -*- coding: utf-8 -*-
"""精确定位 2623 物流重量 DOM + 库存 DOM。"""
import json, urllib.request, websocket
CDP = "http://127.0.0.1:9222"
OUT = r"D:\电商运营\运营工作台\autopublish\_diag5.txt"

def log(s):
    with open(OUT, "a", encoding="utf-8") as f:
        f.write(str(s) + "\n")

def main():
    open(OUT, "w", encoding="utf-8").close()
    tabs = json.loads(urllib.request.urlopen(CDP + "/json", timeout=10).read().decode("utf-8"))
    t = None
    for x in tabs:
        if "catId=50020846" in x.get("url","") and "success" not in x.get("url",""):
            t = x; break
    if not t:
        log("NO TAB"); return
    ws = websocket.create_connection(t["webSocketDebuggerUrl"], timeout=15, suppress_origin=True)

    def ev(expr):
        ws.send(json.dumps({"id":1,"method":"Runtime.evaluate","params":{"expression":expr,"returnByValue":True,"awaitPromise":False}}))
        while True:
            m = json.loads(ws.recv())
            if m.get("id")==1:
                o = m.get("result",{})
                if "exceptionDetails" in o: return "EXC:"+str(o["exceptionDetails"].get("text",""))[:150]
                return o.get("result",{}).get("value")

    # 物流重量：找 textContent 以"物流重量"开头的节点
    log("物流重量DOM: " + str(ev("(function(){var all=document.querySelectorAll('*');var out=[];for(var i=0;i<all.length;i++){var t=(all[i].textContent||'').trim();if(t.indexOf('物流重量')===0&&t.length<30){var inp=all[i].querySelector('input')||(all[i].parentElement&&all[i].parentElement.querySelector('input'));out.push({node:all[i].tagName,txt:t.substring(0,20),inputVal:inp?inp.value:'NO_INPUT',disabled:inp?inp.disabled:'',visible:inp?{w:inp.offsetWidth,h:inp.offsetHeight}:null});}}return JSON.stringify(out);})()")))
    # 库存：查 sku 表格里的库存 input（td id=0-skuStock）
    log("库存DOM: " + str(ev("(function(){var out=[];for(var i=0;i<3;i++){var td=document.getElementById(i+'-skuStock');if(td){var inp=td.querySelector('input');out.push({i:i,val:inp?inp.value:'noinput',disabled:inp?inp.disabled:''});}}return JSON.stringify(out);})()")))
    # 展开收起项面板是否展开
    log("折叠面板: " + str(ev("(function(){var btns=document.querySelectorAll('*');var out=[];for(var i=0;i<btns.length;i++){var t=(btns[i].textContent||'').trim();if(t==='展开收起项'||t==='展开'||t==='收起'){out.push(t+':'+btns[i].tagName);}}return JSON.stringify(out);})()")))
    ws.close()
    log("DONE")

if __name__ == "__main__":
    main()
