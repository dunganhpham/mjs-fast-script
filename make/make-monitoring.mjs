import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
if (process.argv[2]) process.chdir(resolve(process.argv[2]));

// ─── docker-compose.monitoring.yml ───
const monitoringCompose = `
services:
  # ─── Prometheus ───
  prometheus:
    image: prom/prometheus:v2.50.1
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./monitoring/prometheus/alerts.yml:/etc/prometheus/alerts.yml:ro
      - prometheus_data:/prometheus
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--storage.tsdb.retention.time=15d"
      - "--web.console.libraries=/etc/prometheus/console_libraries"
      - "--web.console.templates=/etc/prometheus/consoles"
      - "--web.enable-lifecycle"
    restart: unless-stopped
    networks:
      - monitoring

  # ─── Grafana ───
  grafana:
    image: grafana/grafana:10.3.3
    container_name: grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_SERVER_DOMAIN=localhost
      - GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH=/var/lib/grafana/dashboards/app-dashboard.json
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./monitoring/grafana/dashboards:/var/lib/grafana/dashboards:ro
    depends_on:
      - prometheus
    restart: unless-stopped
    networks:
      - monitoring

  # ─── Alertmanager ───
  alertmanager:
    image: prom/alertmanager:v0.27.0
    container_name: alertmanager
    ports:
      - "9093:9093"
    volumes:
      - ./monitoring/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
    command:
      - "--config.file=/etc/alertmanager/alertmanager.yml"
    restart: unless-stopped
    networks:
      - monitoring

  # ─── Node Exporter (host metrics) ───
  node-exporter:
    image: prom/node-exporter:v1.7.0
    container_name: node-exporter
    ports:
      - "9100:9100"
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - "--path.procfs=/host/proc"
      - "--path.rootfs=/rootfs"
      - "--path.sysfs=/host/sys"
      - "--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)"
    restart: unless-stopped
    networks:
      - monitoring

  # ─── cAdvisor (container metrics) ───
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.49.1
    container_name: cadvisor
    ports:
      - "8082:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker:/var/lib/docker:ro
    restart: unless-stopped
    networks:
      - monitoring

  # ─── Loki (log aggregation) ───
  loki:
    image: grafana/loki:2.9.4
    container_name: loki
    ports:
      - "3100:3100"
    volumes:
      - ./monitoring/loki/loki.yml:/etc/loki/local-config.yaml:ro
      - loki_data:/loki
    command: -config.file=/etc/loki/local-config.yaml
    restart: unless-stopped
    networks:
      - monitoring

volumes:
  prometheus_data:
  grafana_data:
  loki_data:

networks:
  monitoring:
    driver: bridge
`;

// ─── Prometheus config ───
const prometheusConfig = `
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  scrape_timeout: 10s

# ─── Alertmanager ───
alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]

# ─── Alert rules ───
rule_files:
  - "alerts.yml"

# ─── Scrape targets ───
scrape_configs:
  # Prometheus self-monitoring
  - job_name: "prometheus"
    static_configs:
      - targets: ["localhost:9090"]

  # Application metrics
  - job_name: "app"
    metrics_path: /metrics
    scrape_interval: 10s
    static_configs:
      - targets: ["host.docker.internal:3000"]
        labels:
          service: app
          environment: development

  # Node Exporter (host metrics)
  - job_name: "node-exporter"
    static_configs:
      - targets: ["node-exporter:9100"]

  # cAdvisor (container metrics)
  - job_name: "cadvisor"
    static_configs:
      - targets: ["cadvisor:8080"]

  # PostgreSQL (if using postgres_exporter)
  # - job_name: "postgres"
  #   static_configs:
  #     - targets: ["postgres-exporter:9187"]

  # Redis (if using redis_exporter)
  # - job_name: "redis"
  #   static_configs:
  #     - targets: ["redis-exporter:9121"]

  # Nginx (if using nginx_exporter)
  # - job_name: "nginx"
  #   static_configs:
  #     - targets: ["nginx-exporter:9113"]
`;

