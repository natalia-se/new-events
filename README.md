# Kompis Sverige — Stockholm event monitor

A small personal script that checks [Kompis Sverige activities](https://kompissverige.se/aktiviteter/) every two hours and emails you when a **new Greater Stockholm** event is posted.

It uses the public WordPress API (not a fragile HTML scrape of the listing), GitHub Actions for the schedule, and [Resend](https://resend.com)’s free tier for email. No AWS or SendGrid.

## What counts as Stockholm

Events tagged with these regions:

- Stockholm
- Botkyrka
- Haninge
- Sollentuna

Plus a keyword fallback for nearby places that are often untagged (Huddinge, Solna, Tyresö, Nacka, Sundbyberg, and similar).

The **first run only records current events**. It does not email the existing backlog.

## Local run

```bash
cp .env.example .env
# fill in RESEND_API_KEY and TO_EMAIL
npm install
npm run dry-run    # list Greater Stockholm events, no email
npm start          # first time: seed seen.json
npm run test-email # send a one-line test mail
```

`npm start` after `seen.json` is seeded will email only when something new appears.

## GitHub Actions (free, private repo is fine)

1. Create a free [Resend](https://resend.com) account **with the inbox you want alerts in**.
2. Create an API key.
3. Push this repo to GitHub (private).
4. Repo **Settings → Secrets and variables → Actions**, add:
   - `RESEND_API_KEY`
   - `TO_EMAIL` (must be the Resend account email if you keep the default `onboarding@resend.dev` sender)
5. Open **Actions → Monitor Kompis Sverige → Run workflow**.
   - First time, leave defaults (or tick **seed**). That writes current IDs and does not spam you.
   - Optionally tick **notify_live** or **test_email** to confirm mail delivery.

The schedule then runs every 2 hours (`0 */2 * * *` UTC).

Without a custom domain, Resend’s sandbox sender `onboarding@resend.dev` can only deliver to **your Resend account email**. That is enough for a one-person monitor. If you later verify a domain, add a `FROM_EMAIL` secret such as `Kompis Sverige Monitor <alerts@yourdomain.com>`.

## Flags

| Flag | Meaning |
| --- | --- |
| `--dry-run` | Print matches; do not email or write `data/seen.json` |
| `--seed` | Record current events as already seen; no alert |
| `--notify-live` | After seeding, send a short “monitor is live” email |
| `--test-email` | Send a test email only |

## Politeness

Each scheduled run makes one API request. Event pages are fetched only for **new** Stockholm events (usually zero).
