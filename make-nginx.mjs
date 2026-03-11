import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
if (process.argv[2]) process.chdir(resolve(process.argv[2]));

// ─── nginx.conf (main config) ───
const nginxMainConf = `
user nginx;
worker_processes auto;
worker_rlimit_nofile 65535;
pid /run/nginx.pid;
error_log /var/log/nginx/error.log warn;

events {
    worker_connections 4096;
    multi_accept on;
    use epoll;
}

http {
    # ─── Basic ───
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    charset       utf-8;
    server_tokens off;  # Hide nginx version

    # ─── Logging ───
    log_format main '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent" '
                    '$request_time $upstream_response_time';

    log_format json escape=json '{'
        '"time":"$time_iso8601",'
        '"remote_addr":"$remote_addr",'
        '"request":"$request",'
        '"status":$status,'
        '"body_bytes_sent":$body_bytes_sent,'
        '"request_time":$request_time,'
        '"upstream_response_time":"$upstream_response_time",'
        '"http_referrer":"$http_referer",'
        '"http_user_agent":"$http_user_agent"'
    '}';

    access_log /var/log/nginx/access.log json;

    # ─── Performance ───
    sendfile        on;
    tcp_nopush      on;
    tcp_nodelay     on;
    keepalive_timeout 65;
    keepalive_requests 1000;
    types_hash_max_size 2048;
    client_max_body_size 20M;
    client_body_buffer_size 128k;
    large_client_header_buffers 4 16k;

    # ─── Gzip ───
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_buffers 16 8k;
    gzip_http_version 1.1;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/x-javascript
        application/xml
        application/xml+rss
        application/atom+xml
        image/svg+xml
        font/opentype
        font/ttf
        font/woff
        font/woff2;

    # ─── Brotli (if module available) ───
    # brotli on;
    # brotli_comp_level 6;
    # brotli_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    # ─── Security Headers (global) ───
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # ─── Rate Limiting Zones ───
    limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
    limit_req_zone $binary_remote_addr zone=upload:10m rate=3r/m;

    # Connection limiting
    limit_conn_zone $binary_remote_addr zone=addr:10m;

    # ─── Proxy Cache ───
    proxy_cache_path /var/cache/nginx/api
        levels=1:2
        keys_zone=api_cache:10m
        max_size=1g
        inactive=60m
        use_temp_path=off;

    proxy_cache_path /var/cache/nginx/static
        levels=1:2
        keys_zone=static_cache:10m
        max_size=5g
        inactive=7d
        use_temp_path=off;

    # ─── Upstream (load balancing) ───
    upstream app_backend {
        least_conn;  # or: round_robin, ip_hash, hash $request_uri

        server app-1:3000 weight=5 max_fails=3 fail_timeout=30s;
        server app-2:3000 weight=5 max_fails=3 fail_timeout=30s;
        server app-3:3000 weight=3 max_fails=3 fail_timeout=30s backup;

        keepalive 32;
        keepalive_timeout 60s;
    }

    # ─── Real IP (behind load balancer / CDN) ───
    set_real_ip_from 10.0.0.0/8;
    set_real_ip_from 172.16.0.0/12;
    set_real_ip_from 192.168.0.0/16;
    # CloudFlare IPs
    set_real_ip_from 103.21.244.0/22;
    set_real_ip_from 103.22.200.0/22;
    set_real_ip_from 103.31.4.0/22;
    set_real_ip_from 104.16.0.0/13;
    set_real_ip_from 104.24.0.0/14;
    set_real_ip_from 108.162.192.0/18;
    set_real_ip_from 131.0.72.0/22;
    set_real_ip_from 141.101.64.0/18;
    set_real_ip_from 162.158.0.0/15;
    set_real_ip_from 172.64.0.0/13;
    set_real_ip_from 173.245.48.0/20;
    set_real_ip_from 188.114.96.0/20;
    set_real_ip_from 190.93.240.0/20;
    set_real_ip_from 197.234.240.0/22;
    set_real_ip_from 198.41.128.0/17;
    real_ip_header X-Forwarded-For;
    real_ip_recursive on;

    # Include site configs
    include /etc/nginx/conf.d/*.conf;
}
`;

