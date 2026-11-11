# Whos-gaff
A project to help figureout who can attent gaffs like timetomeet but with better overall dashboard and sitataics 

## What's built

A SvelteKit app (TypeScript, Tailwind, SQLite via Node's built-in `node:sqlite`) covering the Jira project **WG**:

- **MVP (WG-1):** accounts, fixed-date events and date polls, invites by email or link, voting with live counts, guest date suggestions, picking the winner, voting deadlines, RSVPs, the dashboard, and a group chat per event.
- **Gaff (WG-22):** saved gaff profiles, address only shown to people going, bring list and "who broke what" log.
- **UK night out (WG-16):** getting-home plans, "home safe" check-ins, pres → pub → club timeline with "we've moved" updates, rounds tracker, kitty with bank-transfer links.
- **Smarter planning (WG-27):** payday mode, "who's out this weekend?" pings.
- **Social (WG-31):** awards and hall of fame, night recap card, Spotify playlist link, hosting leaderboard.

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
| `MAIL_FROM` | `Who's Gaff <no-reply@whos-gaff.local>` | Sender for invite and date-set emails |
| `ORIGIN` | from request | Public URL, used by adapter-node for CSRF checks |
| `BODY_SIZE_LIMIT` | `512K` | Raise to allow photo uploads up to 8 MB |

Live updates use server-sent events from an in-process bus, so run a single server process.
All event times are UK local time (Europe/London).
