import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
if (process.argv[2]) process.chdir(resolve(process.argv[2]));

// ─── Namespace ───
const namespace = `
apiVersion: v1
kind: Namespace
metadata:
  name: app
  labels:
    app.kubernetes.io/name: app
    app.kubernetes.io/managed-by: kubectl
`;

// ─── ServiceAccount ───
const serviceAccount = `
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app
  namespace: app
  labels:
    app.kubernetes.io/name: app
automountServiceAccountToken: false
`;

// ─── RBAC - Role ───
const role = `
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: app
  namespace: app
  labels:
    app.kubernetes.io/name: app
rules:
  - apiGroups: [""]
    resources: ["configmaps", "secrets"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list"]
`;

// ─── RBAC - RoleBinding ───
const roleBinding = `
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: app
  namespace: app
  labels:
    app.kubernetes.io/name: app
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: app
subjects:
  - kind: ServiceAccount
    name: app
    namespace: app
`;

// ─── ConfigMap ───
const configmap = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: app
  labels:
    app.kubernetes.io/name: app
data:
  NODE_ENV: production
  LOG_LEVEL: info
  PORT: "3000"
  # Database
  DB_HOST: postgres.database.svc.cluster.local
  DB_PORT: "5432"
  DB_NAME: app_db
  # Redis
  REDIS_HOST: redis.cache.svc.cluster.local
  REDIS_PORT: "6379"
  # App
  CORS_ORIGINS: "https://example.com,https://www.example.com"
  RATE_LIMIT_MAX: "100"
  RATE_LIMIT_WINDOW_MS: "60000"
`;

// ─── Secret ───
const secret = `
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: app
  labels:
    app.kubernetes.io/name: app
type: Opaque
stringData:
  DATABASE_URL: "postgresql://user:password@postgres.database.svc.cluster.local:5432/app_db"
  REDIS_URL: "redis://redis.cache.svc.cluster.local:6379"
  JWT_SECRET: "change-me-use-sealed-secrets-or-external-secrets"
  API_KEY: "change-me"
  # Recommendation: use SealedSecrets or ExternalSecrets operator in production
`;

// ─── Deployment ───
const deployment = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: app
  labels:
    app.kubernetes.io/name: app
    app.kubernetes.io/version: "1.0.0"
  annotations:
    kubernetes.io/change-cause: "Initial deployment"
spec:
  replicas: 2
  revisionHistoryLimit: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: app
  template:
    metadata:
      labels:
        app.kubernetes.io/name: app
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: app
      automountServiceAccountToken: false
      terminationGracePeriodSeconds: 30

      # Security context at Pod level
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        runAsGroup: 1001
        fsGroup: 1001
        seccompProfile:
          type: RuntimeDefault

      # Topology spread for HA
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app.kubernetes.io/name: app

      initContainers:
        - name: wait-for-db
          image: busybox:1.36
          command: ["sh", "-c", "until nc -z postgres.database.svc.cluster.local 5432; do echo waiting for db; sleep 2; done"]
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]

      containers:
        - name: app
          image: ghcr.io/your-org/your-app:latest
          imagePullPolicy: IfNotPresent

          ports:
            - name: http
              containerPort: 3000
              protocol: TCP

          # Environment from ConfigMap and Secret
          envFrom:
            - configMapRef:
                name: app-config
            - secretRef:
                name: app-secrets

          # Resource management
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi

          # Security context at container level
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]

          # Volume mounts for tmp and logs (read-only root filesystem)
          volumeMounts:
            - name: tmp
              mountPath: /tmp
            - name: logs
              mountPath: /app/logs

          # Probes
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

          # Graceful shutdown
          lifecycle:
            preStop:
              exec:
                command: ["sh", "-c", "sleep 5"]

      volumes:
        - name: tmp
          emptyDir:
            sizeLimit: 100Mi
        - name: logs
          emptyDir:
            sizeLimit: 200Mi

      restartPolicy: Always
`;

// ─── Service ───
const service = `
apiVersion: v1
kind: Service
metadata:
  name: app
  namespace: app
  labels:
    app.kubernetes.io/name: app
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "3000"
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: app
  ports:
    - name: http
      port: 80
      targetPort: http
      protocol: TCP
  sessionAffinity: None
`;

// ─── Ingress ───
const ingress = `
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app
  namespace: app
  labels:
    app.kubernetes.io/name: app
  annotations:
    # Nginx Ingress
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "60"
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-origin: "https://example.com"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    # TLS with cert-manager
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - app.example.com
        - www.example.com
      secretName: app-tls
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: app
                port:
                  number: 80
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: app
                port:
                  number: 80
    - host: www.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: app
                port:
                  number: 80
`;

