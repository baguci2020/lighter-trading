module.exports = {
  apps: [{
    name: "lighter-trading",
    script: "node",
    args: "/root/lighter-trading/node_modules/tsx/dist/cli.mjs server/_core/index.ts",
    cwd: "/root/lighter-trading",
    env_file: "/root/lighter-trading/.env",
    restart_delay: 3000,
    autorestart: true,
    max_memory_restart: "512M",
    error_file: "/root/lighter-trading/logs/error.log",
    out_file: "/root/lighter-trading/logs/out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss"
  }]
}
