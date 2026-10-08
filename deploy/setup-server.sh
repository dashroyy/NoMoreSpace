#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 24.04 server (e.g. a 1 GB DigitalOcean droplet).
# Run it as root:   bash setup-server.sh nomorespace.online
# After this, GitHub Actions does every future deploy for you.
set -euo pipefail

DOMAIN="${1:?Usage: bash setup-server.sh your-domain.com}"
APP_USER=nomorespace
APP_DIR=/home/$APP_USER/app

echo "==> Updating the system"
apt-get update && apt-get -y upgrade

echo "==> Adding 1 GB of swap (a safety net so a 1 GB server doesn't run out of memory)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Installing Node.js 22"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs rsync

echo "==> Installing Caddy (web server with automatic HTTPS)"
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

echo "==> Creating the '$APP_USER' user that runs the game"
id "$APP_USER" &>/dev/null || adduser --disabled-password --gecos "" "$APP_USER"
mkdir -p "$APP_DIR" /home/$APP_USER/.ssh
chown -R $APP_USER:$APP_USER /home/$APP_USER
# Let the deploy user restart the game, and nothing else, with sudo.
echo "$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart nomorespace" > /etc/sudoers.d/nomorespace

echo "==> Installing the game service"
cat > /etc/systemd/system/nomorespace.service <<'UNIT'
[Unit]
Description=No More Space game server
After=network.target

[Service]
User=nomorespace
WorkingDirectory=/home/nomorespace/app
ExecStart=/usr/bin/node server/index.js
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=NODE_OPTIONS=--max-old-space-size=256
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable nomorespace

echo "==> Pointing Caddy at the game"
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN, www.$DOMAIN {
	encode gzip
	reverse_proxy localhost:3000
}
CADDY
systemctl reload caddy

echo "==> Firewall: allow only SSH and web traffic"
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

cat <<DONE

All set. Last step: let GitHub log in to deploy.
  1. On YOUR computer:  ssh-keygen -t ed25519 -f nomorespace_deploy -N ""
  2. Put the PUBLIC key on this server:
       cat nomorespace_deploy.pub >> /home/$APP_USER/.ssh/authorized_keys   (run here, paste the key)
       chown $APP_USER:$APP_USER /home/$APP_USER/.ssh/authorized_keys && chmod 600 /home/$APP_USER/.ssh/authorized_keys
  3. In GitHub → Settings → Secrets and variables → Actions, add:
       DEPLOY_HOST = this server's IP     DEPLOY_USER = $APP_USER
       DEPLOY_PATH = $APP_DIR             DEPLOY_SSH_KEY = contents of nomorespace_deploy (the PRIVATE key)
  4. GitHub → Actions → Deploy → Run workflow.
DONE