// ─── HPA ───
const hpa = `
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: app
  namespace: app
  labels:
    app.kubernetes.io/name: app
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: app
  minReplicas: 2
  maxReplicas: 10
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
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
`;

// ─── PodDisruptionBudget ───
const pdb = `
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: app
  namespace: app
  labels:
    app.kubernetes.io/name: app
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: app
`;

// ─── NetworkPolicy ───
const networkPolicy = `
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: app
  namespace: app
  labels:
    app.kubernetes.io/name: app
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: app
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Allow traffic from Ingress controller
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
      ports:
        - port: 3000
          protocol: TCP
    # Allow traffic from monitoring (Prometheus)
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: monitoring
      ports:
        - port: 3000
          protocol: TCP
  egress:
    # Allow DNS
    - to:
        - namespaceSelector: {}
      ports:
        - port: 53
          protocol: UDP
        - port: 53
          protocol: TCP
    # Allow PostgreSQL
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: database
      ports:
        - port: 5432
          protocol: TCP
    # Allow Redis
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: cache
      ports:
        - port: 6379
          protocol: TCP
    # Allow HTTPS egress (external APIs)
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
`;

// ─── PersistentVolumeClaim ───
const pvc = `
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: app-data
  namespace: app
  labels:
    app.kubernetes.io/name: app
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: gp3
  resources:
    requests:
      storage: 10Gi
`;

// ─── CronJob (cleanup/maintenance) ───
const cronJob = `
apiVersion: batch/v1
kind: CronJob
metadata:
  name: app-cleanup
  namespace: app
  labels:
    app.kubernetes.io/name: app
    app.kubernetes.io/component: cleanup
spec:
  schedule: "0 3 * * *"  # Daily at 3:00 AM
  timeZone: "Asia/Ho_Chi_Minh"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 2
      activeDeadlineSeconds: 600
      template:
        spec:
          serviceAccountName: app
          restartPolicy: OnFailure
          securityContext:
            runAsNonRoot: true
            runAsUser: 1001
          containers:
            - name: cleanup
              image: ghcr.io/your-org/your-app:latest
              command: ["node", "dist/scripts/cleanup.js"]
              envFrom:
                - configMapRef:
                    name: app-config
                - secretRef:
                    name: app-secrets
              resources:
                requests:
                  cpu: 50m
                  memory: 64Mi
                limits:
                  cpu: 200m
                  memory: 256Mi
              securityContext:
                allowPrivilegeEscalation: false
                readOnlyRootFilesystem: true
                capabilities:
                  drop: ["ALL"]
`;

// ─── CronJob (database backup) ───
const cronJobBackup = `
apiVersion: batch/v1
kind: CronJob
metadata:
  name: db-backup
  namespace: app
  labels:
    app.kubernetes.io/name: app
    app.kubernetes.io/component: backup
spec:
  schedule: "0 2 * * *"  # Daily at 2:00 AM
  timeZone: "Asia/Ho_Chi_Minh"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 5
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 2
      activeDeadlineSeconds: 1800
      template:
        spec:
          restartPolicy: OnFailure
          securityContext:
            runAsNonRoot: true
            runAsUser: 1001
          containers:
            - name: backup
              image: postgres:16-alpine
              command:
                - /bin/sh
                - -c
                - |
                  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
                  BACKUP_FILE="/backups/db_backup_\${TIMESTAMP}.sql.gz"
                  pg_dump $DATABASE_URL | gzip > \$BACKUP_FILE
                  echo "Backup created: \$BACKUP_FILE"
                  # Clean backups older than 7 days
                  find /backups -name "*.sql.gz" -mtime +7 -delete
              envFrom:
                - secretRef:
                    name: app-secrets
              volumeMounts:
                - name: backup-storage
                  mountPath: /backups
              resources:
                requests:
                  cpu: 100m
                  memory: 128Mi
                limits:
                  cpu: 500m
                  memory: 512Mi
          volumes:
            - name: backup-storage
              persistentVolumeClaim:
                claimName: app-data
`;

// ─── ResourceQuota ───
const resourceQuota = `
apiVersion: v1
kind: ResourceQuota
metadata:
  name: app-quota
  namespace: app
  labels:
    app.kubernetes.io/name: app
spec:
  hard:
    requests.cpu: "4"
    requests.memory: 4Gi
    limits.cpu: "8"
    limits.memory: 8Gi
    pods: "20"
    services: "10"
    persistentvolumeclaims: "5"
    secrets: "20"
    configmaps: "20"
`;

