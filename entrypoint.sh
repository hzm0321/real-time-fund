#!/bin/sh
# 在启动 Nginx 前，将静态资源中的占位符替换为运行时环境变量
set -e

HTML_ROOT="/usr/share/nginx/html"

# 转义 sed 替换串中的特殊字符：\ & |
escape_sed() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/&/\\&/g; s/|/\\|/g'
}

# 占位符与环境变量对应（占位符名 = 变量名）
replace_var() {
  placeholder="$1"
  value=$(escape_sed "${2:-}")
  find "$HTML_ROOT" -type f \( -name '*.js' -o -name '*.html' \) -exec sed -i "s|${placeholder}|${value}|g" {} \;
}

# URL 构建时使用合法占位，此处替换为运行时环境变量
replace_var "https://runtime-replace.supabase.co" "${NEXT_PUBLIC_SUPABASE_URL}"
replace_var "__NEXT_PUBLIC_SUPABASE_ANON_KEY__" "${NEXT_PUBLIC_SUPABASE_ANON_KEY}"
replace_var "__NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY__" "${NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY}"
replace_var "__NEXT_PUBLIC_GA_ID__" "${NEXT_PUBLIC_GA_ID}"
replace_var "__NEXT_PUBLIC_GITHUB_LATEST_RELEASE_URL__" "${NEXT_PUBLIC_GITHUB_LATEST_RELEASE_URL}"

exec nginx -g "daemon off;"
