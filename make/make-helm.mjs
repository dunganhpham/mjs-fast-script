import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
if (process.argv[2]) process.chdir(resolve(process.argv[2]));

// ─── Chart.yaml ───
const chartYaml = `
apiVersion: v2
name: app
description: A production-ready Helm chart for deploying the application
type: application
version: 0.1.0
appVersion: "1.0.0"
keywords:
  - app
  - nodejs
  - api
maintainers:
  - name: Your Team
    email: team@example.com
home: https://github.com/your-org/your-app
sources:
  - https://github.com/your-org/your-app
`;

// ─── values.yaml ───
const valuesYaml = `
# ─── Replica & Image ───
replicaCount: 2

image:
  repository: ghcr.io/your-org/your-app
  pullPolicy: IfNotPresent
  tag: ""  # Defaults to Chart.appVersion

imagePullSecrets: []
nameOverride: ""
fullnameOverride: ""

# ─── ServiceAccount ───
serviceAccount:
  create: true
  automount: false
  annotations: {}
  name: ""

# ─── Pod Settings ───
podAnnotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "3000"
  prometheus.io/path: "/metrics"

podLabels: {}

podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1001
  runAsGroup: 1001
  fsGroup: 1001
  seccompProfile:
    type: RuntimeDefault

securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: ["ALL"]

# ─── Service ───
service:
  type: ClusterIP
  port: 80
  targetPort: 3000
  annotations: {}

# ─── Ingress ───
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/enable-cors: "true"
  hosts:
    - host: app.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: app-tls
      hosts:
        - app.example.com

# ─── Resources ───
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

# ─── Autoscaling ───
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 2
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Pods
          value: 1
          periodSeconds: 120

# ─── PodDisruptionBudget ───
pdb:
  enabled: true
  minAvailable: 1
  # maxUnavailable: 1

# ─── NetworkPolicy ───
networkPolicy:
  enabled: true
  ingressRules:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
      ports:
        - port: 3000
          protocol: TCP
  egressRules:
    - to: []
      ports:
        - port: 53
          protocol: UDP
    - to: []
      ports:
        - port: 5432
          protocol: TCP
    - to: []
      ports:
        - port: 6379
          protocol: TCP
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 10.0.0.0/8
              - 172.16.0.0/12
              - 192.168.0.0/16
      ports:
        - port: 443
          protocol: TCP

# ─── Environment ───
env:
  NODE_ENV: production
  LOG_LEVEL: info
  PORT: "3000"

secrets: {}
  # DATABASE_URL: ""
  # REDIS_URL: ""
  # JWT_SECRET: ""

# ─── Extra env from existing secrets/configmaps ───
envFrom: []
  # - secretRef:
  #     name: external-secrets
  # - configMapRef:
  #     name: external-config

# ─── Volumes ───
extraVolumes:
  - name: tmp
    emptyDir:
      sizeLimit: 100Mi
  - name: logs
    emptyDir:
      sizeLimit: 200Mi

extraVolumeMounts:
  - name: tmp
    mountPath: /tmp
  - name: logs
    mountPath: /app/logs

# ─── Probes ───
startupProbe:
  httpGet:
    path: /healthz
    port: http
  failureThreshold: 30
  periodSeconds: 2

livenessProbe:
  httpGet:
    path: /healthz
    port: http
  initialDelaySeconds: 0
  periodSeconds: 15
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /healthz
    port: http
  initialDelaySeconds: 0
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 3

# ─── Deployment Strategy ───
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 0
    maxSurge: 1

# ─── Scheduling ───
nodeSelector: {}

tolerations: []

affinity: {}

topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: DoNotSchedule
    labelSelector:
      matchLabels: {}  # Will be filled by template

# ─── Init containers ───
initContainers: []
  # - name: wait-for-db
  #   image: busybox:1.36
  #   command: ["sh", "-c", "until nc -z postgres 5432; do sleep 2; done"]

# ─── Lifecycle hooks ───
lifecycle:
  preStop:
    exec:
      command: ["sh", "-c", "sleep 5"]

# ─── CronJobs ───
cronJobs:
  cleanup:
    enabled: false
    schedule: "0 3 * * *"
    command: ["node", "dist/scripts/cleanup.js"]
    resources:
      requests:
        cpu: 50m
        memory: 64Mi
      limits:
        cpu: 200m
        memory: 256Mi
  backup:
    enabled: false
    schedule: "0 2 * * *"
    image: postgres:16-alpine
    command: ["sh", "-c", "pg_dump $DATABASE_URL | gzip > /backups/backup_$(date +%Y%m%d).sql.gz"]
    resources:
      requests:
        cpu: 100m
        memory: 128Mi
      limits:
        cpu: 500m
        memory: 512Mi
`;

