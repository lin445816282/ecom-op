#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""1688 搜索联想词采集 → 灌进 ecom-op 关键词库（长尾词，含热度排序）"""
import subprocess
import json
import time
import urllib.request
import sys
import io
import os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

NODE = "/mnt/d/Program Files/nodejs/node.exe"
CDP = r"C:\tmp\cdp_eval.js"
KEYWORDS_URL = "http://127.0.0.1:8765/api/keywords"
ACCESS_TOKEN = os.environ.get("ECOM_OP_TOKEN", "Alcz8283103")

CORE_WORDS = [
    "门后挂钩", "挂衣钩", "挂衣架", "衣钩", "门后收纳",
    "收纳架", "免打孔挂钩", "挂架", "置物架",
]


def cdp(js, timeout=30):
    r = subprocess.run([NODE, CDP], input=js, capture_output=True, text=True, timeout=timeout)
    try:
        d = json.loads(r.stdout)
        return d["result"]["value"]
    except Exception:
        return None


def hot_of(rank):
    """联想词排序 → 热度分档：前3热，4-8中，9+长尾"""
    if rank <= 3:
        return "热"
    if rank <= 8:
        return "中"
    return "长尾"


def collect_suggest(word):
    """输入 word，采集联想词，返回 [(词, 排序), ...]（排序越前越热）"""
    js = f'''(() => {{
      const input = document.querySelector('#alisearch-input');
      if (!input) return 'NO_INPUT';
      input.focus();
      const ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      ns.call(input, '{word}');
      input.dispatchEvent(new Event('input', {{bubbles:true}}));
      input.dispatchEvent(new Event('keyup', {{bubbles:true}}));
      return 'OK';
    }})()'''
    cdp(js)
    time.sleep(2.5)
    js2 = '''(() => {
      const items = [...document.querySelectorAll('.suggestion-item')].map(el => (el.textContent||'').replace(/\\s+/g,''));
      return JSON.stringify(items);
    })()'''
    v = cdp(js2)
    if not v:
        return []
    try:
        items = json.loads(v)
    except Exception:
        return []
    result = []
    for idx, w in enumerate(items):
        if word in w and w != word:
            result.append((w, idx + 1))
    return result


def main():
    all_words = {}
    for word in CORE_WORDS:
        words = collect_suggest(word)
        for w, rank in words:
            hot = hot_of(rank)
            if w not in all_words:
                all_words[w] = (word, hot)
            else:
                # 已存在则保留更靠前（更热）的档位
                old = all_words[w]
                if hot == "热" or (hot == "中" and old[1] == "长尾"):
                    all_words[w] = (word, hot)
        print(f"[{word}] 采集 {len(words)} 个联想词")
        time.sleep(1.0)

    print(f"\n共采集 {len(all_words)} 个去重长尾词")

    added = 0
    failed = []
    for w, (src, hot) in all_words.items():
        item = {"word": w, "category": "长尾词", "source": "1688联想词",
                "status": "待用", "notes": f"核心词:{src}", "hot": hot}
        data = json.dumps(item).encode("utf-8")
        req = urllib.request.Request(
            KEYWORDS_URL, data=data, method="POST",
            headers={"Content-Type": "application/json",
                     "Authorization": f"Bearer {ACCESS_TOKEN}",
                     "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0"},
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                resp.read()
            added += 1
        except Exception as e:
            failed.append((w, str(e)))

    print(f"\n入库 {added} 个长尾词" + (f"，失败 {len(failed)} 个" if failed else ""))
    for w, e in failed:
        print(f"  失败 {w}: {e}")


if __name__ == "__main__":
    main()
