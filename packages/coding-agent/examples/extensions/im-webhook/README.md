# IM Webhook Extension

Runs a small HTTP webhook inside the active havliand_agent session and injects inbound messages as user messages.

This extension is intended for simple IM and chat platform callbacks. For a VPS deployment, run havliand_agent as a private local service, put nginx in front of it, and expose only HTTPS publicly.

## Usage

```bash
HAVLIAND_AGENT_IM_WEBHOOK_HOST=0.0.0.0 \
HAVLIAND_AGENT_IM_WEBHOOK_PORT=8787 \
HAVLIAND_AGENT_IM_WEBHOOK_TOKEN=change-me \
havliand_agent --provider aicodewith --model gpt-5.5 \
  --extension packages/coding-agent/examples/extensions/im-webhook/index.ts
```

Send a message:

```bash
curl -X POST http://127.0.0.1:8787/message \
  -H 'authorization: Bearer change-me' \
  -H 'content-type: application/json' \
  -d '{"user":"alice","channel":"test","text":"Say hello"}'
```

Health check:

```bash
curl http://127.0.0.1:8787/health
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `HAVLIAND_AGENT_IM_WEBHOOK_HOST` | `127.0.0.1` | Bind host. Use `0.0.0.0` for VPS ingress. |
| `HAVLIAND_AGENT_IM_WEBHOOK_PORT` | `8787` | HTTP port. |
| `HAVLIAND_AGENT_IM_WEBHOOK_TOKEN` | unset | Optional bearer token required for `POST /message`. |

For production, set `HAVLIAND_AGENT_IM_WEBHOOK_HOST=127.0.0.1` and proxy public traffic through nginx. Do not expose the webhook port directly unless the VPS is on a private network.

## Request Body

```json
{
  "text": "message text",
  "user": "optional sender",
  "channel": "optional channel"
}
```

`message` is also accepted as an alias for `text`.

## VPS Deployment

The recommended production layout is:

- havliand_agent runs under `systemd` as an unprivileged user.
- The IM webhook binds to `127.0.0.1:8787`.
- nginx terminates public HTTP/HTTPS and proxies `/message` and `/health`.
- A bearer token protects `POST /message`.
- Secrets live in an environment file outside the repository.

The examples below assume:

- Domain: `agent.example.com`
- Service user: `havliand_agent`
- Working directory: `/srv/havliand_agent`
- Environment file: `/etc/havliand_agent/im-webhook.env`
- Extension path: `/srv/havliand_agent/packages/coding-agent/examples/extensions/im-webhook/index.ts`

Adjust paths, provider, model, and package manager for your host.

### Install and User Setup

Install havliand_agent and create a service account:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin havliand_agent
sudo mkdir -p /srv/havliand_agent /etc/havliand_agent
sudo chown -R havliand_agent:havliand_agent /srv/havliand_agent
sudo chmod 750 /etc/havliand_agent
```

Install the package globally, or place a checked-out repository under `/srv/havliand_agent` if you are running this example extension from source:

```bash
sudo npm install -g --ignore-scripts @havliand_agent/coding-agent
```

If the extension path points into a repository checkout, keep that checkout owned by the `havliand_agent` user and pull updates intentionally. Do not store provider API keys or webhook tokens in the repository.

### Environment File

Create `/etc/havliand_agent/im-webhook.env`:

```bash
sudo install -o root -g havliand_agent -m 0640 /dev/null /etc/havliand_agent/im-webhook.env
sudo editor /etc/havliand_agent/im-webhook.env
```

Example contents:

```dotenv
HAVLIAND_AGENT_IM_WEBHOOK_HOST=127.0.0.1
HAVLIAND_AGENT_IM_WEBHOOK_PORT=8787
HAVLIAND_AGENT_IM_WEBHOOK_TOKEN=replace-with-a-long-random-token

HAVLIAND_AGENT_PROVIDER=aicodewith
HAVLIAND_AGENT_MODEL=gpt-5.5

# Provider-specific credentials, if required by the selected provider.
# ANTHROPIC_API_KEY=...
# OPENAI_API_KEY=...
```

Generate a token with a password manager or:

```bash
openssl rand -base64 48
```

Only `root` and the `havliand_agent` group should be able to read the env file:

```bash
sudo chown root:havliand_agent /etc/havliand_agent/im-webhook.env
sudo chmod 0640 /etc/havliand_agent/im-webhook.env
```

### systemd Service

Create `/etc/systemd/system/havliand_agent-im-webhook.service`:

```ini
[Unit]
Description=havliand_agent IM webhook
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=havliand_agent
Group=havliand_agent
WorkingDirectory=/srv/havliand_agent
EnvironmentFile=/etc/havliand_agent/im-webhook.env
ExecStart=/usr/bin/env havliand_agent \
  --provider ${HAVLIAND_AGENT_PROVIDER} \
  --model ${HAVLIAND_AGENT_MODEL} \
  --extension /srv/havliand_agent/packages/coding-agent/examples/extensions/im-webhook/index.ts
Restart=on-failure
RestartSec=5s
TimeoutStopSec=30s
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=/srv/havliand_agent /home/havliand_agent
StandardOutput=journal
StandardError=journal
SyslogIdentifier=havliand_agent-im-webhook

[Install]
WantedBy=multi-user.target
```

