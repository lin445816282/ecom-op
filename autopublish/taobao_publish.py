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

# Windows 侧跑时 stdout 默认 GBK，含中文 print 会 UnicodeEncodeError 或乱码。
# 重定向到 UTF-8，让 subprocess 侧（text=True, encoding=utf-8）能正确解码。
try:
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
except Exception:
    pass

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


def progress(node, status, msg=""):
    """输出结构化进度行，供 api.py 实时捕获写任务日志，驱动前端流程树。
    node 对齐 data/flow_trees.json 的节点 id；status ∈ done/failed/running/retry/skip/manual。"""
    print("TREE_PROGRESS " + json.dumps({"node": node, "status": status, "msg": msg}, ensure_ascii=False), flush=True)


# ---------------- CDP 框架 ----------------
def cdp_req(url, method="GET"):
    """CDP HTTP 请求（/json 列表、/json/new、/json/close 等）。"""
    resp = urlopen(Request(url, method=method), timeout=6)
    return json.loads(resp.read().decode())


def ws_connect(tab):
    """连接指定 tab 的 WebSocket，返回 (ws, send, recv, evaluate)。
    send 返回消息 id；recv(mid) 只匹配该 id 的响应，跳过无 id 事件和其他 id 响应（乱序/堆积）。
    这样 enable 产生的响应、键盘事件响应都不会错位到后续 recv。"""
    ws_url = tab["webSocketDebuggerUrl"]
    ws = websocket.create_connection(ws_url, timeout=15, suppress_origin=True)
    _mid = [0]

    def send(method, params=None):
        _mid[0] += 1
        ws.send(json.dumps({"id": _mid[0], "method": method, "params": params or {}}))
        return _mid[0]

    def recv(mid, timeout=15):
        """匹配指定 mid 的响应；跳过无 id 事件和其他 id 响应。"""
        ws.settimeout(timeout)
        dl = time.time() + timeout
        while time.time() < dl:
            try:
                m = json.loads(ws.recv())
                if m.get("id") == mid:
                    return m
            except Exception:
                if time.time() > dl - 0.5:
                    return None
                continue
        return None

    def evaluate(expr):
        mid = send("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        r = recv(mid)
        if not r:
            return None
        return r.get("result", {}).get("result", {}).get("value")

    return ws, send, recv, evaluate


def tab_cleanup(keep_url_frags=("myseller", "about:blank", "upload.taobao", "publish.htm")):
    """清理标签页：>20 tabs 会导致 CDP Runtime.evaluate 永久超时（skill 验证）。
    保留含 keep 关键字的 tab，其余关闭。
    ⚠️ 2026-10-22：Edge 4283.62 下「关闭所有 tab」会导致整个 CDP 实例崩溃/退出
    （ECONNREFUSED）。必须至少保留 1 个 page tab，且只处理 page 类型（勿误关 service_worker）。"""
    try:
        tabs = cdp_req(f"{CDP}/json")
        page_tabs = [t for t in tabs if t.get("type") == "page"]
        keep_tabs = [t for t in page_tabs if any(k in (t.get("url") or "") for k in keep_url_frags)]
        to_close = [t for t in page_tabs if t not in keep_tabs]
        # 没有 keep tab 时，至少保留 1 个非 keep tab，避免关闭所有 tab 触发 Edge 崩溃
        if not keep_tabs and to_close:
            to_close = to_close[1:]
        closed = 0
        for t in to_close:
            try:
                cdp_req(f"{CDP}/json/close/{t['id']}")
                closed += 1
            except Exception:
                pass
        log(f"tab 清理：关闭 {closed} 个，剩余 {len(page_tabs) - closed} 个")
        return len(page_tabs) - closed
    except Exception as e:
        log(f"tab 清理异常（忽略）：{e}")
        return -1


# ---------------- 工具函数 ----------------
IS_WINDOWS = sys.platform == "win32"


def _to_wsl_path(p):
    """Windows 路径 → WSL 路径（给 WSL 侧 PIL 读）。Windows 侧直接返回原路径。"""
    if IS_WINDOWS:
        return p
    p = str(p).replace("\\", "/")
    if p.startswith("C:/"):
        return "/mnt/c/" + p[3:]
    if p.startswith("D:/"):
        return "/mnt/d/" + p[3:]
    return p


def _to_win_path(p):
    """WSL 路径 → Windows 路径（给 CDP setFileInputFiles）。Windows 侧直接返回原路径。"""
    if IS_WINDOWS:
        return p
    p = str(p)
    if p.startswith("/mnt/c/"):
        return "C:/" + p[len("/mnt/c/"):]
    if p.startswith("/mnt/d/"):
        return "D:/" + p[len("/mnt/d/"):]
    return p


def preprocess_images(config, outdir):
    """主图预处理：WebP 伪装 JPG 需转真 JPG（1688 常见坑），统一转 JPG。
    config.images 是 Windows 路径（scrape.js 在 Windows 侧下载）。
    WSL 侧跑需转 WSL 路径给 PIL 读；Windows 侧跑直接用 Windows 路径。"""
    from PIL import Image
    images = config.get("images") or []
    out = []
    for i, src in enumerate(images):
        if not src:
            continue
        src_read = _to_wsl_path(src)
        dst = os.path.join(outdir, f"tb_img{i + 1}.jpg")
        try:
            img = Image.open(src_read)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.save(dst, "JPEG", quality=95)
            out.append(_to_win_path(dst))
        except Exception as e:
            # 转换失败（图不存在/损坏）就沿用原路径，CDP 可能仍能注入
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


def _cdp_click_btn(evaluate, send, text_frag, retries=8, wait=1.0):
    """CDP 真实鼠标点击「文本含 text_frag 且未 disabled」的按钮。
    2026-10 改版后 React/next 对 JS .click()/dispatchEvent 不响应，必须 CDP 真实点击。
    先 scrollIntoView 滚到按钮，再 Input.dispatchMouseEvent 按下+抬起。"""
    for _ in range(retries):
        # ① 定位并滚动到按钮（若在视口外）
        r = evaluate(
            f'(function(){{var bs=document.querySelectorAll("button");'
            f'for(var j=0;j<bs.length;j++){{'
            f'if((bs[j].textContent||"").indexOf("{text_frag}")>=0&&!bs[j].disabled){{'
            f'bs[j].scrollIntoView({{block:"center"}});return "ok";'
            f'}}}}return "nf";}})()'
        )
        if r != "ok":
            time.sleep(wait)
            continue
        time.sleep(0.4)
        # ② 取按钮中心坐标
        r2 = evaluate(
            f'(function(){{var bs=document.querySelectorAll("button");'
            f'for(var j=0;j<bs.length;j++){{'
            f'if((bs[j].textContent||"").indexOf("{text_frag}")>=0&&!bs[j].disabled){{'
            f'var rr=bs[j].getBoundingClientRect();'
            f'if(rr.width>0&&rr.height>0)return JSON.stringify({{x:rr.x+rr.width/2,y:rr.y+rr.height/2}});'
            f'}}}}return "nf";}})()'
        )
        if r2.startswith("{"):
            try:
                c = json.loads(r2)
                send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": c["x"], "y": c["y"], "button": "left", "clickCount": 1})
                send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": c["x"], "y": c["y"], "button": "left", "clickCount": 1})
                return "ok"
            except Exception as e:
                return f"err:{e}"
        time.sleep(wait)
    return "nf"


def _cdp_fill_input(evaluate, send, find_js, value, wait_after=0.5):
    """CDP 真实键盘法填 input（2026-10-22 改版关键：nativeSetter + dispatchEvent 完全失效，
    必须 CDP 键盘走完整 React 合成事件链路）：定位→scrollIntoView→CDP点击focus→Ctrl+A→Backspace→insertText→Tab。
    find_js 返回 {"x":cx,"y":cy} 或 "nf"。"""
    coord = evaluate(find_js)
    if not coord or not coord.startswith("{"):
        return "nf"
    try:
        c = json.loads(coord)
    except Exception:
        return "nf:badcoord"
    send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": c["x"], "y": c["y"], "button": "left", "clickCount": 1})
    send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": c["x"], "y": c["y"], "button": "left", "clickCount": 1})
    time.sleep(0.3)
    # Ctrl+A 全选
    send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "a", "code": "KeyA", "windowsVirtualKeyCode": 65, "modifiers": 2})
    send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "a", "code": "KeyA", "windowsVirtualKeyCode": 65, "modifiers": 2})
    # Backspace 清空
    send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Backspace", "code": "Backspace", "windowsVirtualKeyCode": 8})
    send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Backspace", "code": "Backspace", "windowsVirtualKeyCode": 8})
    # insertText 填入（支持数字/中文）
    send("Input.insertText", {"text": str(value)})
    time.sleep(0.3)
    # Tab 触发 blur/change
    send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Tab", "code": "Tab", "windowsVirtualKeyCode": 9})
    send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Tab", "code": "Tab", "windowsVirtualKeyCode": 9})
    time.sleep(wait_after)
    return "ok"


