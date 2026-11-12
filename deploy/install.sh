#!/usr/bin/env bash
# Sets up Who's Gaff on an Ubuntu machine, public at its Tailscale Funnel address.
# Run from a clone of the repo: sudo ./deploy/install.sh   (safe to run again)
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
	echo "Run this with sudo: sudo $0" >&2
	exit 1
fi

DIR=/opt/whos-gaff
HERE=$(cd "$(dirname "$0")" && pwd)

if ! command -v docker >/dev/null; then
	echo "==> Installing Docker"
	curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
	# Ubuntu's docker.io package comes without Compose.
	echo "==> Installing Docker Compose"
	if ! apt-get install -y docker-compose-v2; then
		mkdir -p /usr/local/lib/docker/cli-plugins
		curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
			-o /usr/local/lib/docker/cli-plugins/docker-compose
		chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
	fi
fi
if ! command -v tailscale >/dev/null; then
	echo "==> Installing Tailscale"
	curl -fsSL https://tailscale.com/install.sh | sh
fi
command -v jq >/dev/null || apt-get install -y jq

if ! tailscale status >/dev/null 2>&1; then
	echo "==> Log in to Tailscale: open the link below"
	tailscale up
fi

echo "==> Turning on Tailscale Funnel (if asked, open the link to allow it)"
tailscale funnel --bg 3000
URL="https://$(tailscale status --json | jq -r '.Self.DNSName | rtrimstr(".")')"

echo "==> Installing the app in $DIR"
mkdir -p "$DIR"
cp "$HERE/docker-compose.yml" "$DIR/"
if [ ! -f "$DIR/.env" ]; then
	cat >"$DIR/.env" <<EOF
ORIGIN=$URL
# To send invite emails, add for example: SMTP_URL=smtps://user:pass@smtp.example.com
EOF
else
	# Follow a renamed machine or tailnet; keep every other setting.
	sed -i "s|^ORIGIN=.*|ORIGIN=$URL|" "$DIR/.env"
fi

cat >/etc/systemd/system/whos-gaff-update.service <<EOF
[Unit]
Description=Pull and run the latest Who's Gaff image
Wants=network-online.target docker.service
After=network-online.target docker.service

[Service]
Type=oneshot
WorkingDirectory=$DIR
ExecStart=/usr/bin/docker compose pull --quiet
ExecStart=/usr/bin/docker compose up -d --remove-orphans
ExecStart=/usr/bin/docker image prune -f
EOF
cat >/etc/systemd/system/whos-gaff-update.timer <<EOF
[Unit]
Description=Check for a new Who's Gaff image every 5 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF

echo "==> Keeping the laptop awake with the lid closed"
mkdir -p /etc/systemd/logind.conf.d
printf '[Login]\nHandleLidSwitch=ignore\nHandleLidSwitchExternalPower=ignore\nHandleLidSwitchDocked=ignore\n' \
	>/etc/systemd/logind.conf.d/whos-gaff.conf

systemctl daemon-reload
systemctl enable --now docker
# Replace a container started by hand with `docker run --name whos-gaff`; its data volume is kept.
docker rm -f whos-gaff >/dev/null 2>&1 || true
systemctl start whos-gaff-update.service
systemctl enable --now whos-gaff-update.timer

echo
echo "Who's Gaff is live at $URL"
echo "It updates itself within 5 minutes of each green build on main."
echo "Reboot once so closing the lid no longer sends the laptop to sleep."