Use the real path from `command -v havliand_agent` if `/usr/bin/env havliand_agent` does not find the executable under systemd's environment.

Load and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now havliand_agent-im-webhook.service
sudo systemctl status havliand_agent-im-webhook.service
```

Manage it with:

```bash
sudo systemctl restart havliand_agent-im-webhook.service
sudo systemctl stop havliand_agent-im-webhook.service
sudo systemctl start havliand_agent-im-webhook.service
```

Check the local webhook:

```bash
curl http://127.0.0.1:8787/health
curl -X POST http://127.0.0.1:8787/message \
  -H "authorization: Bearer $(grep '^HAVLIAND_AGENT_IM_WEBHOOK_TOKEN=' /etc/havliand_agent/im-webhook.env | cut -d= -f2-)" \
  -H 'content-type: application/json' \
  -d '{"user":"ops","channel":"local","text":"Say exactly: webhook ok"}'
```

### Reverse Proxy with nginx

Install nginx and keep the webhook port private:

```bash
sudo apt-get update
sudo apt-get install -y nginx
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 8787/tcp
```

Do not add a public firewall rule for `8787`. The HavliandAgent service should bind to `127.0.0.1`, so the port is reachable only from the VPS itself.

Create `/etc/nginx/sites-available/havliand_agent-im-webhook`:

```nginx
server {
    listen 80;
    server_name agent.example.com;

    client_max_body_size 64k;

    location = /health {
        proxy_pass http://127.0.0.1:8787/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 10s;
        proxy_send_timeout 10s;
    }

    location = /message {
        limit_except POST {
            deny all;
        }

        proxy_pass http://127.0.0.1:8787/message;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/havliand_agent-im-webhook /etc/nginx/sites-enabled/havliand_agent-im-webhook
sudo nginx -t
sudo systemctl reload nginx
```

Test through nginx:

```bash
curl http://agent.example.com/health
curl -X POST http://agent.example.com/message \
  -H 'authorization: Bearer replace-with-a-long-random-token' \
  -H 'content-type: application/json' \
  -d '{"user":"ops","channel":"nginx","text":"Say exactly: proxy ok"}'
```

### HTTPS with Certbot

Point the domain's A or AAAA record at the VPS before requesting a certificate.

Install Certbot:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
```

Issue and install a certificate:

```bash
sudo certbot --nginx -d agent.example.com
```

Choose the redirect option when prompted so HTTP redirects to HTTPS. Certbot updates the nginx server block with `listen 443 ssl`, certificate paths, and the HTTP redirect.

Verify renewal:

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

Webhook clients should use the HTTPS endpoint:

```bash
curl -X POST https://agent.example.com/message \
  -H 'authorization: Bearer replace-with-a-long-random-token' \
  -H 'content-type: application/json' \
  -d '{"user":"alice","channel":"im","text":"Deploy status?"}'
```

Keep the bearer token out of client-side code, repository files, screenshots, and shell history where possible. Rotate it by editing the env file and restarting the service:

```bash
sudo systemctl restart havliand_agent-im-webhook.service
```

## Logging and Observability

The extension sends startup and listener failure notifications through the active HavliandAgent UI. Under systemd, stdout and stderr go to journald.

Common commands:

```bash
sudo systemctl status havliand_agent-im-webhook.service
sudo journalctl -u havliand_agent-im-webhook.service -f
sudo journalctl -u havliand_agent-im-webhook.service --since '1 hour ago'
sudo journalctl -u havliand_agent-im-webhook.service -p warning..alert --since today
curl -fsS http://127.0.0.1:8787/health
curl -fsS https://agent.example.com/health
```

Operational checks:

- `systemctl status` shows whether the long-running agent process is active or restarting.
- `/health` confirms the webhook server is listening.
- `POST /message` returns `202` when a message was accepted.
- `POST /message` returns `401` when the bearer token is missing or wrong.
- `POST /message` returns `400` when the JSON body does not include `text` or `message`.
- `POST /message` may return `500` for invalid JSON or internal delivery failures.

The current extension does not log request bodies, API keys, or webhook tokens. Keep that property if you customize it. For production request logging, prefer metadata-only events such as:

- webhook startup and shutdown
- health check result
- rejected authentication
- accepted message with user/channel and byte size, without message text
- delivery error class and status, without provider credentials

### Journal Retention

journald retention is configured by the host. To cap logs for this service host-wide, edit `/etc/systemd/journald.conf`:

```ini
[Journal]
SystemMaxUse=1G
MaxRetentionSec=30day
```

Then restart journald:

```bash
sudo systemctl restart systemd-journald
```

If you forward logs to another system, redact authorization headers, provider API keys, env files, and message text unless your operational policy explicitly allows storing message content.
