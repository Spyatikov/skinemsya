#!/bin/sh
# Сборка приложения для демо-записи: исходники из основного репозитория, API подменяется mock.js
set -e
cd "$(dirname "$0")"
APP=/home/claude/skinemsya
mkdir -p dist
cp "$APP/public/logo.png" dist/logo.png
NODE_PATH=/tmp/claude-0/nm /opt/npm-tools/node_modules/.bin/esbuild "$APP/src/main.tsx" --bundle --outfile=dist/app.js \
  --jsx=automatic --loader:.png=file --minify --log-level=warning \
  --define:import.meta.env.VITE_API_URL='"https://demo.supabase.co/functions/v1/api"' \
  --define:import.meta.env.VITE_SUPABASE_ANON_KEY='"demo"' \
  --define:import.meta.env.VITE_BOT_USERNAME='"skinemsya_app_bot"' \
  --define:import.meta.env.VITE_APP_SHORT_NAME='"app"' \
  --define:import.meta.env.BASE_URL='"./"'
cp mock.js dist/mock.js
cat > dist/index.html <<'EOF'
<!doctype html>
<html lang="ru"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
<meta name="color-scheme" content="dark" /><title>Скинемся</title>
<link rel="stylesheet" href="app.css" />
<style>:root{--font:"Inter",-apple-system,sans-serif} body{font-family:var(--font)} ::-webkit-scrollbar{display:none}</style>
<script src="mock.js"></script></head>
<body><div id="root"></div><script src="app.js"></script></body></html>
EOF
echo built
