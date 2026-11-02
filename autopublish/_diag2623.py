# -*- coding: utf-8 -*-
"""诊断 2623 表单：SKU 规格(saleProp) + 价格表 真实状态。"""
import json, urllib.request, websocket

CDP = "http://127.0.0.1:9222"
OUT = r"D:\电商运营\运营工作台\autopublish\_diag2623.txt"

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
            target = t
            break
    if not target:
        for t in tabs:
            u = t.get("url", "")
            if "publish.htm" in u and "success" not in u:
                target = t; break
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

    # 1) customSaleProp（SKU 规格值）
    log("customSaleProp: " + str(ev("(function(){try{var e=__SELL_STATE__.getState().engine;var fv=e.getModels().formValues;return JSON.stringify({items:fv.customSaleProp?fv.customSaleProp[0].items:null, saleProp:fv.saleProp});}catch(err){return 'ERR:'+err.message;}})()")))
    # 2) 价格表 td#0-skuPrice 是否存在 + 值
    log("价格表: " + str(ev("(function(){var tds=[];for(var i=0;i<3;i++){var p=document.getElementById(i+'-skuPrice');var s=document.getElementById(i+'-skuStock');tds.push({i:i,price:p?p.querySelector('input')?p.querySelector('input').value:'noinput':'noTD',stock:s?('yes'):'noTD'});}return JSON.stringify(tds);})()")))
    # 3) 套餐类型区块
    log("套餐类型: " + str(ev("(function(){var ws=document.querySelectorAll('.common-wrap');for(var i=0;i<ws.length;i++){if((ws[i].textContent||'').indexOf('套餐类型')>=0){return ws[i].textContent.slice(0,80);}}return 'NF';})()")))
    # 4) formError
    log("formError: " + str(ev("(function(){try{var e=__SELL_STATE__.getState().engine;return JSON.stringify(e.getModels().formError);}catch(err){return 'ERR:'+err.message;}})()")))
    ws.close()
    log("DONE")

if __name__ == "__main__":
    main()
