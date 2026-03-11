import { writeFileSync, existsSync } from "fs";
import { resolve } from "path";
if (process.argv[2]) process.chdir(resolve(process.argv[2]));

// ─── ecosystem.config.cjs ───
const ecosystem = `
// PM2 Ecosystem Configuration
// https://pm2.keymetrics.io/docs/usage/application-declaration/

module.exports = {
  apps: [
    // ─── Main Application ───
    {
      name: 'app',
      script: 'dist/index.js',
      cwd: __dirname,

      // ─── Cluster mode ───
      instances: 'max',     // or a number like 2, 4
      exec_mode: 'cluster',

      // ─── Environment ───
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // ─── Logging ───
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      error_file: 'logs/app-error.log',
      out_file: 'logs/app-out.log',
      combine_logs: true,
      merge_logs: true,
      log_type: 'json',

      // ─── Restart policy ───
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      autorestart: true,
      max_memory_restart: '512M',
      exp_backoff_restart_delay: 100,

      // ─── Watch (development only) ───
      watch: false,
      watch_delay: 1000,
      ignore_watch: [
        'node_modules',
        'logs',
        'coverage',
        '.git',
        'dist',
        '*.log',
      ],

      // ─── Graceful shutdown ───
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true,
      wait_ready: true,

      // ─── Source maps ───
      source_map_support: true,

      // ─── Monitoring ───
      // pmx: true,
      // pm2_api_port: 9615,

      // ─── Node args ───
      node_args: [
        '--max-old-space-size=512',
        '--enable-source-maps',
      ],
    },

    // ─── Worker (Background Jobs) ───
    {
      name: 'worker',
      script: 'dist/worker.js',
      cwd: __dirname,

      instances: 1,
      exec_mode: 'fork',

      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },

      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      error_file: 'logs/worker-error.log',
      out_file: 'logs/worker-out.log',
      combine_logs: true,
      log_type: 'json',

      max_restarts: 5,
      min_uptime: '10s',
      restart_delay: 5000,
      autorestart: true,
      max_memory_restart: '256M',

      cron_restart: '0 4 * * *', // Restart daily at 4 AM

      node_args: [
        '--max-old-space-size=256',
        '--enable-source-maps',
      ],
    },

    // ─── Cron Scheduler ───
    {
      name: 'scheduler',
      script: 'dist/scheduler.js',
      cwd: __dirname,

      instances: 1,
      exec_mode: 'fork',

      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },

      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      error_file: 'logs/scheduler-error.log',
      out_file: 'logs/scheduler-out.log',
      combine_logs: true,
      log_type: 'json',

      max_restarts: 3,
      autorestart: true,
      max_memory_restart: '128M',
    },
  ],

  // ─── Deployment (pm2 deploy) ───
  deploy: {
    staging: {
      user: 'deploy',
      host: ['staging.example.com'],
      ref: 'origin/develop',
      repo: 'git@github.com:your-org/your-app.git',
      path: '/var/www/app',
      'pre-deploy-local': '',
      'post-deploy': 'npm ci && npm run build && pm2 reload ecosystem.config.cjs --env staging',
      'pre-setup': 'mkdir -p /var/www/app/logs',
      env: {
        NODE_ENV: 'staging',
      },
    },
    production: {
      user: 'deploy',
      host: ['app-1.example.com', 'app-2.example.com'],
      ref: 'origin/main',
      repo: 'git@github.com:your-org/your-app.git',
      path: '/var/www/app',
      'pre-deploy-local': '',
      'post-deploy': 'npm ci && npm run build && pm2 reload ecosystem.config.cjs --env production',
      'pre-setup': 'mkdir -p /var/www/app/logs',
      env: {
        NODE_ENV: 'production',
      },
    },
  },
};
`;

// ─── logrotate config ───
const logrotate = `
# /etc/logrotate.d/app
# sudo cp logrotate.conf /etc/logrotate.d/app

/var/www/app/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 deploy deploy
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
`;

const files = [
  { name: "ecosystem.config.cjs", content: ecosystem },
  { name: "logrotate.conf", content: logrotate },
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
🚀 PM2 setup done!

Files:
  ecosystem.config.cjs   → PM2 config (cluster mode, 3 apps: main/worker/scheduler)
  logrotate.conf         → Log rotation (daily, 14 days, compressed)

Apps:
  app       → Main server (cluster mode, max instances, 512MB limit)
  worker    → Background job processor (fork, daily restart at 4AM)
  scheduler → Cron scheduler (fork, 128MB limit)

Commands:
  pm2 start ecosystem.config.cjs                    # Start all
  pm2 start ecosystem.config.cjs --only app         # Start specific
  pm2 start ecosystem.config.cjs --env production   # Production mode
  pm2 reload ecosystem.config.cjs                   # Zero-downtime reload
  pm2 logs app                                       # View logs
  pm2 monit                                          # Monitoring dashboard
  pm2 deploy ecosystem.config.cjs production setup   # Setup server
  pm2 deploy ecosystem.config.cjs production         # Deploy
`);
