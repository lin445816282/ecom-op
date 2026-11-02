# -*- coding: utf-8 -*-
"""实时诊断当前 publish 表单三问题：多件优惠 / 重量 / SKU数量。"""
import json, urllib.request, websocket

CDP = "http://127.0.0.1:9222"
OUT = r"D:\电商运营\运营工作台\autopublish\_diag3.txt"

def log(s):
    with open(OUT, "a", encoding="utf-8") as f:
        f.write(str(s) + "\n")

def main():
    open(OUT, "w", encoding="utf-8").close()
    tabs = json.loads(urllib.request.urlopen(CDP + "/json", timeout=10).read().decode("utf-8"))
    targets = []
    for t in tabs:
        u = t.get("url", "")
        if "publish.htm" in u and "success" not in u:
            targets.append(t)
    if not targets:
        log("NO_PUBLISH_TAB")
        for t in tabs:
            log("  " + t.get("type") + " " + t.get("url","")[:100])
        return
    log("共 %d 个 publish tab" % len(targets))
    for t in targets:
        log("=== TAB: " + t.get("url","")[:150])
        ws = websocket.create_connection(t["webSocketDebuggerUrl"], timeout=15, suppress_origin=True)

        def ev(expr):
            ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate",
                                "params": {"expression": expr, "returnByValue": True, "awaitPromise": False}}))
            while True:
                m = json.loads(ws.recv())
                if m.get("id") == 1:
                    outer = m.get("result", {})
                    if "exceptionDetails" in outer:
                        return "EXC:" + str(outer["exceptionDetails"].get("text",""))[:200]
                    inner = outer.get("result", {})
                    return inner.get("value")

        # 1) 多件优惠 GS 状态
        log("多件优惠GS: " + str(ev("(function(){try{var e=__SELL_STATE__.getState().engine;var fv=e.getModels().formValues;return JSON.stringify(fv.multiDiscountPromotion);}catch(err){return 'ERR:'+err.message;}})()")))
        # 2) 多件优惠 checkbox disabled 状态
        log("多件优惠DOM: " + str(ev("(function(){var cbs=document.querySelectorAll('input[type=checkbox]');for(var i=0;i<cbs.length;i++){var p=cbs[i].parentElement;var pp=p?p.parentElement:null;var ctx=(pp?pp.textContent||'':'')+'|'+(p?p.textContent||'':'');if(ctx.indexOf('折')>=0||ctx.indexOf('优惠')>=0||ctx.indexOf('满')>=0){return JSON.stringify({checked:cbs[i].checked,disabled:cbs[i].disabled,ctx:ctx.substring(0,50)});}}return 'NOT_FOUND';})()")))
        # 3) 重量 GS + DOM
        log("重量GS: " + str(ev("(function(){try{var e=__SELL_STATE__.getState().engine;var fv=e.getModels().formValues;return JSON.stringify({deliverWeight:fv.deliverWeight, deliverCard:fv['deliver-card']});}catch(err){return 'ERR:'+err.message;}})()")))
        log("重量DOM: " + str(ev("(function(){var all=document.querySelectorAll('*');for(var i=0;i<all.length;i++){var t=(all[i].textContent||'').trim();if(t.indexOf('物流重量')===0&&t.length<25){var inp=all[i].querySelector('input')||(all[i].parentElement&&all[i].parentElement.querySelector('input'));if(inp)return JSON.stringify({val:inp.value,disabled:inp.disabled});}}return 'NOT_FOUND';})()")))
        # 4) SKU 数量（customSaleProp items + sku 数组）
        log("SKU数量: " + str(ev("(function(){try{var e=__SELL_STATE__.getState().engine;var fv=e.getModels().formValues;var cp=fv.customSaleProp;var items=cp&&cp[0]?cp[0].items:null;return JSON.stringify({customSalePropItems:items?items.length:0, skuArr:fv.sku?fv.sku.length:0, skuNames:(fv.sku||[]).map(function(s){return s.price+'/'+s.quantity;}).slice(0,10)});}catch(err){return 'ERR:'+err.message;}})()")))
        # 5) 价格表 DOM 行数
        log("价格表DOM: " + str(ev("(function(){var cnt=0,vals=[];for(var i=0;i<10;i++){var p=document.getElementById(i+'-skuPrice');if(p){cnt++;var inp=p.querySelector('input');vals.push(inp?inp.value:'noinput');}}return JSON.stringify({rows:cnt, vals:vals});})()")))
        # 6) formError 汇总
        log("formError: " + str(ev("(function(){try{var e=__SELL_STATE__.getState().engine;return JSON.stringify(e.getModels().formError);}catch(err){return 'ERR:'+err.message;}})()")))
        ws.close()
    log("DONE")

if __name__ == "__main__":
    main()