# ---------------- 第 0 步：登录预检 ----------------
TAOBAO_LOGIN_ACCOUNT = os.environ.get("TAOBAO_LOGIN_ACCOUNT", "嘉裕工艺品")
TAOBAO_LOGIN_PASSWORD = os.environ.get("TAOBAO_LOGIN_PASSWORD", "Alcz8283103")


def auto_login(timeout=180):
    """未登录时自动走密码登录：找 loginmyseller tab → 穿透 havanalogin 跨域 iframe →
    填账号密码 → 点登录 → 截图提示人工拖滑块 → 轮询等待登录成功。

    关键（2026-10 实测）：
    - 登录框在跨域 iframe（havanalogin.taobao.com），pierce 穿透无效，必须
      Page.createIsolatedWorld 在 iframe 里建隔离世界拿到 executionContextId 才能操作。
    - 账号 #fm-login-id / 密码 #fm-login-password 用 native setter + input/change 事件填值。
    - 点登录必触发阿里滑块验证码（nc_1），缺口识别 + 反自动化轨迹检测，无法自动化，
      只能截图提示人工拖滑块，轮询等待登录成功跳转 myseller。
    返回 {"ok": bool, "reason": str}。
    """
    # 1. 找 loginmyseller tab（未登录时 URL 被重定向到 loginmyseller.taobao.com）
    login_tab = None
    try:
        tabs = cdp_req(f"{CDP}/json")
        login_tab = next((t for t in tabs if "loginmyseller" in (t.get("url") or "")), None)
    except Exception as e:
        return {"ok": False, "reason": f"CDP 连接失败：{e}"}
    if not login_tab:
        # 没有 login tab，直接新建导航登录页 loginmyseller（不再走 myseller 重定向）
        try:
            login_tab = cdp_req(f"{CDP}/json/new?https://loginmyseller.taobao.com/", "PUT")
        except Exception as e:
            return {"ok": False, "reason": f"新建登录 tab 失败：{e}"}
        time.sleep(5)

    ws, send, recv, evaluate = ws_connect(login_tab)
    try:
        send("Page.enable"); send("Runtime.enable"); send("DOM.enable")
        time.sleep(3)

        # 2. 找 havanalogin 跨域 iframe 的 frameId
        def _find_havana(node):
            if not node:
                return None
            if "havanalogin" in (node.get("frame", {}).get("url") or ""):
                return node["frame"]["id"]
            for cf in node.get("childFrames") or []:
                r = _find_havana(cf)
                if r:
                    return r
            return None

        havana_id = None
        for _ in range(6):  # iframe 可能延迟加载，最多等 18s
            _mid = send("Page.getFrameTree")
            ft = recv(_mid)
            try:
                havana_id = _find_havana(ft.get("result", {}).get("frameTree", {}))
            except Exception:
                pass
            if havana_id:
                break
            time.sleep(3)
        if not havana_id:
            return {"ok": False, "reason": "未找到 havanalogin 登录 iframe"}

        # 3. 在 iframe 里创建隔离世界（跨域 iframe 的唯一操作方式）
        _mid = send("Page.createIsolatedWorld", {"frameId": havana_id, "worldName": "hermes_login", "grantUniveralAccess": True})
        world = recv(_mid)
        ctx_id = (world.get("result") or {}).get("executionContextId")
        if not ctx_id:
            return {"ok": False, "reason": "createIsolatedWorld 失败"}

        def eval_ctx(expr):
            _mid = send("Runtime.evaluate", {"contextId": ctx_id, "expression": expr, "returnByValue": True})
            r = recv(_mid)
            return (r.get("result", {}).get("result", {}) or {}).get("value") if r else None

        # 4. 填账号密码（native setter + input/change 事件，React 受控输入可靠法）
        fill_js = (
            "(function(){"
            "var acc=document.querySelector('#fm-login-id');"
            "var pwd=document.querySelector('#fm-login-password');"
            "if(!acc||!pwd) return 'no_inputs';"
            "var setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;"
            "setter.call(acc, %s);"
            "acc.dispatchEvent(new Event('input',{bubbles:true}));"
            "acc.dispatchEvent(new Event('change',{bubbles:true}));"
            "setter.call(pwd, %s);"
            "pwd.dispatchEvent(new Event('input',{bubbles:true}));"
            "pwd.dispatchEvent(new Event('change',{bubbles:true}));"
            "return 'filled acc='+acc.value+' pwdLen='+pwd.value.length;"
            "})()"
        ) % (json.dumps(TAOBAO_LOGIN_ACCOUNT), json.dumps(TAOBAO_LOGIN_PASSWORD))
        r = eval_ctx(fill_js)
        log(f"填账号密码：{r}")
        if not r or "filled" not in str(r):
            return {"ok": False, "reason": f"填账号密码失败：{r}"}
        time.sleep(1)

        # 5. 点登录按钮
        click_js = (
            "(function(){"
            "var btn=document.querySelector('.fm-button.fm-submit.password-login');"
            "if(!btn){var bs=document.querySelectorAll('button');for(var i=0;i<bs.length;i++){if((bs[i].textContent||'').trim()==='登录'){btn=bs[i];break;}}}"
            "if(!btn) return 'no_btn';"
            "btn.click();"
            "return 'clicked';"
            "})()"
        )
        r = eval_ctx(click_js)
        log(f"点登录按钮：{r}")
        time.sleep(5)

        # 6. 检查是否已直接跳转（未触发滑块时直接登录成功）
        url = evaluate("window.location.href") or ""
        if "myseller" in url and "login" not in url:
            log("自动登录成功（无需滑块）")
            return {"ok": True}

        # 7. 触发滑块验证码，截图提示人工拖
        try:
            _mid = send("Page.captureScreenshot", {"format": "png"})
            shot = recv(_mid, timeout=30)
            if shot and (shot.get("result") or {}).get("data"):
                import base64
                shot_path = "C:\\tmp\\taobao_login_captcha.png" if IS_WINDOWS else "/mnt/c/tmp/taobao_login_captcha.png"
                with open(shot_path, "wb") as f:
                    f.write(base64.b64decode(shot["result"]["data"]))
                log(f"滑块验证码截图已存 {shot_path}，请人工在 Edge 拖滑块")
            else:
                log("滑块验证码截图失败，请人工查看 Edge 9222 窗口拖滑块")
        except Exception as e:
            log(f"截图异常（忽略）：{e}")

        # 8. 轮询等待人工完成滑块 + 登录成功
        log(f"等待人工完成滑块验证（最多 {timeout}s）…")
        dl = time.time() + timeout
        while time.time() < dl:
            time.sleep(5)
            try:
                tabs = cdp_req(f"{CDP}/json")
                if any("myseller" in (t.get("url") or "") and "home" in (t.get("url") or "") for t in tabs):
                    log("检测到登录成功（myseller tab 出现）")
                    return {"ok": True}
            except Exception:
                pass
        return {"ok": False, "reason": f"等待滑块验证超时（{timeout}s 未完成登录）"}
    finally:
        try:
            ws.close()
        except Exception:
            pass


