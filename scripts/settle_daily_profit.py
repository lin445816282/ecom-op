#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""结算指定日期（默认昨天）各店盈利，写入 daily_profit 表。

用法：python3 settle_daily_profit.py [YYYY-MM-DD]
"""
import json
import sys
from datetime import datetime, timedelta

import catalog


def main():
    date = sys.argv[1] if len(sys.argv) > 1 else (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    catalog.init_db()
    result = catalog.settle_daily_profit(date)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
