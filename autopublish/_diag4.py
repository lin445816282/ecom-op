# -*- coding: utf-8 -*-
"""深挖 2623 (catId=50020846) 的 SKU 结构 + 多件优惠 DOM + 重量。"""
import json, urllib.request, websocket
CDP = "http://127.0.0.1:9222"
OUT = r"D:\电商运营\运营工作台\autopublish\_diag4.txt"

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
        log("NO 50020846 TAB"); return
    log("URL: " + t.get("url","")[:150])
    ws = websocket.create_connection(t["webSocketDebuggerUrl"], timeout=15, suppress_origin=True)

    def ev(expr):
        ws.send(json.dumps({"id":1,"method":"Runtime.evaluate","params":{"expression":expr,"returnByValue":True,"awaitPromise":False}}))
        while True:
            m = json.loads(ws.recv())
            if m.get("id")==1:
                o = m.get("result",{})
                if "exceptionDetails" in o:
                    return "EXC:"+str(o["exceptionDetails"].get("text",""))[:200]
                return o.get("result",{}).get("value")

    # sku 数组每个元素的完整 key + 值（前2个）
    log("sku完整结构: " + str(ev("(function(){try{var e=__SELL_STATE__.getState().engine;var fv=e.getModels().formValues;var s=fv.sku||[];return JSON.stringify(s.slice(0,2));}catch(err){return 'ERR:'+err.message;}})()")))
    # customSaleProp 完整结构
    log("customSaleProp完整: " + str(ev("(function(){try{var e=__SELL_STATE__.getState().engine;var fv=e.getModels().formValues;return JSON.stringify(fv.customSaleProp).slice(0,800);}catch(err){return 'ERR:'+err.message;}})()")))
    # saleProp 结构
    log("saleProp: " + str(ev("(function(){try{var e=__SELL_STATE__.getState().engine;var fv=e.getModels().formValues;return JSON.stringify(fv.saleProp).slice(0,600);}catch(err){return 'ERR:'+err.message;}})()")))
    # 多件优惠 checkbox：所有 checkbox 的 ctx + disabled + checked
    log("所有checkbox: " + str(ev("(function(){var cbs=document.querySelectorAll('input[type=checkbox]');var out=[];for(var i=0;i<cbs.length;i++){var p=cbs[i].parentElement;var pp=p?p.parentElement:null;var ctx=(pp?pp.textContent||'':'')+'|'+(p?p.textContent||'':'');out.push({i:i,checked:cbs[i].checked,disabled:cbs[i].disabled,ctx:ctx.substring(0,40)});}return JSON.stringify(out);})()")))
    # 多件优惠区块容器是否存在
    log("多件优惠容器: " + str(ev("(function(){var c=document.querySelector('.sell-component-multi-discount-promotion');if(!c)return 'NO_CONTAINER';return JSON.stringify({text:c.textContent.substring(0,120), disabledInputs:c.querySelectorAll('input:disabled').length, selects:c.querySelectorAll('.next-select-trigger').length});})()")))
    # 重量：所有含"千克"的 input
    log("重量输入框: " + str(ev("(function(){var ins=document.querySelectorAll('input');var out=[];for(var i=0;i<ins.length;i++){var p=ins[i].parentElement;var pp=p?p.parentElement:null;var ctx=(pp?pp.textContent||'':'')+'|'+(p?p.textContent||'':'');if(ctx.indexOf('千克')>=0||ctx.indexOf('kg')>=0||ctx.indexOf('重量')>=0){out.push({i:i,val:ins[i].value,disabled:ins[i].disabled,ctx:ctx.substring(0,40)});}}return JSON.stringify(out);})()")))
    ws.close()
    log("DONE")

if __name__ == "__main__":
    main()