def login_check():
    """检查登录态：优先复用已有 myseller tab（已登录），否则新建 loginmyseller tab。
    2026-10-23 用户要求：已开启 CDP 直接沿用，不重复「新建 tab + 关闭 tab」。
    登录页 = loginmyseller.taobao.com（导航 myseller 3 秒内未完成重定向会误判已登录）。"""
    # 1. 先找已有的 myseller tab（已登录），直接沿用，不新建
    try:
        tabs = cdp_req(f"{CDP}/json")
        existing = next((t for t in tabs if t.get("type") == "page"
                         and "myseller" in (t.get("url") or "") and "login" not in (t.get("url") or "")), None)
        if existing:
            ws, _, _, evaluate = ws_connect(existing)
            time.sleep(2)
            title = evaluate("document.title") or ""
            url = evaluate("window.location.href") or ""
            try:
                ws.close()
            except Exception:
                pass
            if "登录" not in title and "login" not in url.lower():
                log("复用已有 myseller tab（已登录，不新建）")
                return {"ok": True, "reused": True}
    except Exception:
        pass
    # 2. 没有已登录 tab，新建 loginmyseller tab 检查
    tab = None
    try:
        tab = cdp_req(f"{CDP}/json/new?https://loginmyseller.taobao.com/", "PUT")
    except Exception:
        pass
    if tab is None:
        try:
            tabs = cdp_req(f"{CDP}/json")
            tab = next((t for t in tabs if "login" in (t.get("url") or "") or "myseller" in (t.get("url") or "")), None)
        except Exception:
            return {"ok": False, "reason": f"CDP 连接失败（{CDP} 未启动或不可达）"}
        if not tab:
            return {"ok": False, "reason": "无登录/myseller tab，CDP 实例可能未启动"}
    try:
        ws, _, _, evaluate = ws_connect(tab)
        time.sleep(8)
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
        log("检测到未登录，启动自动密码登录…")
        al = auto_login()
        if al.get("ok"):
            log("自动登录成功")
            return {"ok": True}
        return {"ok": False, "reason": al.get("reason", "自动登录失败")}
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
    ws, send, recv, evaluate = ws_connect(base_tab)

    try:
        # 先 enable（AI 发品页需要；V2 表单页才跳过 enable）
        send("Runtime.enable"); send("DOM.enable"); send("Page.enable")
        # navigate 到 AI 发品页（从已登录 tab → 旧版页面）
        _mid = send("Page.navigate", {"url": "https://item.upload.taobao.com/sell/ai/category.htm"})
        recv(_mid)
        time.sleep(8)
        title = evaluate("document.title") or ""
        url_now = evaluate("window.location.href") or ""
        log(f"AI 发品页：title={title!r} url={url_now[:60]}")
        if "登录" in title:
            log("未登录，中止 AI 发品")
            return None

        # 步骤1：CDP 真实点击「以图发品」switch-tab
        # （2026-10-22 改版：不再有「开启」按钮，「以图发品」变成 item-tab switch-tab，
        #   JS .click()/dispatchEvent 对 React switch-tab 无效，必须 Input.dispatchMouseEvent 真实点击）
        _r = evaluate('(function(){var el=document.querySelector(".item-tab.switch-tab");if(!el)return "nf";el.scrollIntoView({block:"center"});var rr=el.getBoundingClientRect();if(rr.width>0&&rr.height>0)return JSON.stringify({x:rr.x+rr.width/2,y:rr.y+rr.height/2});return "nf";})()')
        if _r.startswith("{"):
            try:
                _c = json.loads(_r)
                send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": _c["x"], "y": _c["y"], "button": "left", "clickCount": 1})
                send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": _c["x"], "y": _c["y"], "button": "left", "clickCount": 1})
                log(f"点「以图发品」tab(CDP)：ok @({_c['x']:.0f},{_c['y']:.0f})")
                _r = "ok"
                progress("ai_publish.switch_tab", "done", "CDP 真实点击切换")
            except Exception as _e:
                log(f"点「以图发品」tab(CDP)：err {_e}")
                _r = "err"
        else:
            # fallback：旧版 JS 点击「以图发品」叶子（children.length===0）
            _r = evaluate('(function(){var all=document.querySelectorAll("*");for(var i=0;i<all.length;i++){var t=(all[i].textContent||"").trim();if(t==="以图发品"&&all[i].children.length===0){all[i].click();all[i].dispatchEvent(new MouseEvent("click",{bubbles:true}));return "clicked-tab";}}return "nf";})()')
            log(f"点「以图发品」tab(fallback JS)：{_r}")
        time.sleep(4)

        # 零点击注入：dispatch mouseenter 激活上传区（不触发文件弹框）
        evaluate("(function(){var z=document.querySelector('.upload-wrapper')||document.querySelector('[class*=\\\\\\\"upload\\\\\\\"]')||document.querySelector('.image-upload')||document.body;z.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}));return 'ok';})()")
        time.sleep(0.5)

        # 定位隐藏 file input（depth:-1 或 5）
        _mid = send("DOM.getDocument", {"depth": -1})
        doc = recv(_mid)
        if not doc or "root" not in (doc.get("result") or {}):
            # 大 DOM 下 depth:-1 可能失败，退 depth:5
            _mid = send("DOM.getDocument", {"depth": 5})
            doc = recv(_mid)
        if not doc or "root" not in (doc.get("result") or {}):
            log(f"DOM.getDocument 失败：{json.dumps(doc)[:150] if doc else 'None'}")
            return None
        root = doc["result"]["root"]["nodeId"]
        _mid = send("DOM.querySelectorAll", {"nodeId": root, "selector": "input[type=file]"})
        qs = recv(_mid)
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
        progress("ai_publish.upload", "done", f"{len(images_win)} 张主图已注入")

        # N1：轮询等待「确认，下一步」按钮 enabled（图片上传+AI识别需时间，最多约 40s）
        n1 = "nf"
        for _wi in range(20):
            time.sleep(2)
            n1 = evaluate(_js_btn_click("下一步"))
            if n1 == "ok":
                break
        log(f"N1: {n1}")
        if n1 != "ok":
            progress("ai_publish.n1", "failed", "「下一步」未就绪")
            return None
        progress("ai_publish.n1", "done", "已确认下一步")

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
                # 2026-10-23 实战：AI 识别候选类目未点选→「下一步」disabled。
                # 先点选候选类目（recommend-cate 或含「>>」的类目路径），触发「是否切换类目」确认弹窗
                evaluate('(function(){var el=document.querySelector(".recommend-cate, [class*=\\"recommend-cate\\"]");if(el){el.click();el.dispatchEvent(new MouseEvent("click",{bubbles:true}));return "cate-clicked";}var all=document.querySelectorAll("div,span,li");for(var i=0;i<all.length;i++){var t=all[i].textContent||"";if(t.indexOf(">>")>=0&&t.length<50&&all[i].offsetWidth>50){all[i].click();all[i].dispatchEvent(new MouseEvent("click",{bubbles:true}));return "cate:"+t.trim().substring(0,20);}}return "no-cate";})()')
            if retry == 3:
                # 点「确定」确认切换类目（弹窗），之后「下一步」变 enabled
                evaluate('(function(){var bs=document.querySelectorAll("button");for(var i=0;i<bs.length;i++){if((bs[i].textContent||"").trim()==="确定"&&!bs[i].disabled){bs[i].click();return "ok-clicked";}}return "no-ok";})()')
            if retry == 4:
                evaluate('(function(){var ins=document.querySelectorAll("input[type=radio],input[type=checkbox]");ins[0]&&ins[0].click();return "radio";})()')
            time.sleep(2)
        log(f"N2: {n2}")
        if n2 != "ok":
            progress("ai_publish.n2", "failed", "类目识别「下一步」未就绪")
            return None
        progress("ai_publish.n2", "done", "类目已确认")

        # 等 V2 表单到达（URL 含 publish.htm）
        time.sleep(8)
        url = evaluate("window.location.href") or ""
        if "publish.htm" in url:
            log(f"V2 到达：{url[:80]}")
            progress("ai_publish", "done", "已到达 V2 表单")
            return base_tab  # 同一 tab 内跳转（skill 验证：AI→类目→V2 同 tab）
        log(f"未达 V2：{url[:80]}")
        progress("ai_publish", "failed", "未到达 V2 表单")
        return None
    finally:
        try:
            ws.close()
        except Exception:
            pass


