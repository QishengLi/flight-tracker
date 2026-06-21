# Flight Tracker

A personal web app for monitoring flight prices on known routes. It checks prices multiple times a day, alerts you when the price of a booked ticket drops below what you paid, and accumulates a price history so you can spot patterns and decide when to buy.

## What it does

- **Price monitoring** — tracks one-way legs (SEA ↔ SFO / SJC) across Alaska, Delta, and United. Cron jobs run 3× per day and store the lowest main-cabin fare per airline.
- **Drop alerts** — if the current lowest price falls more than $50 or 10% below your purchase price, you get an email. Alerts dedupe within a 24-hour window.
- **Price history** — every check is stored, so you can view a chart of how prices moved over time for any leg.
- **Archive & trends** — once a leg's departure date passes it's automatically archived. The Archive tab shows all past legs with the lowest price ever seen vs. what you paid, plus a route-level trends chart (price vs. days before departure) built from accumulated history.
- **Trip grouping** — outbound and return legs can be linked under a trip group label so they display together on the dashboard.

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Database | Neon (serverless Postgres) via Drizzle ORM |
| Price data | SerpAPI Google Flights |
| Email alerts | Resend |
| Hosting | Vercel (cron jobs via `vercel.json`) |
| Charts | Recharts |

## Project structure

```
src/
  app/
    page.tsx                  # Active legs dashboard
    archive/page.tsx          # Archived legs + route trends
    legs/[id]/page.tsx        # Leg detail (price chart, snapshot history)
    legs/[id]/edit/           # Edit leg form
    legs/new/                 # Add leg form
    api/cron/check-prices/    # Cron endpoint: fetch prices, write snapshots, fire alerts
    api/cron/cleanup/         # Cron endpoint: archive departed legs
    api/legs/                 # REST endpoints for leg CRUD
  db/
    schema.ts                 # Drizzle schema (legs, price_snapshots, daily_lowest, alerts, cron_runs)
  lib/
    serpapi.ts                # SerpAPI Google Flights client
    alerts.ts                 # Alert evaluation logic
    email.ts                  # Resend email sender
```

## Local development

1. Copy `.env.local.example` to `.env.local` and fill in the required values.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Push the schema to your database:
   ```bash
   npm run db:generate
   npm run db:migrate
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `SERPAPI_API_KEY` | SerpAPI key for Google Flights data |
| `RESEND_API_KEY` | Resend API key for email alerts |
| `NOTIFY_EMAIL_TO` | Email address to send alerts to |
| `CRON_SECRET` | Shared secret that authenticates cron requests |

## Cron schedule

Defined in `vercel.json`. Three price-check runs per day (roughly 08:00, 14:00, 22:00 PT) plus a nightly cleanup at 02:00 UTC to archive departed legs.