// ─── values-staging.yaml ───
const valuesStaging = `
replicaCount: 1

autoscaling:
  enabled: true
  minReplicas: 1
  maxReplicas: 3

ingress:
  hosts:
    - host: staging.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: staging-tls
      hosts:
        - staging.example.com

resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    cpu: 200m
    memory: 256Mi

env:
  NODE_ENV: staging
  LOG_LEVEL: debug
`;

// ─── values-production.yaml ───
const valuesProduction = `
replicaCount: 3

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20

ingress:
  hosts:
    - host: app.example.com
      paths:
        - path: /
          pathType: Prefix
    - host: www.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: production-tls
      hosts:
        - app.example.com
        - www.example.com

resources:
  requests:
    cpu: 200m
    memory: 256Mi
  limits:
    cpu: "1"
    memory: 1Gi

env:
  NODE_ENV: production
  LOG_LEVEL: warn

cronJobs:
  cleanup:
    enabled: true
  backup:
    enabled: true
`;

// ─── _helpers.tpl ───
const helpersTemplate = `
{{/*
Expand the name of the chart.
*/}}
{{- define "app.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "app.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "app.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "app.labels" -}}
helm.sh/chart: {{ include "app.chart" . }}
{{ include "app.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "app.selectorLabels" -}}
app.kubernetes.io/name: {{ include "app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "app.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "app.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Return the image name
*/}}
{{- define "app.image" -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) }}
{{- end }}
`;

// ─── serviceaccount.yaml ───
const serviceAccountTemplate = `
{{- if .Values.serviceAccount.create -}}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ include "app.serviceAccountName" . }}
  labels:
    {{- include "app.labels" . | nindent 4 }}
  {{- with .Values.serviceAccount.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
automountServiceAccountToken: {{ .Values.serviceAccount.automount }}
{{- end }}
`;

// ─── deployment.yaml ───
const deploymentTemplate = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "app.fullname" . }}
  labels:
    {{- include "app.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  revisionHistoryLimit: 5
  {{- with .Values.strategy }}
  strategy:
    {{- toYaml . | nindent 4 }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "app.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
        checksum/secret: {{ include (print $.Template.BasePath "/secret.yaml") . | sha256sum }}
        {{- with .Values.podAnnotations }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
      labels:
        {{- include "app.labels" . | nindent 8 }}
        {{- with .Values.podLabels }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
    spec:
      serviceAccountName: {{ include "app.serviceAccountName" . }}
      automountServiceAccountToken: false
      terminationGracePeriodSeconds: 30
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.podSecurityContext }}
      securityContext:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.topologySpreadConstraints }}
      topologySpreadConstraints:
        {{- range . }}
        - maxSkew: {{ .maxSkew }}
          topologyKey: {{ .topologyKey }}
          whenUnsatisfiable: {{ .whenUnsatisfiable }}
          labelSelector:
            matchLabels:
              {{- include "app.selectorLabels" $ | nindent 14 }}
        {{- end }}
      {{- end }}
      {{- with .Values.initContainers }}
      initContainers:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      containers:
        - name: {{ .Chart.Name }}
          image: {{ include "app.image" . }}
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.service.targetPort }}
              protocol: TCP
          env:
            {{- range $key, $value := .Values.env }}
            - name: {{ $key }}
              value: {{ $value | quote }}
            {{- end }}
            {{- range $key, $value := .Values.secrets }}
            - name: {{ $key }}
              valueFrom:
                secretKeyRef:
                  name: {{ include "app.fullname" $ }}
                  key: {{ $key }}
            {{- end }}
          {{- with .Values.envFrom }}
          envFrom:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.startupProbe }}
          startupProbe:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.livenessProbe }}
          livenessProbe:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.readinessProbe }}
          readinessProbe:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.resources }}
          resources:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.securityContext }}
          securityContext:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.extraVolumeMounts }}
          volumeMounts:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.lifecycle }}
          lifecycle:
            {{- toYaml . | nindent 12 }}
          {{- end }}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.extraVolumes }}
      volumes:
        {{- toYaml . | nindent 8 }}
      {{- end }}
`;

// ─── service.yaml ───
const serviceTemplate = `
apiVersion: v1
kind: Service
metadata:
  name: {{ include "app.fullname" . }}
  labels:
    {{- include "app.labels" . | nindent 4 }}
  {{- with .Values.service.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "app.selectorLabels" . | nindent 4 }}
`;

// ─── configmap.yaml ───
const configmapTemplate = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "app.fullname" . }}
  labels:
    {{- include "app.labels" . | nindent 4 }}
data:
  {{- range $key, $value := .Values.env }}
  {{ $key }}: {{ $value | quote }}
  {{- end }}
`;

