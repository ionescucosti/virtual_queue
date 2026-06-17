#!/bin/sh
# Starts cloudflared and writes the tunnel URL to /shared/tunnel_url for the API to read.
mkdir -p /shared
cloudflared tunnel --no-autoupdate --metrics 0.0.0.0:8080 --url "$1" 2>&1 | while IFS= read -r line; do
    printf '%s\n' "$line"
    url=$(printf '%s' "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1)
    if [ -n "$url" ]; then
        printf '%s' "$url" > /shared/tunnel_url
    fi
done
