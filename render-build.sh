#!/usr/bin/env bash
set -o errexit
npm install
PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer mkdir -p $PUPPETEER_CACHE_DIR
npx puppeteer browsers install chrome
# Кешування для повторних деплоїв
if [[ ! -d $PUPPETEER_CACHE_DIR ]]; then
  cp -R /opt/render/project/src/.cache/puppeteer/chrome/ $PUPPETEER_CACHE_DIR
else
  cp -R $PUPPETEER_CACHE_DIR /opt/render/project/src/.cache/puppeteer/chrome/
fi
