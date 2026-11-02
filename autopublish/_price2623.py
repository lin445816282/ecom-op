# -*- coding: utf-8 -*-
"""诊断 2623 表单价格表：每个 SKU 的价格/库存值。"""
import json, urllib.request, websocket

CDP = "http://127.0.0.1:9222"
OUT = r"D:\电商运营\运营工作台\autopublish\_price2623.txt"

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

    def evaluate(expr):
        ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True, "awaitPromise": True}}))
        while True:
            m = json.loads(ws.recv())
            if m.get("id") == 1:
                v = m.get("result", {}).get("value")
                if isinstance(v, dict) and "description" in v:
                    return v.get("description")
                return v

    # 价格表 3 行 × 价格/库存
    log("价格表: " + str(evaluate("(function(){var out=[];for(var i=0;i<3;i++){var p=document.getElementById(i+'-skuPrice');var s=document.getElementById(i+'-skuStock');out.push({i:i, price:p?(p.querySelector('input')?p.querySelector('input').value:'noinput'):'noTD', stock:s?(s.querySelector('input')?s.querySelector('input').value:'noinput'):'noTD'});}return JSON.stringify(out);})()")))
    # SKU 名（规格值）
    log("SKU名: " + str(evaluate("(function(){var out=[];var ins=document.querySelectorAll('input[placeholder=\"请输入\"]');for(var i=0;i<ins.length;i++){out.push(ins[i].value);}return JSON.stringify(out);})()")))
    # customSaleProp items
    log("customSaleProp: " + str(evaluate("(function(){try{var e=__SELL_STATE__.getState().engine;var fv=e.getModels().formValues;var cp=fv.customSaleProp;return JSON.stringify(cp&&cp[0]?cp[0].items.map(function(x){return x.text||x.name;}).slice(0,10):'empty');}catch(err){return 'ERR:'+err.message;}})()")))
    # 多件优惠
    log("多件优惠: " + str(evaluate("(function(){try{var e=__SELL_STATE__.getState().engine;return JSON.stringify(e.getModels().formValues.multiDiscountPromotion);}catch(err){return 'ERR';}})()")))
    ws.close()
    log("DONE")

if __name__ == "__main__":
    main()
