# Deploying OpenSearch

The site is one long-lived Node process with a SQLite file and a folder of git repositories on disk.
It needs a machine or container with a **persistent disk**. Serverless hosting such as Vercel or
Netlify will not work, because the research runs happen inside the server process.

## What is needed

| | |
|---|---|
| Runtime | Node 22.17 or later, and git |
| Disk | Persistent. About 250 KB per prompt after a few runs, and growing with each one |
| Size | 1 CPU and 1 GB of memory is enough to begin with |
| In front | A proxy that provides HTTPS. Caddy is the simplest |
| Accounts | A domain, an X developer app with credit, and an OpenRouter key for the first test |

## 1. Set up the X app

This step is the most likely to block a launch, and it can take time, so it should be done first.

1. An app is created at <https://developer.x.com>, of the type **Web App**, with OAuth 2.0 enabled.
2. The app is set to **Pay-per-use** and **Production**. Otherwise X refuses the sign-in with `client-not-enrolled`.
3. **Credits are bought, and auto-recharge is turned on.** X's documentation states that API requests
   fail until credits have been purchased. A sign-in reads one profile, which appears to fall under the
   price of about $0.01 per user per day. The current price should be checked in the developer console.
   The amounts should be small, but with no credit nobody can sign in at all.
4. `https://YOUR-DOMAIN/auth/x/callback` is registered as the callback. It must match exactly.
5. The Client ID and Client Secret are copied for step 3 below.

## 2. Prepare the server (Ubuntu or Debian)

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
sudo useradd --system --create-home --home-dir /srv/opensearch opensearch
sudo -iu opensearch git clone https://github.com/YOU/opensearch.git app
```

A private repository needs a deploy key or `gh auth login` for that user before it can be cloned.

## 3. Configure and build

```sh
sudo -iu opensearch
cd app
npm ci
npm run setup      # creates .env with a new encryption key
nano .env          # see the settings below
npm run build
npm run preflight  # must report that nothing is blocking a launch
```

| Setting in `.env` | Value |
|---|---|
| `ORIGIN` | `https://YOUR-DOMAIN`, with no trailing slash. It is fixed at build time, so a change needs a rebuild |
| `HOST`, `PORT` | Keep `127.0.0.1` and `3000`, behind the proxy |
| `ADDRESS_HEADER` | `X-Forwarded-For`. Required on a public address |
| `XFF_DEPTH` | `1`, for one proxy in front of the site |
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | From step 1 |
| `ENCRYPTION_KEY` | Created by `npm run setup`. **It should also be stored somewhere else**: without it, stored keys cannot be read |
| `ADMIN_HANDLES` | The X handle or handles allowed into `/admin`, separated by commas |
| `CONTACT_EMAIL` | Shown on the terms and privacy pages |
| `MAX_PROMPTS_PER_HOUR` | Flood limit per account. Default 20, and `0` removes it |
| `MAX_ACTIVE_PROJECTS` | Projects researched at once. Default 16. **`0` pauses all research** |
| `DATA_DIR` | Default `data`, inside the app folder |

The server refuses to start on a public address if something dangerous or essential is wrong: plain
http, sign-in without X, demonstration mode, keys pointed away from OpenRouter, X not configured, no
encryption key, or no `ADDRESS_HEADER`. The reason is printed. These checks run only if the build was
made for the public address, so `ORIGIN` must be set before `npm run build`.

An admin's handle is matched as text. If that handle is ever given up on X, it should be removed from
`ADMIN_HANDLES`, since someone else could then register it.

## 4. Keep it running

`/etc/systemd/system/opensearch.service`:

```ini
[Unit]
Description=OpenSearch
After=network-online.target

[Service]
User=opensearch
WorkingDirectory=/srv/opensearch/app
Environment=NODE_ENV=production
ExecStart=/usr/bin/node scripts/start.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl enable --now opensearch
journalctl -u opensearch -f
```

## 5. Provide HTTPS

`sudo apt install -y caddy` is available on current Ubuntu and Debian. `/etc/caddy/Caddyfile`:

```
YOUR-DOMAIN {
	reverse_proxy 127.0.0.1:3000
}
```

Caddy obtains the certificate, sends `X-Forwarded-For`, and passes the live streams through without
buffering. With nginx, `proxy_buffering off` is needed on `/p/`, and the same header must be set.

`ADDRESS_HEADER` is what tells visitors apart. The application's own port must stay private, with
`HOST=127.0.0.1` or a firewall, because a request that reaches it directly can avoid the limits by address.

## 6. Check it

```sh
curl https://YOUR-DOMAIN/healthz          # {"ok":true}
npm run preflight -- --key sk-or-v1-...   # with a capped key: one real run-like request, about a cent
```

The steps in [LAUNCH.md](LAUNCH.md) then cover a first real sign-in, prompt and donation.

## Docker

```sh
docker build --build-arg ORIGIN=https://YOUR-DOMAIN -t opensearch .
docker run -d --name opensearch --restart always -p 127.0.0.1:3000:3000 \
  -v opensearch-data:/data --env-file .env opensearch
```

`/data` must be a persistent volume. The `HOST` and `DATA_DIR` lines created by `npm run setup` must be
removed from `.env` first, because they would override the container's own values. On a platform such
as Fly or Railway, a volume is attached at `/data` and `ORIGIN` is passed as a build argument. Such
platforms run their own proxy, so `XFF_DEPTH` should follow their documentation. **This Dockerfile has
not been built or run, because Docker was not available on the machine it was written on.**

## Updating

```sh
git pull && npm ci && npm run build && sudo systemctl restart opensearch
```

Database changes are applied automatically at startup. A run in progress at that moment is abandoned,
its maximum cost stays counted against the donation, and the donation resumes on restart. Tabs that are
already open learn of the release within a minute, and load it at their next navigation.

## Backups

```sh
npm run backup                 # writes backups/<date>/, safe while the server is running
```

It should be scheduled and copied off the machine, for example with cron and rclone. `ENCRYPTION_KEY`
is deliberately left out and should be stored separately. To restore, the server is stopped, the
backup's `opensearch.sqlite` and `repos/` are placed in `DATA_DIR`, and the server is started.

## Operating it

- **Reports and takedowns.** `/admin` shows open reports and every prompt. A project can be removed
  (reversible) or deleted (permanent: text and repository). An account can be suspended, which signs
  it out, stops its donations and deletes its key.
- **Stopping all spending.** `MAX_ACTIVE_PROJECTS=0` and a restart pause every run, with donations kept
  in the queue. Stopping the service does the same.
- **Monitoring.** `/healthz` returns 200 while the site and database are working. Errors go to the
  journal, with OpenRouter keys removed.
- **Limits.** Held in memory, per visitor, with an IPv6 /64 counted as one visitor: cards 90 a minute,
  archives 12, sign-ins 30, writes 120, pages 1,200, live connections 12 at once. Per account: prompts
  as configured, donations 60 an hour and 3 in progress at once, keys tried 20 an hour. Reports: 10 an
  hour. They are in `src/lib/server/limits.ts`.