// ─── secret.yaml ───
const secretTemplate = `
{{- if .Values.secrets }}
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "app.fullname" . }}
  labels:
    {{- include "app.labels" . | nindent 4 }}
type: Opaque
stringData:
  {{- range $key, $value := .Values.secrets }}
  {{ $key }}: {{ $value | quote }}
  {{- end }}
{{- end }}
`;

// ─── ingress.yaml ───
const ingressTemplate = `
{{- if .Values.ingress.enabled -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "app.fullname" . }}
  labels:
    {{- include "app.labels" . | nindent 4 }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  {{- if .Values.ingress.className }}
  ingressClassName: {{ .Values.ingress.className }}
  {{- end }}
  {{- if .Values.ingress.tls }}
  tls:
    {{- range .Values.ingress.tls }}
    - hosts:
        {{- range .hosts }}
        - {{ . | quote }}
        {{- end }}
      secretName: {{ .secretName }}
    {{- end }}
  {{- end }}
  rules:
    {{- range .Values.ingress.hosts }}
    - host: {{ .host | quote }}
      http:
        paths:
          {{- range .paths }}
          - path: {{ .path }}
            pathType: {{ .pathType }}
            backend:
              service:
                name: {{ include "app.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
          {{- end }}
    {{- end }}
{{- end }}
`;

// ─── hpa.yaml ───
const hpaTemplate = `
{{- if .Values.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "app.fullname" . }}
  labels:
    {{- include "app.labels" . | nindent 4 }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "app.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  {{- with .Values.autoscaling.behavior }}
  behavior:
    {{- toYaml . | nindent 4 }}
  {{- end }}
  metrics:
    {{- if .Values.autoscaling.targetCPUUtilizationPercentage }}
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}
    {{- end }}
    {{- if .Values.autoscaling.targetMemoryUtilizationPercentage }}
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetMemoryUtilizationPercentage }}
    {{- end }}
{{- end }}
`;

// ─── pdb.yaml ───
const pdbTemplate = `
{{- if .Values.pdb.enabled }}
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {{ include "app.fullname" . }}
  labels:
    {{- include "app.labels" . | nindent 4 }}
spec:
  {{- if .Values.pdb.minAvailable }}
  minAvailable: {{ .Values.pdb.minAvailable }}
  {{- end }}
  {{- if .Values.pdb.maxUnavailable }}
  maxUnavailable: {{ .Values.pdb.maxUnavailable }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "app.selectorLabels" . | nindent 6 }}
{{- end }}
`;

// ─── networkpolicy.yaml ───
const networkPolicyTemplate = `
{{- if .Values.networkPolicy.enabled }}
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ include "app.fullname" . }}
  labels:
    {{- include "app.labels" . | nindent 4 }}
spec:
  podSelector:
    matchLabels:
      {{- include "app.selectorLabels" . | nindent 6 }}
  policyTypes:
    - Ingress
    - Egress
  {{- with .Values.networkPolicy.ingressRules }}
  ingress:
    {{- toYaml . | nindent 4 }}
  {{- end }}
  {{- with .Values.networkPolicy.egressRules }}
  egress:
    {{- toYaml . | nindent 4 }}
  {{- end }}
{{- end }}
`;

// ─── cronjob.yaml ───
const cronJobTemplate = `
{{- range $name, $job := .Values.cronJobs }}
{{- if $job.enabled }}
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: {{ include "app.fullname" $ }}-{{ $name }}
  labels:
    {{- include "app.labels" $ | nindent 4 }}
    app.kubernetes.io/component: {{ $name }}
spec:
  schedule: {{ $job.schedule | quote }}
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 2
      activeDeadlineSeconds: 600
      template:
        spec:
          serviceAccountName: {{ include "app.serviceAccountName" $ }}
          restartPolicy: OnFailure
          {{- with $.Values.podSecurityContext }}
          securityContext:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          containers:
            - name: {{ $name }}
              image: {{ $job.image | default (include "app.image" $) }}
              {{- with $job.command }}
              command:
                {{- toYaml . | nindent 16 }}
              {{- end }}
              envFrom:
                - configMapRef:
                    name: {{ include "app.fullname" $ }}
                {{- if $.Values.secrets }}
                - secretRef:
                    name: {{ include "app.fullname" $ }}
                {{- end }}
              {{- with $job.resources }}
              resources:
                {{- toYaml . | nindent 16 }}
              {{- end }}
              {{- with $.Values.securityContext }}
              securityContext:
                {{- toYaml . | nindent 16 }}
              {{- end }}
{{- end }}
{{- end }}
`;

