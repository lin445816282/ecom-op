#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""每日采集拼多多店铺「前一天」订单（串行，避免共享 C:\\tmp 文件冲突）。

覆盖 3 家店：如若月下(3)、嘉裕(5)、欧世艺(6)。
闲时来(1) CDP 端口已丢失，排除，等端口恢复后再加回。
脚本 pdd_monthly_export.py 不传日期参数时默认采「昨天」。
"""
import json
import subprocess
import sys

SHOPS = [
    (3, "如若月下"),
    (5, "嘉裕工艺品"),
    (6, "欧世艺旗舰店"),
    (1, "闲时来工艺"),
]


def main():
    results = []
    for sid, name in SHOPS:
        try:
            r = subprocess.run(
                [sys.executable, "scripts/pdd_monthly_export.py", str(sid)],
                capture_output=True, text=True, timeout=1000,
            )
            # 从输出里挑出 JSON 行（以 { 开头）
            data = None
            for line in (r.stdout or "").splitlines():
                line = line.strip()
                if line.startswith("{"):
                    try:
                        data = json.loads(line)
                        break
                    except Exception:
                        continue
            if data is None:
                results.append({"_shop": name, "_err": (r.stderr or r.stdout or "")[:300]})
            else:
                data["_shop"] = name
                results.append(data)
        except subprocess.TimeoutExpired:
            results.append({"_shop": name, "_err": "超时(>16分钟)"})
        except Exception as e:
            results.append({"_shop": name, "_err": str(e)})
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