// ─── LimitRange ───
const limitRange = `
apiVersion: v1
kind: LimitRange
metadata:
  name: app-limits
  namespace: app
  labels:
    app.kubernetes.io/name: app
spec:
  limits:
    - type: Container
      default:
        cpu: 200m
        memory: 256Mi
      defaultRequest:
        cpu: 50m
        memory: 64Mi
      max:
        cpu: "2"
        memory: 2Gi
      min:
        cpu: 10m
        memory: 16Mi
    - type: Pod
      max:
        cpu: "4"
        memory: 4Gi
`;

// ─── kustomization.yaml ───
const kustomization = `
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: app

resources:
  - namespace.yml
  - serviceaccount.yml
  - role.yml
  - rolebinding.yml
  - configmap.yml
  - secret.yml
  - deployment.yml
  - service.yml
  - ingress.yml
  - hpa.yml
  - pdb.yml
  - networkpolicy.yml
  - pvc.yml
  - cronjob-cleanup.yml
  - cronjob-backup.yml
  - resourcequota.yml
  - limitrange.yml

commonLabels:
  app.kubernetes.io/managed-by: kustomize
  app.kubernetes.io/part-of: app

# Override for different environments:
# kustomize build k8s/overlays/staging
# kustomize build k8s/overlays/production
`;

// ─── Write all files ───
const dirs = ["k8s", "k8s/overlays/staging", "k8s/overlays/production"];

for (const d of dirs) {
  if (!existsSync(d)) {
    mkdirSync(d, { recursive: true });
  }
}

const files = [
  { name: "k8s/namespace.yml", content: namespace },
  { name: "k8s/serviceaccount.yml", content: serviceAccount },
  { name: "k8s/role.yml", content: role },
  { name: "k8s/rolebinding.yml", content: roleBinding },
  { name: "k8s/configmap.yml", content: configmap },
  { name: "k8s/secret.yml", content: secret },
  { name: "k8s/deployment.yml", content: deployment },
  { name: "k8s/service.yml", content: service },
  { name: "k8s/ingress.yml", content: ingress },
  { name: "k8s/hpa.yml", content: hpa },
  { name: "k8s/pdb.yml", content: pdb },
  { name: "k8s/networkpolicy.yml", content: networkPolicy },
  { name: "k8s/pvc.yml", content: pvc },
  { name: "k8s/cronjob-cleanup.yml", content: cronJob },
  { name: "k8s/cronjob-backup.yml", content: cronJobBackup },
  { name: "k8s/resourcequota.yml", content: resourceQuota },
  { name: "k8s/limitrange.yml", content: limitRange },
  { name: "k8s/kustomization.yml", content: kustomization },
];

// ─── Staging overlay ───
const stagingKustomization = `
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: app-staging

resources:
  - ../../

patches:
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: app
      spec:
        replicas: 1
  - patch: |-
      apiVersion: autoscaling/v2
      kind: HorizontalPodAutoscaler
      metadata:
        name: app
      spec:
        minReplicas: 1
        maxReplicas: 3
`;
files.push({ name: "k8s/overlays/staging/kustomization.yml", content: stagingKustomization });

// ─── Production overlay ───
const productionKustomization = `
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: app-production

resources:
  - ../../

patches:
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: app
      spec:
        replicas: 3
  - patch: |-
      apiVersion: autoscaling/v2
      kind: HorizontalPodAutoscaler
      metadata:
        name: app
      spec:
        minReplicas: 3
        maxReplicas: 20
`;
files.push({ name: "k8s/overlays/production/kustomization.yml", content: productionKustomization });

for (const file of files) {
  if (!existsSync(file.name)) {
    writeFileSync(file.name, file.content.trim());
    console.log(`✅ ${file.name} created`);
  } else {
    console.log(`⚠️ ${file.name} already exists`);
  }
}

console.log(`
🚀 Kubernetes manifests setup done!

Manifests (20 files):
  namespace, serviceaccount, role, rolebinding,
  configmap, secret, deployment, service, ingress,
  hpa, pdb, networkpolicy, pvc,
  cronjob-cleanup, cronjob-backup,
  resourcequota, limitrange, kustomization

Overlays:
  k8s/overlays/staging/       → 1 replica, HPA max 3
  k8s/overlays/production/    → 3 replicas, HPA max 20

Usage:
  kubectl apply -k k8s/                           # Base
  kubectl apply -k k8s/overlays/staging/           # Staging
  kubectl apply -k k8s/overlays/production/        # Production
`);