// ─── NOTES.txt ───
const notesTemplate = `
╔══════════════════════════════════════════════════════╗
║              {{ .Chart.Name }} deployed!             ║
╚══════════════════════════════════════════════════════╝

Chart:    {{ .Chart.Name }}-{{ .Chart.Version }}
App:      {{ .Chart.AppVersion }}
Release:  {{ .Release.Name }}

{{- if .Values.ingress.enabled }}

🌐 Application URLs:
{{- range .Values.ingress.hosts }}
  https://{{ .host }}
{{- end }}
{{- end }}

📋 Quick commands:

  # Check deployment status
  kubectl -n {{ .Release.Namespace }} rollout status deployment/{{ include "app.fullname" . }}

  # View pods
  kubectl -n {{ .Release.Namespace }} get pods -l app.kubernetes.io/name={{ include "app.name" . }}

  # View logs
  kubectl -n {{ .Release.Namespace }} logs -f deployment/{{ include "app.fullname" . }}

  # Port forward (local access)
  kubectl -n {{ .Release.Namespace }} port-forward svc/{{ include "app.fullname" . }} {{ .Values.service.targetPort }}:{{ .Values.service.port }}

{{- if .Values.autoscaling.enabled }}

📈 Autoscaling: {{ .Values.autoscaling.minReplicas }}-{{ .Values.autoscaling.maxReplicas }} replicas
{{- end }}
`;

// ─── test-connection.yaml ───
const testTemplate = `
apiVersion: v1
kind: Pod
metadata:
  name: "{{ include "app.fullname" . }}-test-connection"
  labels:
    {{- include "app.labels" . | nindent 4 }}
  annotations:
    "helm.sh/hook": test
    "helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded
spec:
  containers:
    - name: wget
      image: busybox:1.36
      command: ["wget"]
      args: ["--spider", "--timeout=5", "http://{{ include "app.fullname" . }}:{{ .Values.service.port }}/healthz"]
  restartPolicy: Never
`;

// ─── .helmignore ───
const helmignore = `
.DS_Store
.git/
.gitignore
.vscode/
*.swp
*.bak
*.tmp
*.orig
*~
.project
.idea/
*.tmproj
.hg/
.hgignore
.svn/
charts/*.tgz
`;

// ─── Write all files ───
const dirs = [
  "helm/app",
  "helm/app/templates",
  "helm/app/templates/tests",
];

for (const d of dirs) {
  if (!existsSync(d)) {
    mkdirSync(d, { recursive: true });
  }
}
console.log("📁 Created helm/app/templates/");

const files = [
  { name: "helm/app/Chart.yaml", content: chartYaml },
  { name: "helm/app/values.yaml", content: valuesYaml },
  { name: "helm/app/values-staging.yaml", content: valuesStaging },
  { name: "helm/app/values-production.yaml", content: valuesProduction },
  { name: "helm/app/.helmignore", content: helmignore },
  { name: "helm/app/templates/_helpers.tpl", content: helpersTemplate },
  { name: "helm/app/templates/serviceaccount.yaml", content: serviceAccountTemplate },
  { name: "helm/app/templates/deployment.yaml", content: deploymentTemplate },
  { name: "helm/app/templates/service.yaml", content: serviceTemplate },
  { name: "helm/app/templates/configmap.yaml", content: configmapTemplate },
  { name: "helm/app/templates/secret.yaml", content: secretTemplate },
  { name: "helm/app/templates/ingress.yaml", content: ingressTemplate },
  { name: "helm/app/templates/hpa.yaml", content: hpaTemplate },
  { name: "helm/app/templates/pdb.yaml", content: pdbTemplate },
  { name: "helm/app/templates/networkpolicy.yaml", content: networkPolicyTemplate },
  { name: "helm/app/templates/cronjob.yaml", content: cronJobTemplate },
  { name: "helm/app/templates/NOTES.txt", content: notesTemplate },
  { name: "helm/app/templates/tests/test-connection.yaml", content: testTemplate },
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
🚀 Helm chart setup done!

Templates (18 files):
  _helpers.tpl, serviceaccount, deployment, service,
  configmap, secret, ingress, hpa, pdb,
  networkpolicy, cronjob, NOTES.txt, test-connection

Values:
  values.yaml              → Base config
  values-staging.yaml      → Staging overrides (1 replica, debug)
  values-production.yaml   → Production overrides (3 replicas, cronjobs)

Usage:
  helm install app ./helm/app                                  # Default
  helm install app ./helm/app -f helm/app/values-staging.yaml  # Staging
  helm install app ./helm/app -f helm/app/values-production.yaml # Production
  helm test app                                                # Run tests
  helm template app ./helm/app                                 # Dry run
`);
