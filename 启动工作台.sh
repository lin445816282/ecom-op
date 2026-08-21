#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "正在启动电商运营工作台..."
exec python3 api.py
