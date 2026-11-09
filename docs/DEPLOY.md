# Deploying OpenResearch

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
| Accounts | A domain, a GitHub OAuth app, and an OpenRouter key for the first test |

## 1. Register the GitHub OAuth app

Sign-in is free, and needs no credit or approval.

1. An OAuth app is registered at <https://github.com/settings/applications/new>, with `https://YOUR-DOMAIN`
   as the homepage.
2. `https://YOUR-DOMAIN/auth/github/callback` is entered as the callback. It must match exactly.
3. A client secret is generated on the app's page. It is shown once.
4. The Client ID and the secret are copied for step 3 below.

No scope is requested, so the site can read only the public profile, and no access token is kept.

## 2. Prepare the server (Ubuntu or Debian)

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
sudo useradd --system --create-home --home-dir /srv/openresearch openresearch
sudo -iu openresearch git clone https://github.com/YOU/openresearch.git app
```

A private repository needs a deploy key or `gh auth login` for that user before it can be cloned.

## 3. Configure and build

```sh
sudo -iu openresearch
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
| `XFF_DEPTH` | `1`, for one proxy in front of the site. On Railway it is `2`, as explained [below](#railway) |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | From step 1 |
| `ENCRYPTION_KEY` | Created by `npm run setup`. **It should also be stored somewhere else**: without it, stored keys cannot be read |
| `ADMIN_HANDLES` | The GitHub handle or handles allowed into `/admin`, separated by commas |
| `CONTACT_EMAIL` | Shown on the terms and privacy pages |
| `MAX_PROMPTS_PER_HOUR` | Flood limit per account. Default 20, and `0` removes it |
| `MAX_ACTIVE_PROJECTS` | Projects researched at once. Default 16. **`0` pauses all research** |
| `DATA_DIR` | Default `data`, inside the app folder |

The server refuses to start on a public address if something dangerous or essential is wrong: plain
http, sign-in without GitHub, demonstration mode, keys pointed away from OpenRouter, GitHub not configured, no
encryption key, or no `ADDRESS_HEADER`. The reason is printed. These checks run only if the build was
made for the public address, so `ORIGIN` must be set before `npm run build`. On Railway, it also refuses
to start without a volume, or with `DATA_DIR` outside the volume, whatever the build.

An admin's handle is matched as text. If that handle is ever given up on GitHub, it should be removed from
`ADMIN_HANDLES`, since someone else could then register it.

## 4. Keep it running

`/etc/systemd/system/openresearch.service`:

```ini
[Unit]
Description=OpenResearch
After=network-online.target

[Service]
User=openresearch
WorkingDirectory=/srv/openresearch/app
Environment=NODE_ENV=production
ExecStart=/usr/bin/node scripts/start.mjs
Restart=always
RestartSec=3
# Runs in progress are given up to 100 seconds to finish when the service is stopped.
TimeoutStopSec=120
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl enable --now openresearch
journalctl -u openresearch -f
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
docker build --build-arg ORIGIN=https://YOUR-DOMAIN -t openresearch .
docker run -d --name openresearch --restart always --stop-timeout 120 -p 127.0.0.1:3000:3000 \
  -v openresearch-data:/data --env-file .env openresearch
```

`/data` must be a persistent volume. The `HOST` and `DATA_DIR` lines created by `npm run setup` must be
removed from `.env` first, because they would override the container's own values. `--stop-timeout`
gives runs in progress time to finish when the container is stopped. CI builds the image, starts it
with a volume and a different `PORT`, waits for its health check to pass, and stops it, on every push
and pull request.

## Railway

The site is hosted on Railway as one service built from the `Dockerfile`, with one volume. Railway's
own proxy provides HTTPS, so steps 2, 4 and 5 above are not needed. These are the settings.

| Service setting | Value |
|---|---|
| Services | One, deployed from the GitHub repository and built from the `Dockerfile` |
| Replicas | One. There must never be more, because the runs are carried out inside the server process |
| Serverless | Off. A service that sleeps stops its runs |
| Volume | One, mounted at `/data`. The site refuses to start on Railway without it, or with `DATA_DIR` outside it |
| Healthcheck path | `/healthz` |
| Custom domain | `openresearch.click`, with the DNS records that Railway gives |

| Service variable | Value |
|---|---|
| `ORIGIN` | `https://openresearch.click`. Railway passes service variables to the Docker build as build arguments, so this reaches `ARG ORIGIN`. A change takes effect at the next deployment |
| `RAILWAY_RUN_UID` | `0`. Railway mounts volumes as root, and the image otherwise runs as the `node` user, which could not write to `/data` |
| `ADDRESS_HEADER` | `X-Forwarded-For` |
| `XFF_DEPTH` | `2`. Railway's edge removes any `X-Forwarded-For` sent by the visitor, and sends the visitor's address followed by one of its own, so the visitor's is second from the end. With `1`, every visitor would appear to come from Railway and share one allowance |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | `120`. Railway sends SIGTERM before each deployment. No new run is then started, runs in progress are given up to 100 seconds to finish, and the process ends. Railway stops it by force when this time runs out |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ADMIN_HANDLES`, `CONTACT_EMAIL` | As in step 3 |
| `ENCRYPTION_KEY` | Created with `npm run setup` on another machine, or with `openssl rand -base64 32`. **A copy must be kept somewhere other than Railway**: without it, stored keys cannot be read, and Railway's volume backups do not include it |

`HOST` and `DATA_DIR` are set by the image and are not added. The site listens on `PORT`, which is 3000
unless Railway sets another. A `Forwarded` header sent by a visitor reaches the site unchanged, so it
must never be used as `ADDRESS_HEADER`. Plain http is redirected to https by Railway's edge, and the
site tells browsers to use https from then on.

The callback registered with GitHub is `https://openresearch.click/auth/github/callback`. Once the site answers at
that domain, the generated `*.up.railway.app` domain is removed from the service: sign-in works only at
`ORIGIN`, and the site should be reached at one address only.

- **Backups.** Scheduled backups are switched on for the volume, in Railway. `npm run backup` is not a
  backup on Railway, because it writes inside the same container as the data it copies.
- **Logs.** Startup problems and errors are in the deployment's logs in Railway. `journalctl` applies
  only to the systemd setup above.
- **Updating.** A push to `main` is deployed. The volume can be attached to one deployment at a time, so
  Railway starts the new deployment only once the old one has stopped, and the site is unavailable in
  between. That includes the time taken by any run in progress, up to 100 seconds.

## Updating

```sh
git pull && npm ci && npm run build && sudo systemctl restart openresearch
```

Database changes are applied automatically at startup. When the server is stopped, no new run is
started, and runs in progress are given up to 100 seconds to finish. A run that is cut off is abandoned,
its maximum cost stays counted against the donation, and the donation resumes on restart. Tabs that are
already open learn of the release within a minute, and load it at their next navigation.

## Backups

```sh
npm run backup                 # writes backups/<date>/, safe while the server is running
```

It should be scheduled and copied off the machine, for example with cron and rclone. On Railway, the
volume's scheduled backups are used instead, as described [above](#railway). `ENCRYPTION_KEY` is
deliberately left out and should be stored separately. To restore, the server is stopped, the
backup's `openresearch.sqlite` and `repos/` are placed in `DATA_DIR`, and the server is started.

## Operating it

- **Reports and takedowns.** `/admin` shows open reports and every prompt. A project can be removed
  (reversible) or deleted (permanent: text and repository). An account can be suspended, which signs
  it out, stops its donations and deletes its key.
- **Stopping all spending.** `MAX_ACTIVE_PROJECTS=0` and a restart pause every run, with donations kept
  in the queue. Stopping the service does the same.
- **Monitoring.** `/healthz` returns 200 while the site and database are working. Errors go to the
  server's log, with OpenRouter keys removed: the journal under systemd, or the deployment's logs on
  Railway.
- **Limits.** Held in memory, per visitor, with an IPv6 /64 counted as one visitor: cards 90 a minute,
  archives 12, sign-ins 30, writes 120, pages 1,200, live connections 12 at once. Per account: prompts
  as configured, donations 60 an hour and 3 in progress at once, keys tried 20 an hour. Reports: 10 an
  hour. They are in `src/lib/server/limits.ts`.
