#!/bin/bash
set -eu
TOOL_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$(mktemp -d /private/tmp/echo-chunk-receiver.XXXXXX)"
export CLANG_MODULE_CACHE_PATH="$BUILD_DIR/cache"
swiftc "$TOOL_DIR/main.swift" -o "$BUILD_DIR/echo-chunk-receiver"
if [ "$#" -eq 0 ]; then
 printf 'Join Echo Wi-Fi. Device address [192.168.4.1]: '
 read -r DEVICE_ADDRESS
 exec "$BUILD_DIR/echo-chunk-receiver" --host "${DEVICE_ADDRESS:-192.168.4.1}"
fi
exec "$BUILD_DIR/echo-chunk-receiver" "$@"
