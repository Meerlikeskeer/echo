#!/bin/bash
set -eu
TOOL_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$(mktemp -d /private/tmp/echo-radio-test.XXXXXX)"
export CLANG_MODULE_CACHE_PATH="$BUILD_DIR/cache"
printf 'Building Echo radio test…\n'
swiftc "$TOOL_DIR/main.swift" -o "$BUILD_DIR/echo-radio-test" -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker "$TOOL_DIR/Info.plist"
if [ "$#" -eq 0 ]; then
  printf 'Disconnect nRF Connect, enable the probe, and join Echo Wi-Fi first.\n'
  printf 'Device address [192.168.4.1]: '
  read -r DEVICE_ADDRESS
  DEVICE_ADDRESS="${DEVICE_ADDRESS:-192.168.4.1}"
  REPORT_PATH="$HOME/Desktop/echo-radio-test-$(date +%Y%m%d-%H%M%S).json"
  exec "$BUILD_DIR/echo-radio-test" --host "$DEVICE_ADDRESS" --report "$REPORT_PATH"
fi
exec "$BUILD_DIR/echo-radio-test" "$@"