// ─── Prometheus alert rules ───
const alertRules = `
groups:
  - name: app
    rules:
      # ─── High error rate ───
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High HTTP error rate (> 5%)"
          description: "{{ $labels.instance }} has error rate of {{ $value | humanizePercentage }}"

      # ─── High latency ───
      - alert: HighLatency
        expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High p99 latency (> 2s)"
          description: "{{ $labels.instance }} p99 latency is {{ $value }}s"

      # ─── App down ───
      - alert: AppDown
        expr: up{job="app"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Application is down"
          description: "{{ $labels.instance }} has been down for more than 1 minute"

  - name: infrastructure
    rules:
      # ─── High CPU ───
      - alert: HighCPU
        expr: 100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage (> 85%)"

      # ─── High Memory ───
      - alert: HighMemory
        expr: (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100 > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage (> 85%)"

      # ─── Disk space ───
      - alert: LowDiskSpace
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100 < 15
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Low disk space (< 15% free)"

      # ─── Container restart ───
      - alert: ContainerRestarting
        expr: increase(container_restart_count[1h]) > 3
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Container restarting frequently"
`;

// ─── Alertmanager config ───
const alertmanagerConfig = `
global:
  resolve_timeout: 5m

route:
  group_by: ["alertname", "severity"]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: "default"

  routes:
    - match:
        severity: critical
      receiver: "critical"
      repeat_interval: 1h

    - match:
        severity: warning
      receiver: "default"
      repeat_interval: 4h

receivers:
  - name: "default"
    # slack_configs:
    #   - api_url: "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
    #     channel: "#alerts"
    #     title: '{{ template "slack.default.title" . }}'
    #     text: '{{ template "slack.default.text" . }}'

  - name: "critical"
    # slack_configs:
    #   - api_url: "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
    #     channel: "#alerts-critical"
    # email_configs:
    #   - to: "oncall@example.com"
    #     from: "alerts@example.com"
    #     smarthost: "smtp.example.com:587"

inhibit_rules:
  - source_match:
      severity: "critical"
    target_match:
      severity: "warning"
    equal: ["alertname"]
`;

// ─── Grafana provisioning - datasources ───
const grafanaDatasources = `
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    editable: false
`;

// ─── Grafana provisioning - dashboards ───
const grafanaDashboardProvider = `
apiVersion: 1

providers:
  - name: "default"
    orgId: 1
    folder: ""
    type: file
    disableDeletion: false
    editable: true
    updateIntervalSeconds: 30
    options:
      path: /var/lib/grafana/dashboards
      foldersFromFilesStructure: false
`;

// ─── Grafana dashboard JSON ───
const grafanaDashboard = `
{
  "dashboard": {
    "title": "Application Dashboard",
    "uid": "app-dashboard",
    "timezone": "browser",
    "refresh": "10s",
    "time": { "from": "now-1h", "to": "now" },
    "panels": [
      {
        "title": "Request Rate",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{route}} {{status}}"
          }
        ]
      },
      {
        "title": "Response Time (p50, p95, p99)",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
        "targets": [
          { "expr": "histogram_quantile(0.50, rate(http_request_duration_seconds_bucket[5m]))", "legendFormat": "p50" },
          { "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))", "legendFormat": "p95" },
          { "expr": "histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))", "legendFormat": "p99" }
        ]
      },
      {
        "title": "Error Rate",
        "type": "stat",
        "gridPos": { "h": 4, "w": 6, "x": 0, "y": 8 },
        "targets": [
          { "expr": "rate(http_requests_total{status=~'5..'}[5m]) / rate(http_requests_total[5m]) * 100", "legendFormat": "Error %" }
        ],
        "fieldConfig": { "defaults": { "unit": "percent", "thresholds": { "steps": [{"color": "green", "value": null}, {"color": "yellow", "value": 1}, {"color": "red", "value": 5}] } } }
      },
      {
        "title": "Active Connections",
        "type": "stat",
        "gridPos": { "h": 4, "w": 6, "x": 6, "y": 8 },
        "targets": [
          { "expr": "nodejs_active_handles_total", "legendFormat": "Handles" }
        ]
      },
      {
        "title": "Memory Usage",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 12 },
        "targets": [
          { "expr": "nodejs_heap_size_used_bytes / 1024 / 1024", "legendFormat": "Heap Used (MB)" },
          { "expr": "nodejs_heap_size_total_bytes / 1024 / 1024", "legendFormat": "Heap Total (MB)" },
          { "expr": "process_resident_memory_bytes / 1024 / 1024", "legendFormat": "RSS (MB)" }
        ],
        "fieldConfig": { "defaults": { "unit": "decmbytes" } }
      },
      {
        "title": "Event Loop Lag",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 12 },
        "targets": [
          { "expr": "nodejs_eventloop_lag_seconds", "legendFormat": "Event Loop Lag" }
        ],
        "fieldConfig": { "defaults": { "unit": "s" } }
      },
      {
        "title": "CPU Usage",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 20 },
        "targets": [
          { "expr": "rate(process_cpu_seconds_total[5m]) * 100", "legendFormat": "CPU %" }
        ],
        "fieldConfig": { "defaults": { "unit": "percent" } }
      },
      {
        "title": "HTTP Status Codes",
        "type": "piechart",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 20 },
        "targets": [
          { "expr": "sum by (status) (increase(http_requests_total[1h]))", "legendFormat": "{{status}}" }
        ]
      }
    ]
  }
}
`;