// ─── default.conf (site config) ───
const siteConf = `
# ─── HTTP → HTTPS redirect ───
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;

    # ACME challenge for cert-manager / Let's Encrypt
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# ─── HTTPS main server ───
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name example.com www.example.com;

    # ─── SSL ───
    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_trusted_certificate /etc/nginx/ssl/chain.pem;

    # SSL protocols & ciphers
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # SSL session
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # CSP
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https:; connect-src 'self' https:; frame-ancestors 'none';" always;

    # ─── Connection limit ───
    limit_conn addr 100;

    # ─── Logging ───
    access_log /var/log/nginx/app_access.log json;
    error_log  /var/log/nginx/app_error.log warn;

    # ─── Static files (with cache) ───
    location /static/ {
        alias /var/www/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options "nosniff" always;
        proxy_cache static_cache;
        proxy_cache_valid 200 30d;

        # Optimize file serving
        open_file_cache max=1000 inactive=20s;
        open_file_cache_valid 30s;
        open_file_cache_min_uses 2;
        open_file_cache_errors on;
    }

    # Favicon
    location = /favicon.ico {
        log_not_found off;
        access_log off;
        expires 30d;
    }

    # Robots
    location = /robots.txt {
        log_not_found off;
        access_log off;
    }

    # ─── API endpoints ───
    location /api/ {
        limit_req zone=api burst=20 nodelay;

        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;

        # Timeouts
        proxy_connect_timeout 10s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;

        # Cache API responses
        proxy_cache api_cache;
        proxy_cache_valid 200 5m;
        proxy_cache_valid 404 1m;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        proxy_cache_lock on;
        proxy_cache_lock_timeout 5s;
        add_header X-Cache-Status $upstream_cache_status always;

        # CORS headers
        add_header Access-Control-Allow-Origin $http_origin always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PATCH, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type, X-Requested-With" always;
        add_header Access-Control-Allow-Credentials "true" always;
        add_header Access-Control-Max-Age 86400 always;

        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }

    # ─── Auth endpoints (strict rate limit) ───
    location /api/auth/ {
        limit_req zone=login burst=3 nodelay;

        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 10s;
        proxy_send_timeout 15s;
        proxy_read_timeout 15s;

        # No cache for auth
        proxy_no_cache 1;
        proxy_cache_bypass 1;
    }

    # ─── Upload endpoint ───
    location /api/upload {
        limit_req zone=upload burst=2 nodelay;
        client_max_body_size 50M;

        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 10s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;

        # Disable buffering for uploads
        proxy_request_buffering off;
    }

    # ─── WebSocket ───
    location /ws {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # ─── Health check ───
    location /healthz {
        access_log off;
        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    # ─── Metrics (internal only) ───
    location /metrics {
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        deny all;

        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    # ─── Nginx status (internal) ───
    location /nginx_status {
        stub_status on;
        allow 10.0.0.0/8;
        allow 127.0.0.1;
        deny all;
        access_log off;
    }

    # ─── Default proxy (SPA / frontend) ───
    location / {
        limit_req zone=general burst=30 nodelay;

        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;

        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # For SPA: try files, then proxy
        # try_files $uri $uri/ @proxy;
    }

    # ─── Deny hidden files ───
    location ~ /\\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    # ─── Deny sensitive files ───
    location ~* \\.(env|git|svn|htaccess|htpasswd|ini|log|sh|sql|bak|config)$ {
        deny all;
        access_log off;
        log_not_found off;
    }

    # ─── Custom error pages ───
    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;

    location = /50x.html {
        root /usr/share/nginx/html;
        internal;
    }
}
`;

// ─── Dockerfile for Nginx ───
const nginxDockerfile = `
FROM nginx:1.25-alpine

# Remove default config
RUN rm -f /etc/nginx/conf.d/default.conf

# Create cache directories
RUN mkdir -p /var/cache/nginx/api /var/cache/nginx/static \\
    && chown -R nginx:nginx /var/cache/nginx

# Create certbot directory
RUN mkdir -p /var/www/certbot

# Copy configurations
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost/healthz || exit 1

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
`;

// ─── SSL generation script ───
const sslScript = `
#!/bin/bash
# Generate self-signed SSL certificates for development
# For production, use cert-manager or Let's Encrypt

set -e

SSL_DIR="./nginx/ssl"
mkdir -p "$SSL_DIR"

if [ -f "$SSL_DIR/fullchain.pem" ]; then
    echo "⚠️ SSL certificates already exist"
    exit 0
fi

echo "🔐 Generating self-signed SSL certificates..."

openssl req -x509 -nodes \\
    -days 365 \\
    -newkey rsa:2048 \\
    -keyout "$SSL_DIR/privkey.pem" \\
    -out "$SSL_DIR/fullchain.pem" \\
    -subj "/C=VN/ST=HCM/L=HCM/O=Dev/CN=localhost" \\
    -addext "subjectAltName=DNS:localhost,DNS:example.com,DNS:*.example.com,IP:127.0.0.1"

# Create chain (same as fullchain for self-signed)
cp "$SSL_DIR/fullchain.pem" "$SSL_DIR/chain.pem"

echo "✅ SSL certificates generated in $SSL_DIR/"
echo "   - fullchain.pem"
echo "   - privkey.pem"
echo "   - chain.pem"
`;

// ─── Write all files ───
const dirs = ["nginx", "nginx/ssl"];

for (const d of dirs) {
  if (!existsSync(d)) {
    mkdirSync(d, { recursive: true });
  }
}
console.log("📁 Created nginx/");

const files = [
  { name: "nginx/nginx.conf", content: nginxMainConf },
  { name: "nginx/default.conf", content: siteConf },
  { name: "nginx/Dockerfile", content: nginxDockerfile },
  { name: "nginx/generate-ssl.sh", content: sslScript },
];

for (const file of files) {
  if (!existsSync(file.name)) {
    writeFileSync(file.name, file.content.trim());
    console.log(`✅ ${file.name} created`);
  } else {
    console.log(`⚠️ ${file.name} already exists`);
  }
}

console.log(`
🚀 Nginx setup done!

Files:
  nginx/nginx.conf         → Main config (workers, gzip, rate limiting, upstream, cache)
  nginx/default.conf       → Site config (SSL, reverse proxy, rate limits, WebSocket)
  nginx/Dockerfile         → Production Nginx image
  nginx/generate-ssl.sh    → Self-signed SSL for dev

Features:
  - HTTP/2, TLS 1.2+, OCSP stapling, HSTS
  - Rate limiting: general (10r/s), API (30r/s), login (5r/m), upload (3r/m)
  - Upstream load balancing (least_conn, 3 backends, keepalive)
  - Proxy caching (API: 5min, static: 30d)
  - WebSocket support (/ws)
  - CloudFlare real IP resolution
  - JSON structured logging
  - Security: CSP, hidden files blocked, sensitive files denied
  - CORS headers on API routes
  - Internal-only metrics & nginx status
`);