# ---------------- 第 1 步：GS 注入（多件优惠 + 重量，必须先于 DOM 填写） ----------------
def fix_category(evaluate, keyword="花盆"):
    """V2 表单修正类目（2026-10-23 实战）：以图发品 AI 类目误判（钥匙收纳盒/户外庭院摆件/花架），
    走「切换类目 → 点发布历史 keyword → 点确定确认」切到 config 的正确类目。
    必须在填表前调用（切类目会清空已填字段，所以先切再填）。"""
    if not keyword:
        return "skip"
    cur = evaluate("(function(){var b=document.body.innerText||'';var i=b.indexOf('当前类目');if(i<0)return '';return b.slice(i+4,i+60);})()") or ""
    if keyword in cur:
        log(f"类目已正确（含「{keyword}」）")
        return "ok"
    log(f"当前类目不含「{keyword}」，切换类目…")
    # 点「切换类目」
    evaluate("(function(){var els=document.querySelectorAll('*');for(var i=0;i<els.length;i++){if((els[i].textContent||'').trim()==='切换类目'){els[i].click();return 'clicked';}}return 'nf';})()")
    time.sleep(2)
    # 点 keyword（发布历史 next-tabs-tab）
    kw = json.dumps(keyword, ensure_ascii=False)
    evaluate(f"(function(){{var els=document.querySelectorAll('.next-tabs-tab');for(var i=0;i<els.length;i++){{if((els[i].textContent||'').trim()==={kw}){{els[i].click();els[i].dispatchEvent(new MouseEvent('click',{{bubbles:true}}));return 'clicked';}}}}return 'nf';}})()")
    time.sleep(2)
    # 点「确定」确认切换（弹「是否切换类目」）
    evaluate('(function(){var bs=document.querySelectorAll("button");for(var i=0;i<bs.length;i++){if((bs[i].textContent||"").trim()==="确定"&&!bs[i].disabled){bs[i].click();return "clicked";}}return "nf";})()')
    time.sleep(3)
    cur2 = evaluate("(function(){var b=document.body.innerText||'';var i=b.indexOf('当前类目');if(i<0)return '';return b.slice(i+4,i+60);})()") or ""
    if keyword in cur2:
        log(f"类目已切换到：{cur2.strip()[:40]}")
        return "switched"
    log(f"类目切换未生效：{cur2.strip()[:40]}")
    return "failed"


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
            // 多件优惠：启用 + 满2件打折 + 9.9折（2026-10-23 用户最终口径：选中启用，满2件打折，9.9）
            fv.multiDiscountPromotion={enable:true,type:'percent',value:9.9,condition:2,discountType:'PERCENT'};
            // 物流重量
            fv['deliver-card']=fv['deliver-card']||{};
            fv['deliver-card'].weight=__WEIGHT__;
            e.updateModels({formValues:fv});
            e.getModels().formError={};
            var back=e.getModels().formValues['deliver-card'];
            return 'gs_injected deliver-card='+JSON.stringify(back);
        }catch(err){return 'gs_fail:'+err.message;}
    })()
    """
    js = js.replace("__WEIGHT__", json.dumps(str(weight)))
    r = evaluate(js)
    log(f"GS 注入（多件优惠+重量 {weight}）：{r}")
    return r


# ---------------- 第 3 步：V2 填标题/导购 ----------------
def fill_v2_title_guide(evaluate, send, title, guide):
    """标题/导购：宽度索引法（w≥600，第1个=标题，第2个=导购）。
    ⚠️ 2026-10-23 实测：nativeSetter+dispatchEvent 对标题失效（DOM 有值但 fv.title 空），
    必须改 CDP 真实键盘法（点击 focus→Ctrl+A→Backspace→insertText→Tab）。
    导购标题（卖点）淘宝限制 ≤15 字：不足 10 字补全，最终截断到 15 字。"""
    guide = (guide or "").strip()
    if len(guide) < 10:
        guide = guide + "精选优质家居好物，做工精细"  # 13 字，≥10 字（旧「精选优质家居好物」8 字会报 CHK_BASIC_LENGTH_SHORT_BYTE）
    guide = guide[:15]
    find_wide = '(function(i){var ins=document.querySelectorAll("input");var wides=[];for(var j=0;j<ins.length;j++){if(ins[j].offsetWidth>=600)wides.push(ins[j]);}if(wides.length<=i)return "nf";wides[i].scrollIntoView({block:"center"});var r=wides[i].getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})(__IDX__)'
    r1 = _cdp_fill_input(evaluate, send, find_wide.replace("__IDX__", "0"), title, wait_after=0.5)
    r2 = _cdp_fill_input(evaluate, send, find_wide.replace("__IDX__", "1"), guide, wait_after=0.5)
    log(f"标题/导购（CDP键盘法）：{r1}/{r2}")
    return f"{r1}/{r2}"


# ---------------- 第 4 步：一口价 ----------------
def fill_v2_main_price(evaluate, send, price):
    """一口价：CDP 真实键盘法（2026-10-22 改版：nativeSetter+fiber 失效，必须 CDP 键盘走 React 合成事件）。"""
    find_js = ('(function(){var all=document.querySelectorAll("*");'
               'for(var i=0;i<all.length;i++){var t=(all[i].textContent||"").trim();'
               'if(t.indexOf("一口价")===0&&t.length<40){'
               'var inp=all[i].querySelector("input")||(all[i].parentElement&&all[i].parentElement.querySelector("input"));'
               'if(inp){inp.scrollIntoView({block:"center"});var r=inp.getBoundingClientRect();'
               'return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});}}}return "nf";})()')
    r = _cdp_fill_input(evaluate, send, find_js, price)
    log(f"一口价 {price}：{r}")
    return r


# ---------------- 第 5 步：SKU 抽屉 ----------------
def fill_sku_drawer(evaluate, send, recv, skus, type_name="规格"):
    """SKU 抽屉：单层自定义模式 + CDP 键盘法（Ctrl+A→Backspace→insertText→Tab→+）。
    skill 验证：nativeSetter 对中文 SKU 名无效，CDP insertText 8/8 一次过。
    2026-10 改版：需先「请选择」选套餐类型「单品」+「请输入」填规格类型名，再「输入规格」填值，
    否则「确认创建」后 saleProp 空、SKU 规格+数量消失。"""
    # 关闭可能弹出的批量导入弹窗
    evaluate('(function(){var c=document.querySelector(".next-dialog-close");if(c){c.click();}return "closed";})()')

    # 打开「创建规格」按钮 —— 2026-10 改版后 React 对 JS click 不响应，改 CDP 真实点击
    r = _cdp_click_btn(evaluate, send, "创建规格")
    time.sleep(2)
    if r != "ok":
        r = _cdp_click_btn(evaluate, send, "设置")  # fallback
        time.sleep(2)
    log(f"打开抽屉：{r}")

    # 选「单层展示」（文本匹配 label，skill 验证：idx=8，文本法更稳）
    evaluate('(function(){var ls=document.querySelectorAll("label.next-radio-wrapper");for(var i=0;i<ls.length;i++){var t=ls[i].textContent||"";if(t.indexOf("单层")>=0){ls[i].click();return "ok";}}return "nf";})()')
    time.sleep(0.5)

    # 填「请输入」（规格类型名，如「款式」）—— 2026-10 改版新增，缺这步 saleProp 不建立
    _r3 = evaluate('(function(){var ins=document.querySelectorAll("input[placeholder=\\"请输入\\"]");var ns=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;for(var i=0;i<ins.length;i++){if(ins[i].offsetWidth>50){ns.call(ins[i],__TYPE__);ins[i].dispatchEvent(new Event("input",{bubbles:true}));ins[i].dispatchEvent(new Event("change",{bubbles:true}));var key=Object.keys(ins[i]).find(function(k){return k.startsWith("__reactFiber");});if(key){var fb=ins[i][key];if(fb.memoizedProps&&fb.memoizedProps.onChange)fb.memoizedProps.onChange({target:ins[i]});}return "filled";}}return "nf";})()'.replace("__TYPE__", json.dumps(type_name, ensure_ascii=False)))
    log(f"填规格类型名「{type_name}」：{_r3}")
    time.sleep(1)

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

    # 填完所有行 → 点一次「确认创建」（skill 严格纠正：不是两次；2026-10 改版后改 CDP 真实点击）
    r = _cdp_click_btn(evaluate, send, "确认创建")
    time.sleep(3)
    log(f"确认创建：{r}")

    # 确认创建后，「套餐类型」区块（common-wrap）才渲染出来，这里选「单品」（套餐类型）
    # 2026-10 改版关键：不选套餐类型，SKU 的 saleProp 空 → 规格+数量消失
    _coord = "nf"
    for _t in range(10):
        _r = evaluate('(function(){var ws=document.querySelectorAll(".common-wrap");var w=null;for(var i=0;i<ws.length;i++){if((ws[i].textContent||"").indexOf("套餐类型")>=0){w=ws[i];break;}}if(!w)return "nf";var inp=w.querySelector("input[placeholder=\\"请选择\\"]");if(!inp)return "nf:noinput";var rr=inp.getBoundingClientRect();return JSON.stringify({x:rr.x+rr.width/2,y:rr.y+rr.height/2});})()')
        if _r.startswith("{"):
            _coord = _r
            break
        time.sleep(0.5)
    log(f"「套餐类型·请选择」坐标：{_coord}")
    if _coord.startswith("{"):
        try:
            c = json.loads(_coord)
            send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": c["x"], "y": c["y"], "button": "left", "clickCount": 1})
            send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": c["x"], "y": c["y"], "button": "left", "clickCount": 1})
            time.sleep(2)
            _r2 = evaluate('(function(){var els=document.querySelectorAll("*");for(var i=0;i<els.length;i++){var t=(els[i].textContent||"").trim();if(t==="单品"&&els[i].children.length===0){var rr=els[i].getBoundingClientRect();if(rr.width>0&&rr.height>0)return JSON.stringify({x:rr.x+rr.width/2,y:rr.y+rr.height/2});}}return "nf";})()')
            log(f"「单品」坐标：{_r2}")
            if _r2.startswith("{"):
                c2 = json.loads(_r2)
                send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": c2["x"], "y": c2["y"], "button": "left", "clickCount": 1})
                send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": c2["x"], "y": c2["y"], "button": "left", "clickCount": 1})
                log("选「单品」：selected")
                # 选完套餐类型「单品」后，需再点一次「确认创建」关闭抽屉（2026-10-22 二次改版）
                # 否则抽屉不关、SKU 表格不生成，后续 fill_sku_price_stock 填 0 个
                time.sleep(1)
                _r3 = _cdp_click_btn(evaluate, send, "确认创建")
                time.sleep(3)
                log(f"二次确认创建：{_r3}")
            else:
                log("选「单品」：nf")
        except Exception as e:
            log(f"选单品异常：{e}")
    return r


# ---------------- 第 6 步：价格/库存 ----------------
def fill_sku_price_stock(evaluate, send, skus):
    """逐行填价格/库存：td#N-skuPrice / td#N-skuStock 精确定位。
    2026-10-22 改版：nativeSetter+fiber 失效，必须 CDP 真实键盘法走 React 合成事件。"""
    prices = [sku["price"] for sku in skus]
    stock = skus[0]["stock"] if skus else 200
    done = 0
    for i, p in enumerate(prices):
        find_price = (f'(function(){{var td=document.getElementById("{i}-skuPrice");'
                      f'if(!td)return "nf";var inp=td.querySelector("input");'
                      f'if(!inp)return "nf:noinput";inp.scrollIntoView({{block:"center"}});'
                      f'var r=inp.getBoundingClientRect();'
                      f'return JSON.stringify({{x:r.x+r.width/2,y:r.y+r.height/2}});}})()')
        r = _cdp_fill_input(evaluate, send, find_price, p, wait_after=0.3)
        if r == "ok":
            done += 1
        find_stock = (f'(function(){{var td=document.getElementById("{i}-skuStock");'
                      f'if(!td)return "nf";var inp=td.querySelector("input");'
                      f'if(!inp)return "nf:noinput";inp.scrollIntoView({{block:"center"}});'
                      f'var r=inp.getBoundingClientRect();'
                      f'return JSON.stringify({{x:r.x+r.width/2,y:r.y+r.height/2}});}})()')
        r2 = _cdp_fill_input(evaluate, send, find_stock, stock, wait_after=0.3)
        if r2 == "ok":
            done += 1
    log(f"价格/库存：filled:{done}")
    return f"filled:{done}"


# ---------------- 第 6.5 步：物流重量 ---------------- 
def fill_v2_weight(evaluate, send, weight):
    """物流重量：CDP 真实键盘法（2026-10-22 改版：formError 报 deliverWeight，nativeSetter 失效）。
    定位「物流重量*」标签旁的 input。"""
    find_js = ('(function(){var all=document.querySelectorAll("*");'
               'for(var i=0;i<all.length;i++){var t=(all[i].textContent||"").trim();'
               'if(t.indexOf("物流重量")===0&&t.length<25){'
               'var inp=all[i].querySelector("input")||(all[i].parentElement&&all[i].parentElement.querySelector("input"));'
               'if(inp){inp.scrollIntoView({block:"center"});var r=inp.getBoundingClientRect();'
               'return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});}}}return "nf";})()')
    r = _cdp_fill_input(evaluate, send, find_js, weight, wait_after=0.5)
    log(f"物流重量 {weight}：{r}")
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
        // 第三层：body 报错文本（真正错误是「错误 (N)」格式，skill v2-form-verify 验证）
        var b=document.body.innerText||'';
        r.bodyErr=/错误\\s*\\(?\\d/.test(b)?'HAS_ERROR':'';
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


# ---------------- 自愈机制（2026-10-23：诊断→修复→内循环） ----------------

HEAL_MAX_ATTEMPTS = 3       # 整体重跑最大次数（主图空等需重跑的问题）
HEAL_MAX_LOCAL_ROUNDS = 3   # 内层局部修复最大轮数


def diagnose_form(evaluate):
    """诊断 V2 表单，返回问题列表。每个问题 {type, desc, fix}，fix∈{local, republish, manual}。"""
    js = r"""
    (function(){
        try{
            var e=__SELL_STATE__.getState().engine;
            var fv=e.getModels().formValues;
            var err=e.getModels().formError;
            var out={};
            out.mainImages=(fv.mainImagesGroup&&fv.mainImagesGroup.images)?fv.mainImagesGroup.images.length:0;
            out.title=(fv.title||'').trim();
            out.shopping=(fv.shopping_title||'').trim();
            out.skuLen=(fv.sku&&fv.sku.length)||0;
            var hard=[];
            for(var k in err){
                var v=err[k];
                var msgs=(v&&v.message)||[];
                for(var i=0;i<msgs.length;i++){
                    if(msgs[i].type==='error'){ hard.push({k:k,msg:msgs[i].msg||''}); break; }
                }
            }
            out.hardErrors=hard;
            return JSON.stringify(out);
        }catch(ex){ return JSON.stringify({err:String(ex)}); }
    })()
    """
    r = evaluate(js)
    try:
        d = json.loads(r)
    except Exception:
        return [{"type": "diag_error", "desc": str(r)[:100], "fix": "manual"}]
    problems = []
    if d.get("mainImages", 0) == 0:
        problems.append({"type": "main_images_empty", "desc": "1:1主图为空", "fix": "republish"})
    if not d.get("title"):
        problems.append({"type": "title_empty", "desc": "标题为空", "fix": "local"})
    if len(d.get("shopping", "")) < 10:
        problems.append({"type": "shopping_short", "desc": "导购标题少于10字", "fix": "local"})
    if d.get("skuLen", 0) == 0:
        problems.append({"type": "sku_empty", "desc": "SKU为空", "fix": "local"})
    for he in d.get("hardErrors", []):
        problems.append({"type": f"formerror_{he['k']}", "desc": he["msg"], "fix": "manual"})
    return problems


def _fix_title(evaluate, send, title):
    """标题空 → CDP 键盘法重填（宽 input 第 1 个）。"""
    find = ('(function(){var ins=document.querySelectorAll("input");var wides=[];'
            'for(var i=0;i<ins.length;i++){ if(ins[i].offsetWidth>=600) wides.push(ins[i]); }'
            'if(!wides.length) return "nf"; wides[0].scrollIntoView({block:"center"});'
            'var r=wides[0].getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()')
    return _cdp_fill_input(evaluate, send, find, title, wait_after=0.6)


def _fix_shopping_title(evaluate, send, guide):
    """导购标题短 → CDP 键盘法填（宽 input 第 2 个，补全到 10~15 字）。"""
    guide = (guide or "").strip()
    if len(guide) < 10:
        guide = guide + "精选优质家居好物，做工精细"
    guide = guide[:15]
    find = ('(function(){var ins=document.querySelectorAll("input");var wides=[];'
            'for(var i=0;i<ins.length;i++){ if(ins[i].offsetWidth>=600) wides.push(ins[i]); }'
            'if(wides.length<2) return "nf"; wides[1].scrollIntoView({block:"center"});'
            'var r=wides[1].getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()')
    return _cdp_fill_input(evaluate, send, find, guide, wait_after=0.6)


def _fix_sku_empty(evaluate, send):
    """SKU 空 → 取消「分层展示」里的空维度 prop-item（(0)），再点确认创建。"""
    empty_name = evaluate(r"""
    (function(){
        var labels=document.querySelectorAll('.common-wrap .props-label, .props-label');
        for(var i=0;i<labels.length;i++){
            var t=(labels[i].textContent||'').trim();
            if(t.indexOf('(0)')>=0){ return t.replace(/\(0\)/,'').trim(); }
        }
        return '';
    })()
    """) or ""
    if empty_name:
        loc = evaluate(('(function(){var items=document.querySelectorAll(".select-group .prop-item");'
                        'for(var i=0;i<items.length;i++){ if((items[i].textContent||"").trim()===%s){'
                        'items[i].scrollIntoView({block:"center"}); var r=items[i].getBoundingClientRect();'
                        'return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2}); }} return "nf";})()')
                       % json.dumps(empty_name, ensure_ascii=False))
        if loc.startswith("{"):
            c = json.loads(loc)
            send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": c["x"], "y": c["y"], "button": "left", "clickCount": 1})
            send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": c["x"], "y": c["y"], "button": "left", "clickCount": 1})
            time.sleep(1)
    _cdp_click_btn(evaluate, send, "确认创建")
    time.sleep(2)
    return "ok"


def self_heal_local(evaluate, send, title, guide, max_rounds=HEAL_MAX_LOCAL_ROUNDS):
    """内层局部自愈：诊断 → 局部修复 → 再诊断。只处理 fix=local 的问题。"""
    heal_log = []
    for rnd in range(1, max_rounds + 1):
        problems = diagnose_form(evaluate)
        if not problems:
            return {"ok": True, "rounds": rnd - 1, "log": heal_log, "problems": []}
        local = [p for p in problems if p["fix"] == "local"]
        if not local:
            return {"ok": False, "rounds": rnd - 1, "log": heal_log, "problems": problems}
        for p in local:
            try:
                if p["type"] == "title_empty":
                    r = _fix_title(evaluate, send, title)
                elif p["type"] == "shopping_short":
                    r = _fix_shopping_title(evaluate, send, guide)
                elif p["type"] == "sku_empty":
                    r = _fix_sku_empty(evaluate, send)
                else:
                    r = "skip"
                heal_log.append(f"{p['type']}:{r}")
                log(f"自愈修复 {p['type']} → {r}")
            except Exception as ex:
                heal_log.append(f"{p['type']}:ERR {ex}")
                log(f"自愈修复 {p['type']} 异常：{ex}")
            time.sleep(1)
    problems = diagnose_form(evaluate)
    return {"ok": not problems, "rounds": max_rounds, "log": heal_log, "problems": problems}


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
    # 规格类型名（2026-10 改版 SKU 抽屉「请输入」需要填类型名，如「款式」）
    _specs = config.get("specs") or []
    type_name = (_specs[0].get("type") if _specs and isinstance(_specs[0], dict) and _specs[0].get("type") else "规格")
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

    weight = config.get("logisticsWeight") or 1.0
    _ck = (config.get("categoryKeyword") or "").strip()
    main_price = max([s["price"] for s in skus]) if skus else 0

    last_problems = []
    for attempt in range(1, HEAL_MAX_ATTEMPTS + 1):
        log(f"=== 上架尝试 {attempt}/{HEAL_MAX_ATTEMPTS} ===")

        # 登录预检（每次重跑前，确保登录态 + myseller tab）
        lc = login_check()
        if not lc.get("ok"):
            progress("login_check", "failed", lc.get("reason"))
            print(json.dumps({"error": f"登录预检失败：{lc.get('reason')}"}))
            sys.exit(1)
        progress("login_check", "done", "复用已有登录tab" if lc.get("reused") else "登录态确认")
        tab_cleanup()

        # AI 以图发品
        v2_tab = ai_publish(images_win)
        if not v2_tab:
            print(json.dumps({"error": "AI 以图发品未到达 V2 表单（可能新版 iframe 页面/未登录/类目识别失败）"}))
            sys.exit(1)

        # 重连 V2 tab（AI 发品后同一 tab，但需重新握手）
        ws, send, recv, evaluate = ws_connect(v2_tab)
        try:
            # 第 0.5 步：类目修正（以图发品 AI 类目误判，切到 config 正确类目，须在填表前——切类目会清字段）
            if _ck:
                fix_category(evaluate, _ck)
                progress("fix_category", "done", f"已切换到「{_ck}」")
                time.sleep(1)
            else:
                progress("fix_category", "skip", "无类目关键词，跳过")
            # 第 1 步：GS 注入（多件优惠 + 重量）—— 必须最先（GS 会清 DOM 值，skill「GS→DOM」硬顺序）
            fill_v2_gs(evaluate, weight)
            progress("fill_gs", "done", "多件优惠+重量已注入")
            time.sleep(1)
            # 第 2 步：标题/导购
            fill_v2_title_guide(evaluate, send, title, guide)
            progress("fill_title", "done", "标题/导购已填")
            time.sleep(1)
            # 第 3 步：一口价
            fill_v2_main_price(evaluate, send, main_price)
            progress("fill_price", "done", f"一口价 {main_price}")
            time.sleep(1)
            # 第 4 步：SKU 抽屉
            fill_sku_drawer(evaluate, send, recv, skus, type_name)
            progress("fill_sku", "done", f"SKU {len(skus)} 个")
            time.sleep(1)
            # 第 5 步：价格/库存
            fill_sku_price_stock(evaluate, send, skus)
            progress("fill_sku_ps", "done", "价格/库存已填")
            time.sleep(1)
            # 第 6 步：物流重量
            fill_v2_weight(evaluate, send, weight)
            progress("fill_weight", "done", f"重量 {weight}")
            time.sleep(1)

            # 第 7 步：内层局部自愈（标题/导购/SKU 局部修复）
            heal = self_heal_local(evaluate, send, title, guide)
            log(f"自愈结果：{json.dumps(heal, ensure_ascii=False)}")
            if heal.get("ok"):
                progress("self_heal", "done", "自愈通过（无需修复）")
            else:
                _fixes = [x for x in heal.get("log", []) if not x.endswith(":skip")]
                progress("self_heal", "fix", f"已修复 {len(_fixes)} 项" if _fixes else "自愈未完全解决")

            # 第 8 步：诊断最终状态，主图空则重跑 AI 发品
            problems = diagnose_form(evaluate)
            if any(p["type"] == "main_images_empty" for p in problems):
                last_problems = problems
                log(f"主图空，重跑 AI 发品（第 {attempt}/{HEAL_MAX_ATTEMPTS} 次）")
                progress("diagnose", "retry", "主图空，重跑 AI 发品")
                continue
            if problems:
                progress("diagnose", "failed", f"{len(problems)} 项问题：{problems[0]['desc']}")
            else:
                progress("diagnose", "done", "诊断无问题")

            # 校验 + 输出结果
            verify = verify_form(evaluate)
            progress("verify", "done", "校验完成")
            result = {
                "status": "ready_for_manual_submit",
                "title": title,
                "sku_count": len(skus),
                "attempt": attempt,
                "heal": heal,
                "problems": problems,
                "verify": verify,
                "note": "淘宝「提交宝贝」按钮被 React 拦截，CDP/JS 无法触发真实提交，请人工在 Edge 9222 手动点击提交",
            }
            log(f"RESULT_READY {json.dumps(result, ensure_ascii=False)}")
            progress("manual_submit", "manual", "待人工在 Edge 9222 点击「提交宝贝」")
            print(json.dumps(result, ensure_ascii=False))
            return 0
        finally:
            try:
                ws.close()
            except Exception:
                pass

    # 达到重跑上限，仍未解决
    result = {"status": "heal_exhausted", "attempts": HEAL_MAX_ATTEMPTS, "problems": last_problems}
    log(f"RESULT_EXHAUSTED {json.dumps(result, ensure_ascii=False)}")
    print(json.dumps(result, ensure_ascii=False))
    return 1


if __name__ == "__main__":
    sys.exit(main())