// ─── Loki config ───
const lokiConfig = `
auth_enabled: false

server:
  http_listen_port: 3100

common:
  ring:
    instance_addr: 127.0.0.1
    kvstore:
      store: inmemory
  replication_factor: 1
  path_prefix: /loki

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

storage_config:
  filesystem:
    directory: /loki/chunks

limits_config:
  retention_period: 168h  # 7 days

compactor:
  working_directory: /loki/retention
  compaction_interval: 10m
  retention_enabled: true
  retention_delete_delay: 2h
`;

// ─── App metrics middleware (src/middleware/metrics.ts) ───
const metricsMiddleware = `
import client from 'prom-client';

// ─── Registry ───
const register = new client.Registry();

// Default Node.js metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({ register });

// ─── Custom Metrics ───

// HTTP request counter
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

// HTTP request duration histogram
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// Active requests gauge
const activeRequests = new client.Gauge({
  name: 'http_active_requests',
  help: 'Number of active HTTP requests',
  registers: [register],
});

// DB query duration
const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

// ─── Middleware ───
export function metricsMiddleware(req: any, res: any, next: () => void) {
  const start = process.hrtime.bigint();
  activeRequests.inc();

  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route?.path ?? req.path ?? 'unknown';
    const labels = {
      method: req.method,
      route,
      status: String(res.statusCode),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, duration);
    activeRequests.dec();
  });

  next();
}

// ─── Metrics endpoint handler ───
export async function metricsHandler(_req: any, res: any) {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}

// ─── Export for custom metrics ───
export { register, dbQueryDuration };
`;

// ─── Write all files ───
const dirs = [
  "monitoring/prometheus",
  "monitoring/grafana/provisioning/datasources",
  "monitoring/grafana/provisioning/dashboards",
  "monitoring/grafana/dashboards",
  "monitoring/alertmanager",
  "monitoring/loki",
  "src/middleware",
];

for (const d of dirs) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

const files = [
  { name: "docker-compose.monitoring.yml", content: monitoringCompose },
  { name: "monitoring/prometheus/prometheus.yml", content: prometheusConfig },
  { name: "monitoring/prometheus/alerts.yml", content: alertRules },
  { name: "monitoring/alertmanager/alertmanager.yml", content: alertmanagerConfig },
  { name: "monitoring/grafana/provisioning/datasources/datasources.yml", content: grafanaDatasources },
  { name: "monitoring/grafana/provisioning/dashboards/dashboards.yml", content: grafanaDashboardProvider },
  { name: "monitoring/grafana/dashboards/app-dashboard.json", content: grafanaDashboard },
  { name: "monitoring/loki/loki.yml", content: lokiConfig },
  { name: "src/middleware/metrics.ts", content: metricsMiddleware },
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
🚀 Monitoring setup done!

Files:
  docker-compose.monitoring.yml              → Prometheus + Grafana + Alertmanager + Node Exporter + cAdvisor + Loki
  monitoring/prometheus/prometheus.yml        → Scrape config (app, node-exporter, cadvisor)
  monitoring/prometheus/alerts.yml            → Alert rules (errors, latency, CPU, memory, disk, restarts)
  monitoring/alertmanager/alertmanager.yml    → Alert routing (Slack, email ready)
  monitoring/grafana/dashboards/app-dashboard.json → Dashboard (requests, latency, errors, memory, CPU, event loop)
  monitoring/loki/loki.yml                   → Log aggregation config
  src/middleware/metrics.ts                  → Prometheus metrics middleware (prom-client)

Install:
  npm i prom-client

Usage:
  docker compose -f docker-compose.monitoring.yml up -d

  Prometheus:   http://localhost:9090
  Grafana:      http://localhost:3001 (admin/admin)
  Alertmanager: http://localhost:9093
`);
