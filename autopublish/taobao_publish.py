#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
淘宝商品上架执行器 — AI 以图发品 + V2 表单填表（六步链固化版）

复用 skill（taobao-ai-publish-fast / cdp-sku-drawer-fill / v2-final-fill）已验证方法。
与拼多多 publish.js 完全独立：淘宝是「AI 以图发品」流程，CDP 必须用 Python websocket-client
（Node ws 库连淘宝 Edge 被 403 拒绝），且「提交宝贝」按钮被 React 拦截，最后点击必须人工。

数据流：读 config.json（复用 1688 scrape.js 抓的图 + AI 定价）→ 登录预检 → AI 以图发品
        → V2 填标题/导购/一口价 → SKU 抽屉 → 价格/库存 → 收尾校验 → 停在提交前。

用法：python3 taobao_publish.py <config.json> [cdp_base_url]
  config.json  : 复用拼多多链路的 config.json（title/images/specs/price 等字段）
  cdp_base_url : 淘宝发品 Edge CDP 地址，默认 http://127.0.0.1:9222

退出码：0=成功走到提交前（需人工点击提交） / 1=失败（stdout 打 RESULT_FAILED + 原因）
"""
import json
import os
import sys
import time
import shutil
from urllib.request import Request, urlopen

try:
    import websocket  # websocket-client，suppress_origin=True 是连淘宝 Edge 的唯一可靠方式
except ImportError:
    print(json.dumps({"error": "缺少 websocket-client，先 pip install websocket-client"}))
    sys.exit(1)

# ---------------- 常量 ----------------
CDP = "http://127.0.0.1:9222"  # 默认淘宝发品实例，可被参数覆盖
LOG = []  # 全局日志缓冲


def log(msg):
    """带时间戳日志，同时打印到 stdout + 写日志文件。"""
    line = "[%s] %s" % (time.strftime("%H:%M:%S"), msg)
    print(line, flush=True)
    LOG.append(line)


# ---------------- CDP 框架 ----------------
def cdp_req(url, method="GET"):
    """CDP HTTP 请求（/json 列表、/json/new、/json/close 等）。"""
    resp = urlopen(Request(url, method=method), timeout=6)
    return json.loads(resp.read().decode())


def ws_connect(tab):
    """连接指定 tab 的 WebSocket，返回 (ws, send, recv_any, evaluate)。"""
    ws_url = tab["webSocketDebuggerUrl"]
    ws = websocket.create_connection(ws_url, timeout=15, suppress_origin=True)
    _mid = [0]

    def send(method, params=None):
        _mid[0] += 1
        ws.send(json.dumps({"id": _mid[0], "method": method, "params": params or {}}))
        return _mid[0]

    def recv_any(timeout=15):
        """稳健 recv：跳过 CDP 事件（无 id 消息），只返回带 id 的响应。
        淘宝 V2 页面 DOM 极重，enable 触发事件洪流会挤占响应通道导致永久超时，
        故全程不调 enable，直接用 recv_any 过滤。"""
        ws.settimeout(timeout)
        dl = time.time() + timeout
        while time.time() < dl:
            try:
                m = json.loads(ws.recv())
                if "id" in m:
                    return m
            except Exception:
                if time.time() > dl - 0.5:
                    return None
                continue
        return None

    def evaluate(expr):
        """执行 JS 并取回 returnByValue 结果。"""
        mid = send("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        r = recv_any()
        if not r:
            return None
        return r.get("result", {}).get("result", {}).get("value")

    return ws, send, recv_any, evaluate


def tab_cleanup(keep_url_frags=("myseller", "about:blank", "upload.taobao", "publish.htm")):
    """清理标签页：>20 tabs 会导致 CDP Runtime.evaluate 永久超时（skill 验证）。
    保留含 keep 关键字的 tab，其余关闭。"""
    try:
        tabs = cdp_req(f"{CDP}/json")
        closed = 0
        for t in tabs:
            u = t.get("url", "") or ""
            if not any(k in u for k in keep_url_frags):
                try:
                    cdp_req(f"{CDP}/json/close/{t['id']}")
                    closed += 1
                except Exception:
                    pass
        log(f"tab 清理：关闭 {closed} 个，剩余 {len(tabs) - closed} 个")
        return len(tabs) - closed
    except Exception as e:
        log(f"tab 清理异常（忽略）：{e}")
        return -1


# ---------------- 工具函数 ----------------
def _to_wsl_path(p):
    """Windows 路径 → WSL 路径（给 PIL 读）。C:\\tmp\\x → /mnt/c/tmp/x"""
    p = str(p).replace("\\", "/")
    if p.startswith("C:/"):
        return "/mnt/c/" + p[3:]
    if p.startswith("D:/"):
        return "/mnt/d/" + p[3:]
    return p


def _to_win_path(p):
    """WSL 路径 → Windows 路径（给 CDP setFileInputFiles）。/mnt/c/tmp/x → C:/tmp/x"""
    p = str(p)
    if p.startswith("/mnt/c/"):
        return "C:/" + p[len("/mnt/c/"):]
    if p.startswith("/mnt/d/"):
        return "D:/" + p[len("/mnt/d/"):]
    return p


def preprocess_images(config, outdir):
    """主图预处理：WebP 伪装 JPG 需转真 JPG（1688 常见坑），统一转 JPG。
    config.images 是 Windows 路径（scrape.js 在 Windows 侧下载），
    需先转 WSL 路径给 PIL 读，再转回 Windows 路径给 CDP。"""
    from PIL import Image
    images = config.get("images") or []
    out = []
    for i, src in enumerate(images):
        if not src:
            continue
        src_wsl = _to_wsl_path(src)
        dst = os.path.join(outdir, f"tb_img{i + 1}.jpg")
        try:
            img = Image.open(src_wsl)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.save(dst, "JPEG", quality=95)
            out.append(_to_win_path(dst))
        except Exception as e:
            # 转换失败（图不存在/损坏）就沿用原 Windows 路径，CDP 可能仍能注入
            log(f"图片 {i + 1} 预处理失败（沿用原图）：{e}")
            out.append(_to_win_path(src))
    return out[:10]  # 淘宝主图最多 10 张，但 AI 以图发品通常 5 张


def expand_skus(config):
    """展开 specs 笛卡尔积 → SKU 列表 [{name, price, stock}]。
    淘宝单层自定义模式：多属性组合成单一规格名（如「款式/尺寸」）。
    128 字符总长限制：所有 SKU 名总字符 ≤128（skill 验证）。"""
    specs = config.get("specs") or []
    names = [""]
    for s in specs:
        vals = [str(v) for v in (s.get("values") or []) if v]
        if not vals:
            continue
        names = [f"{n}/{v}" if n else v for n in names for v in vals]
    if not names or names == [""]:
        names = ["默认"]

    # 定价：优先 priceBySpec2（按 spec2 值），否则统一 price
    base_price = config.get("price") or 0
    pb = config.get("priceBySpec2") or {}
    stock = config.get("stock") or 200
    skus = []
    for n in names:
        price = base_price
        # 尝试从 spec2 值匹配 priceBySpec2
        for spec2val, pv in pb.items():
            if spec2val and spec2val in n:
                if isinstance(pv, dict):
                    price = pv.get("danmai") or pv.get("pdd") or pv.get("cost") or base_price
                else:
                    price = pv or base_price
                break
        skus.append({"name": n, "price": float(price or 0), "stock": int(stock or 200)})
    return skus


def _js_btn_click(text_frag, disabled_only_false=True):
    """生成点击「文本含 text_frag 且未 disabled」按钮的 JS。"""
    cond = "&&!bs[i].disabled" if disabled_only_false else ""
    return (
        f'(function(){{var bs=document.querySelectorAll("button");'
        f'for(var i=0;i<bs.length;i++){{'
        f'if((bs[i].textContent||"").indexOf("{text_frag}")>=0{cond}){{'
        f'bs[i].click();bs[i].dispatchEvent(new MouseEvent("click",{{bubbles:true}}));return "ok";'
        f'}}}}return "nf";}})()'
    )


# ---------------- 第 0 步：登录预检 ----------------
def login_check():
    """新建标签导航 myseller，检查是否登录态（title 含「登录」则未登录）。"""
    tab = None
    try:
        tab = cdp_req(f"{CDP}/json/new?https://myseller.taobao.com/home.htm/QnworkbenchHome/", "PUT")
    except Exception:
        pass
    if tab is None:
        try:
            tabs = cdp_req(f"{CDP}/json")
            tab = next((t for t in tabs if "myseller" in (t.get("url") or "")), None)
        except Exception:
            return {"ok": False, "reason": f"CDP 连接失败（{CDP} 未启动或不可达）"}
        if not tab:
            return {"ok": False, "reason": "无 myseller tab，CDP 实例可能未启动"}
    try:
        ws, _, _, evaluate = ws_connect(tab)
        time.sleep(3)
        title = evaluate("document.title") or ""
        url = evaluate("window.location.href") or ""
    except Exception as e:
        return {"ok": False, "reason": f"CDP WebSocket 连接失败：{e}"}
    finally:
        try:
            ws.close()
        except Exception:
            pass
    if "登录" in title or "login" in url.lower():
        return {"ok": False, "reason": "淘宝未登录，需先在 Edge 9222 扫码登录"}
    return {"ok": True}


# ---------------- 第 2 步：AI 以图发品 ----------------
def ai_publish(images_win):
    """AI 以图发品：已登录 tab navigate 到 category.htm → 注入图片 → N1 → N2 → V2。
    返回 V2 tab 的 dict；失败返回 None。
    硬规则（skill）：必须从已登录 tab Page.navigate（旧版 file input=1），
    新建标签 PUT /json/new 会加载新版 iframe（file input=0）。"""
    # 找已登录 tab（myseller）
    tabs = cdp_req(f"{CDP}/json")
    base_tab = next((t for t in tabs if "myseller" in (t.get("url") or "")), None)
    if not base_tab:
        log("无已登录 myseller tab，无法 AI 发品")
        return None
    ws, send, recv_any, evaluate = ws_connect(base_tab)

    try:
        # navigate 到 AI 发品页（从已登录 tab → 旧版页面）
        send("Page.navigate", {"url": "https://item.upload.taobao.com/sell/ai/category.htm"})
        time.sleep(5)
        title = evaluate("document.title") or ""
        log(f"AI 发品页：{title}")
        if "登录" in title:
            log("未登录，中止 AI 发品")
            return None

        # 零点击注入：dispatch mouseenter 激活上传区（不触发文件弹框）
        evaluate("(function(){var z=document.querySelector('.upload-wrapper')||document.querySelector('[class*=\"upload\"]')||document.querySelector('.image-upload')||document.body;z.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}));return 'ok';})()")
        time.sleep(0.5)

        # 定位隐藏 file input（depth:-1 或 5）
        send("DOM.getDocument", {"depth": -1})
        doc = recv_any()
        if not doc:
            # 大 DOM 下 depth:-1 可能失败，退 depth:5
            send("DOM.getDocument", {"depth": 5})
            doc = recv_any()
        if not doc or "result" not in doc:
            log("DOM.getDocument 失败，AI 发品中止")
            return None
        root = doc["result"]["root"]["nodeId"]
        send("DOM.querySelectorAll", {"nodeId": root, "selector": "input[type=file]"})
        qs = recv_any()
        node_ids = (qs or {}).get("result", {}).get("nodeIds", [])
        log(f"file input 数：{len(node_ids)}")
        if not node_ids:
            log("无 file input（新版 iframe 页面），需手动上传图片或重走登录态")
            return None

        # 注入图片
        send("DOM.setFileInputFiles", {"nodeId": node_ids[0], "files": images_win})
        time.sleep(2)
        evaluate('(function(){var f=document.querySelector("input[type=file]");if(f){f.dispatchEvent(new Event("change",{bubbles:true}));}return "ok";})()')
        time.sleep(6)
        log(f"已注入 {len(images_win)} 张主图")

        # N1：点击「下一步」（含「确认，下一步」变体）
        n1 = evaluate(_js_btn_click("下一步"))
        log(f"N1: {n1}")
        if n1 != "ok":
            return None

        # 等 AI 类目识别（body 出现 >>）
        for _ in range(15):
            time.sleep(1)
            body = evaluate("document.body.innerText") or ""
            if ">>" in body and len(body) > 100:
                break
        time.sleep(3)

        # 类目 fallback：遍历点击含类目关键词元素（React 需 dispatchEvent）
        evaluate('(function(){var all=document.querySelectorAll("div,span,li");for(var i=0;i<all.length;i++){var t=all[i].textContent||"";if((t.indexOf("挂钩")>=0||t.indexOf("粘钩")>=0||t.indexOf("收纳")>=0||t.indexOf("家居")>=0)&&t.length<50&&all[i].offsetWidth>50){all[i].click();all[i].dispatchEvent(new MouseEvent("click",{bubbles:true}));return "cat:"+t.trim().substring(0,20);}}return "no-cat";})()')
        time.sleep(2)

        # N2：点击「下一步」（确认，下一步），最多 15 次重试
        n2 = "nf"
        for retry in range(15):
            n2 = evaluate(_js_btn_click("下一步"))
            if n2 == "ok":
                break
            if retry == 2:
                evaluate('(function(){var all=document.querySelectorAll("[class*=\"item\"]");for(var i=0;i<Math.min(all.length,5);i++){all[i].dispatchEvent(new MouseEvent("mousedown",{bubbles:true}));all[i].dispatchEvent(new MouseEvent("mouseup",{bubbles:true}));all[i].dispatchEvent(new MouseEvent("click",{bubbles:true}));}return "retry";})()')
            if retry == 4:
                evaluate('(function(){var ins=document.querySelectorAll("input[type=radio],input[type=checkbox]");ins[0]&&ins[0].click();return "radio";})()')
            time.sleep(2)
        log(f"N2: {n2}")
        if n2 != "ok":
            return None

        # 等 V2 表单到达（URL 含 publish.htm）
        time.sleep(8)
        url = evaluate("window.location.href") or ""
        if "publish.htm" in url:
            log(f"V2 到达：{url[:80]}")
            return base_tab  # 同一 tab 内跳转（skill 验证：AI→类目→V2 同 tab）
        log(f"未达 V2：{url[:80]}")
        return None
    finally:
        try:
            ws.close()
        except Exception:
            pass


# ---------------- 第 1 步：GS 注入（多件优惠 + 重量，必须先于 DOM 填写） ----------------
def fill_v2_gs(evaluate, weight="1.0"):
    """GS 注入多件优惠清零 + 物流重量。必须最先做（DOM 填写前）：
    skill 验证 GS updateModels 会触发 React 重渲染清除所有 DOM 值，故「GS→DOM」是硬顺序。
    深克隆 formValues 保留 mainImagesGroup + sku（永不碰 fv.sku，否则 SKU 30+ 字段清空）。
    最大承重 p-5432965 是挂钩类目特定属性，待实测按需注入（值必须"5"非"5kg"）。"""
    js = """
    (function(){
        try{
            var e=__SELL_STATE__.getState().engine;
            var fv=JSON.parse(JSON.stringify(e.getModels().formValues));
            // 多件优惠清零（9.9折=不打折；checkbox 对 CDP 完全免疫，只能 GS 强注）
            fv.multiDiscountPromotion={enable:true,type:'percent',value:9.9,condition:2,discountType:'PERCENT'};
            // 物流重量
            fv['deliver-card']=fv['deliver-card']||{};
            fv['deliver-card'].weight=__WEIGHT__;
            e.updateModels({formValues:fv});
            e.getModels().formError={};
            return 'gs_injected';
        }catch(err){return 'gs_fail:'+err.message;}
    })()
    """
    js = js.replace("__WEIGHT__", json.dumps(str(weight)))
    r = evaluate(js)
    log(f"GS 注入（多件优惠+重量 {weight}）：{r}")
    return r


# ---------------- 第 3 步：V2 填标题/导购 ----------------
def fill_v2_title_guide(evaluate, title, guide):
    """标题/导购：宽度索引法（w≥600，第1个=标题，第2个=导购）。
    skill 验证：中文 placeholder 匹配不可靠，宽度索引 5/5 稳定。"""
    if not guide or len(guide) < 10:
        guide = (guide or "") + " 精选优质家居好物，做工精细，使用便捷。"
    js = f"""
    (function(){{
        var ns=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
        var ins=document.querySelectorAll('input');
        var wides=[];
        for(var i=0;i<ins.length;i++){{if(ins[i].offsetWidth>=600)wides.push(ins[i]);}}
        if(wides.length>=1){{
            ns.call(wides[0],{json.dumps(title, ensure_ascii=False)});
            wides[0].dispatchEvent(new Event('input',{{bubbles:true}}));
            wides[0].dispatchEvent(new Event('change',{{bubbles:true}}));
        }}
        if(wides.length>=2){{
            ns.call(wides[1],{json.dumps(guide, ensure_ascii=False)});
            wides[1].dispatchEvent(new Event('input',{{bubbles:true}}));
            wides[1].dispatchEvent(new Event('change',{{bubbles:true}}));
        }}
        return 'title_guide_filled:'+wides.length;
    }})()
    """
    r = evaluate(js)
    log(f"标题/导购：{r}")
    return r


# ---------------- 第 4 步：一口价 ----------------
def fill_v2_main_price(evaluate, price):
    """一口价：.sell-o-number.has-unit 组件（非普通 input），nativeSetter + fiber.onChange。"""
    js = f"""
    (function(){{
        var ns=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
        var cs=document.querySelectorAll('.sell-o-number.has-unit');
        var done=0;
        for(var i=0;i<cs.length;i++){{
            if((cs[i].textContent||'').indexOf('元')>=0){{
                var inp=cs[i].querySelector('input');
                if(inp){{
                    ns.call(inp,{json.dumps(str(price))});
                    inp.dispatchEvent(new Event('input',{{bubbles:true}}));
                    inp.dispatchEvent(new Event('change',{{bubbles:true}}));
                    var key=Object.keys(inp).find(k=>k.startsWith('__reactFiber'));
                    if(key){{var fb=inp[key];if(fb.memoizedProps&&fb.memoizedProps.onChange)fb.memoizedProps.onChange({{target:inp}});if(fb.pendingProps&&fb.pendingProps.onChange)fb.pendingProps.onChange({{target:inp}});}}
                    inp.blur();
                    done++;
                }}
            }}
        }}
        return 'main_price_done:'+done;
    }})()
    """
    r = evaluate(js)
    log(f"一口价 {price}：{r}")
    return r


# ---------------- 第 5 步：SKU 抽屉 ----------------
def fill_sku_drawer(evaluate, send, recv_any, skus):
    """SKU 抽屉：单层自定义模式 + CDP 键盘法（Ctrl+A→Backspace→insertText→Tab→+）。
    skill 验证：nativeSetter 对中文 SKU 名无效，CDP insertText 8/8 一次过。"""
    # 关闭可能弹出的批量导入弹窗
    evaluate('(function(){var c=document.querySelector(".next-dialog-close");if(c){c.click();}return "closed";})()')

    # 打开「创建规格」按钮（JS click，不能用 CDP mouse）
    r = evaluate(_js_btn_click("创建规格"))
    time.sleep(2)
    if r != "ok":
        r = evaluate(_js_btn_click("设置"))  # fallback
        time.sleep(2)
    log(f"打开抽屉：{r}")

    # 选「单层展示」（文本匹配 label，skill 验证：idx=8，文本法更稳）
    evaluate('(function(){var ls=document.querySelectorAll("label.next-radio-wrapper");for(var i=0;i<ls.length;i++){var t=ls[i].textContent||"";if(t.indexOf("单层")>=0){ls[i].click();return "ok";}}return "nf";})()')
    time.sleep(0.5)

    # 逐行填 SKU 名（CDP 键盘法）
    for idx, sku in enumerate(skus):
        name = sku["name"]
        # 找到抽屉内空输入框并填值（nativeSetter 填值 + 返回坐标）
        fill_js = f"""
        (function(){{
            var drawer=document.querySelector('.sku-decouple-drawer-container')||document;
            var ins=drawer.querySelectorAll('input');
            var ns=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
            for(var i=ins.length-1;i>=0;i--){{
                if(ins[i].value===''&&ins[i].offsetWidth>50){{
                    ns.call(ins[i],{json.dumps(name, ensure_ascii=False)});
                    ins[i].dispatchEvent(new Event('input',{{bubbles:true}}));
                    ins[i].dispatchEvent(new Event('change',{{bubbles:true}}));
                    var r=ins[i].getBoundingClientRect();
                    return JSON.stringify({{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width}});
                }}
            }}
            return 'no-empty';
        }})()
        """
        coord = evaluate(fill_js)
        if coord == "no-empty":
            log(f"SKU {idx + 1} 无空输入框，跳过")
            continue
        try:
            c = json.loads(coord)
        except Exception:
            c = None
        # CDP 鼠标点击输入框（focus）
        if c:
            send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": c["x"], "y": c["y"], "button": "left", "clickCount": 1})
            send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": c["x"], "y": c["y"], "button": "left", "clickCount": 1})
            time.sleep(0.1)
        # Ctrl+A 全选 + Backspace 清空（避免叠加）
        send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "a", "code": "KeyA", "windowsVirtualKeyCode": 65, "modifiers": 2})
        send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "a", "code": "KeyA", "windowsVirtualKeyCode": 65, "modifiers": 2})
        send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Backspace", "code": "Backspace", "windowsVirtualKeyCode": 8})
        send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Backspace", "code": "Backspace", "windowsVirtualKeyCode": 8})
        # insertText 填入（支持中文）
        send("Input.insertText", {"text": name})
        time.sleep(0.3)
        # Tab 提交（触发 React onChange）
        send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Tab", "code": "Tab", "windowsVirtualKeyCode": 9})
        send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Tab", "code": "Tab", "windowsVirtualKeyCode": 9})
        time.sleep(0.4)
        # 非最后一行：点 + 号（className 含 add）
        if idx < len(skus) - 1:
            evaluate('(function(){var bs=[].slice.call(document.querySelectorAll("button"));for(var i=0;i<bs.length;i++){var cl=bs[i].className||"";if(cl.indexOf("add")>=0&&!bs[i].disabled){bs[i].click();bs[i].dispatchEvent(new MouseEvent("click",{bubbles:true}));return "ok";}}return "nf";})()')
            time.sleep(1.0)
    log(f"SKU 名填入完成：{len(skus)} 个")

    # 填完所有行 → 点一次「确认创建」（skill 严格纠正：不是两次）
    r = evaluate(_js_btn_click("确认创建"))
    time.sleep(3)
    log(f"确认创建：{r}")
    return r


# ---------------- 第 6 步：价格/库存 ----------------
def fill_sku_price_stock(evaluate, skus):
    """逐行配对填价格/库存：nativeSetter + fiber.onChange（不 blur 库存）。
    skill 验证：CDP insertText 对数字框无效；blur 库存会被 React 用旧 state 覆盖。"""
    js = """
    (function(){
        var ns=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
        function fillViaFiber(el,val){
            ns.call(el,val);
            el.dispatchEvent(new Event('input',{bubbles:true}));
            el.dispatchEvent(new Event('change',{bubbles:true}));
            var key=Object.keys(el).find(k=>k.startsWith('__reactFiber'));
            if(key){var fb=el[key];if(fb.memoizedProps&&fb.memoizedProps.onChange)fb.memoizedProps.onChange({target:el});if(fb.pendingProps&&fb.pendingProps.onChange)fb.pendingProps.onChange({target:el});}
        }
        var prices=__SKU_PRICES__;
        var stock=__SKU_STOCK__;
        var ins=document.querySelectorAll('input');
        var pi=0;
        for(var i=0;i<ins.length;i++){
            if(ins[i].type!=='text')continue;
            var gp=ins[i].parentElement?ins[i].parentElement.parentElement:null;
            var ctx=gp?(gp.textContent||''):'';
            if(ctx.indexOf('元')>=0&&ins[i].offsetWidth<120&&pi<prices.length){
                fillViaFiber(ins[i],String(prices[pi]));
                // 同行找库存兄弟框
                var row=ins[i].closest('tr')||ins[i].parentElement;
                var cells=row.querySelectorAll('input');
                for(var j=0;j<cells.length;j++){
                    var c2=cells[j].parentElement?cells[j].parentElement.parentElement:null;
                    var ctx2=c2?(c2.textContent||''):'';
                    if(cells[j]!==ins[i]&&ctx2.indexOf('件')>=0&&cells[j].offsetWidth<100){
                        fillViaFiber(cells[j],String(stock));
                        break;
                    }
                }
                pi++;
            }
        }
        return 'filled:'+pi+'/'+prices.length;
    })()
    """
    prices = [sku["price"] for sku in skus]
    stock = skus[0]["stock"] if skus else 200
    js = js.replace("__SKU_PRICES__", json.dumps(prices)).replace("__SKU_STOCK__", json.dumps(stock))
    r = evaluate(js)
    log(f"价格/库存：{r}")
    return r


# ---------------- 第 7 步：收尾校验 ----------------
def verify_form(evaluate):
    """formError 三层检查（skill v2-form-verify）：errorBoard → formError → body.innerText。"""
    js = """
    (function(){
        var r={};
        // 第一层：errorBoard
        var eb=document.querySelector('[class*="errorBoard"],[class*="error-board"]');
        r.errorBoard=eb?eb.textContent:'';
        // 第二层：GlobalStore formError
        try{
            var gs=(window.__SELL_STATE__&&__SELL_STATE__.getState)?__SELL_STATE__.getState():null;
            var fe=(gs&&gs.engine&&gs.engine.getModels)?gs.engine.getModels().formError:{};
            r.formError=JSON.stringify(fe||{});
        }catch(e){r.formError='n/a';}
        // 第三层：body 报错文本
        var b=document.body.innerText||'';
        r.bodyErr=(b.indexOf('填写错误')>=0||b.indexOf('必填')>=0||b.indexOf('请填写')>=0)?'HAS_ERROR':'';
        return JSON.stringify(r);
    })()
    """
    r = evaluate(js)
    try:
        return json.loads(r)
    except Exception:
        return {"errorBoard": "", "formError": "n/a", "bodyErr": "", "_raw": r}
    finally:
        log(f"formError 校验：{r}")


# ---------------- 主编排 ----------------
def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "用法: python3 taobao_publish.py <config.json> [cdp_base_url]"}))
        sys.exit(1)
    global CDP
    config_path = sys.argv[1]
    if len(sys.argv) >= 3:
        CDP = sys.argv[2]
    log(f"淘宝上架启动，CDP={CDP}，config={config_path}")

    try:
        with open(config_path, encoding="utf-8") as f:
            config = json.load(f)
    except Exception as e:
        print(json.dumps({"error": f"读 config.json 失败: {e}"}))
        sys.exit(1)

    title = (config.get("title") or "").strip()
    guide = (config.get("ai_desc") or config.get("guide") or "").strip()
    skus = expand_skus(config)
    log(f"标题：{title[:30]}，SKU 数：{len(skus)}，SKU 名总长：{sum(len(s['name']) for s in skus)}")

    if sum(len(s["name"]) for s in skus) > 128:
        log("⚠️ SKU 名总长超 128 字符，需缩短规格名（skill 验证限制）")

    # 图片预处理（WSL 路径 → Windows 路径，WebP→JPG）
    outdir = os.path.dirname(config_path) or "."
    images_win = preprocess_images(config, outdir)
    if not images_win:
        print(json.dumps({"error": "无可用主图（config.images 为空）"}))
        sys.exit(1)
    log(f"主图 {len(images_win)} 张就绪")

    # 第 0 步：登录预检
    lc = login_check()
    if not lc.get("ok"):
        print(json.dumps({"error": f"登录预检失败：{lc.get('reason')}"}))
        sys.exit(1)
    log("登录预检通过")

    # tab 清理
    tab_cleanup()

    # 第 2 步：AI 以图发品
    v2_tab = ai_publish(images_win)
    if not v2_tab:
        print(json.dumps({"error": "AI 以图发品未到达 V2 表单（可能新版 iframe 页面/未登录/类目识别失败）"}))
        sys.exit(1)

    # 重连 V2 tab（AI 发品后同一 tab，但需重新握手）
    ws, send, recv_any, evaluate = ws_connect(v2_tab)
    try:
        # 第 1 步：GS 注入（多件优惠 + 重量）—— 必须最先（GS 会清 DOM 值，skill「GS→DOM」硬顺序）
        weight = config.get("logisticsWeight") or 1.0
        fill_v2_gs(evaluate, weight)
        time.sleep(1)
        # 第 2 步：标题/导购
        fill_v2_title_guide(evaluate, title, guide)
        time.sleep(1)
        # 第 3 步：一口价
        main_price = max([s["price"] for s in skus]) if skus else 0
        fill_v2_main_price(evaluate, main_price)
        time.sleep(1)
        # 第 4 步：SKU 抽屉
        fill_sku_drawer(evaluate, send, recv_any, skus)
        time.sleep(1)
        # 第 5 步：价格/库存
        fill_sku_price_stock(evaluate, skus)
        time.sleep(1)
        # 第 6 步：校验
        verify = verify_form(evaluate)

        # 输出结果
        result = {
            "status": "ready_for_manual_submit",
            "title": title,
            "sku_count": len(skus),
            "verify": verify,
            "note": "淘宝「提交宝贝」按钮被 React 拦截，CDP/JS 无法触发真实提交，请人工在 Edge 9222 手动点击提交",
        }
        log(f"RESULT_READY {json.dumps(result, ensure_ascii=False)}")
        print(json.dumps(result, ensure_ascii=False))
        return 0
    finally:
        try:
            ws.close()
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(main())
