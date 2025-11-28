#!/usr/bin/env bash
# Render Puppeteer build script
set -o errexit

npm install

# Створюємо кеш-директорію
mkdir -p /opt/render/.cache/puppeteer

# Встановлюємо Chromium у правильне місце
PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer npx puppeteer browsers install chrome

echo "Chromium installed to: $(npx puppeteer browsers path)"
