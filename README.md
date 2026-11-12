# Whos-gaff
A project to help figureout who can attent gaffs like timetomeet but with better overall dashboard and sitataics 

## What's built

A SvelteKit app (TypeScript, Tailwind, SQLite via Node's built-in `node:sqlite`) covering the Jira project **WG**:

- **MVP (WG-1):** accounts, fixed-date events and date polls, invites by email or link, voting with live counts, guest date suggestions, picking the winner, voting deadlines, RSVPs, the dashboard, and a group chat per event.
- **Gaff (WG-22):** saved gaff profiles, address only shown to people going, bring list and "who broke what" log.
- **UK night out (WG-16):** getting-home plans, "home safe" check-ins, pres → pub → club timeline with "we've moved" updates, rounds tracker, kitty with bank-transfer links.
- **Smarter planning (WG-27):** payday mode, "who's out this weekend?" pings.
- **Social (WG-31):** awards and hall of fame, night recap card, Spotify playlist link, hosting leaderboard.
- **Games:** a Games tab on each event, played from everyone's phone at once. Drinking games are sorted by where you are: Pub (Pub roulette, Pub quiz forfeits), Club (Shot o'clock, Dance-floor dares), Gaff (Ring of fire, Table stakes, Secret missions, Never have I ever, Truth or dare) and Anywhere. Cards name random people from the event (`{1} buys {2} a drink`). Secret missions only reach the player's phone, while everyone else sees an easy fake task. Scored games keep a leaderboard, and soft mode swaps drinks for water.
- **Make your own games** at `/games`: one card per line, `{1}`/`{2}`/`{3}` for random people, and `secret: mission | fake task` for secret cards. They show up on every event you're on.
- **Security and privacy:** password reset by email, rate-limited login, sign-up and resets, security headers (CSP, HSTS, no framing), change password, log out other devices, download your data, delete your account, and privacy policy and terms pages.

Not built yet, because they need outside accounts: Google Calendar sync (WG-15), free/busy date suggestions (WG-28) and the Discord/WhatsApp bot (WG-37).

## Developing

Needs Node 24+ (for `node:sqlite`) and pnpm.

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # unit tests (vitest, in-memory database)
pnpm check        # type-check
```

The database is created at `data/whos-gaff.db` on first run; migrations live in `src/lib/server/db.ts`.

## Running in production

```sh
pnpm build
ORIGIN=https://your.domain BODY_SIZE_LIMIT=10M node build
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_PATH` | `data/whos-gaff.db` | SQLite database file |
| `UPLOADS_PATH` | `data/uploads` | Where event photos are stored |
| `SMTP_URL` | unset | e.g. `smtps://user:pass@smtp.example.com`; without it, emails are printed to the server log |
| `MAIL_FROM` | `Who's Gaff <no-reply@whos-gaff.local>` | Sender for invite, date-set and password-reset emails |
| `OPERATOR_NAME` | unset | Who runs this copy; named as the data controller on `/privacy` and `/terms` |
| `CONTACT_EMAIL` | unset | Contact address shown on `/privacy` and `/terms` |
| `ADDRESS_HEADER`, `XFF_DEPTH` | unset | Set behind a proxy (e.g. `X-Forwarded-For`, `1`) so rate limits see each visitor's IP; the home-server setup does this |
| `ORIGIN` | from request | Public URL, used by adapter-node for CSRF checks |
| `BODY_SIZE_LIMIT` | `512K` | Raise to allow photo uploads up to 8 MB |

Or run the Docker image, which keeps the database and photos in the `/data` volume:

```sh
docker run -p 3000:3000 -v whos-gaff:/data -e ORIGIN=https://your.domain ghcr.io/superjosh800/whos-gaff:latest
```

### Hosting on your own Ubuntu machine

`deploy/install.sh` runs the image on an Ubuntu machine, such as a spare laptop, and makes it public at the machine's free [Tailscale Funnel](https://tailscale.com/kb/1223/funnel) address. No router changes or domain are needed.

```sh
git clone https://github.com/SuperJosh800/whos-gaff
sudo whos-gaff/deploy/install.sh
```

It installs Docker and Tailscale, asks you to log in to Tailscale and allow Funnel, and starts the app from `/opt/whos-gaff`. A systemd timer pulls the newest image every 5 minutes, so each green build on `main` goes live by itself. It also stops the laptop sleeping when the lid is closed (reboot once for that). Settings such as `SMTP_URL` go in `/opt/whos-gaff/.env`; then run `sudo systemctl start whos-gaff-update` to apply them. The database is backed up every night at 04:30 into a `backups` folder in the data volume, keeping the newest 14; copy that folder off the machine now and then. Run one by hand with `docker exec whos-gaff node scripts/backup.mjs`. The installer is safe to run again: it keeps your settings and updates `ORIGIN`, so after renaming the machine or tailnet in Tailscale, just run it again.

GitHub Actions (`.github/workflows/ci.yml`) type-checks, tests and builds every push and pull request, and builds the Docker image. On `main` it then publishes the image to GitHub Container Registry as `latest` and `sha-<commit>`.

Without `SMTP_URL`, password-reset links only appear in the server log (`docker logs whos-gaff`), so set it up before people rely on resets.

Live updates use server-sent events from an in-process bus, so run a single server process.
All event times are UK local time (Europe/London).
