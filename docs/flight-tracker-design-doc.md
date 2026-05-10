# Flight Price Tracker — Design Document

**Author:** QL
**Status:** Draft v2
**Last updated:** 2026-05-08

---

## 1. Overview

A personal web app that tracks flight prices for known routes, alerts the user when the price of a booked ticket drops below the purchase price, and accumulates daily price history to surface seasonal patterns and "good buy" recommendations.

This is a single-user, low-volume tool. The architectural emphasis is on a reliable background job pipeline, not on the UI.

### 1.1 Goals

1. **Post-purchase price monitoring.** For tickets the user has already bought, check daily and alert if the current lowest price drops meaningfully below the purchase price (rebook signal).
2. **Historical price archive.** Store the daily lowest price for each tracked route × date pair, indefinitely, so multi-month and year-over-year patterns can be analyzed.
3. **Buy-timing recommendation (nice-to-have).** Given a future trip, compare today's price against the historical distribution for that route and lead-time and suggest "buy now" vs. "wait."

### 1.2 Non-goals

- Booking flights through the app (search → external booking link only).
- Multi-user support, auth, or sharing.
- Tracking arbitrary global routes. The route set is fixed and small.
- Real-time tracking. Price checks 2–3×/day are sufficient.

### 1.3 Success criteria

- Background checks run reliably on schedule for ≥30 days without manual intervention.
- A ticket-rebook alert fires within 12 hours of a meaningful price drop.
- After 60–90 days of data, the recommendation engine produces a reasoned "buy now / wait" output for any tracked route.

---

## 2. User scenarios

### 2.1 Routes & airlines (MVP)

**Routes (MVP):**

- `SEA ⇄ SFO`
- `SEA ⇄ SJC`

PAE is excluded from MVP. Adding PAE later means either treating SEA/PAE as substitutable origins for one logical trip (schema complication) or tracking them as separate trips you mentally compare (UI noise). Defer until needed.

**Airlines:** Alaska (AS), Delta (DL), United (UA).

**Typical pattern:** outbound Monday evening from SEA, return Wednesday or Thursday from SFO/SJC. Each leg is tracked **independently as a one-way** — the system does not assume round-trip pricing. This matches the user's mental model and avoids missing cases where one-way fares beat the round-trip total.

**Fare class filter:** Only **standard main-cabin fares** are tracked. Basic Economy / Saver / Basic / similar restrictive bucket fares are excluded from snapshots, even if they are the lowest price returned by the API. Refundable-with-credit (i.e., changeable for a fee or for credit) is acceptable; truly nonrefundable basic-economy fares with no change rights are not. See §5.4 for the parsing rules.

### 2.2 Core flows

**Flow A — Track a purchased leg.**
User enters: origin, destination, departure date, airline, flight number (optional), purchase price, purchase date. The system checks 3×/day. If the lowest equivalent main-cabin fare drops below the purchase price by the configured threshold, send a notification.

**Flow B — Track a future leg (not yet booked).**
User enters: origin, destination, departure date, airline filter. The system checks 3×/day. The dashboard shows current price vs. historical percentile for this route at this lead time. The user manually decides to buy.

**Flow C — Pair legs into a "trip" (UI grouping only).**
Because the user typically books out + return together, the dashboard supports an optional `trip_group` label so two one-way legs (e.g., SEA→SFO Mon and SFO→SEA Wed) display side-by-side. Pricing and tracking remain per-leg; the grouping is purely cosmetic.

**Flow D — Browse history.**
For any (origin, destination, departure_date) tuple, show a chart of daily lowest price over time, faceted by airline. Useful for understanding "when did this leg's price actually move?"

**Flow E — Pattern explorer (later).**
Heatmap or chart of typical price by day-of-week and lead time, aggregated across all historical departures on a route.

---

## 3. Architecture

### 3.1 High-level

```
┌─────────────────────┐
│   Next.js (Vercel)  │   ← UI + API routes
│   - Dashboard       │
│   - Trip CRUD       │
│   - Charts          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐         ┌─────────────────────┐
│   Postgres          │◄────────│  Cron worker        │
│   (Supabase / Neon) │         │  (Vercel Cron or    │
│                     │         │   GitHub Actions)   │
│   - trips           │         │  Runs 3×/day:       │
│   - price_snapshots │         │  1. Read active     │
│   - alerts          │         │     trips           │
│                     │         │  2. Query Amadeus   │
└─────────────────────┘         │  3. Write snapshot  │
           ▲                    │  4. Evaluate alerts │
           │                    │  5. Send notif.     │
           │                    └──────────┬──────────┘
           │                               │
           │                               ▼
           │                    ┌─────────────────────┐
           │                    │  Amadeus Self-      │
           │                    │  Service Flight     │
           │                    │  Offers Search API  │
           │                    └─────────────────────┘
           │
           ▼
┌─────────────────────┐
│  Notifications      │
│  (email via Resend  │
│   + optional Pushov.)│
└─────────────────────┘
```

### 3.2 Why this stack

- **Vercel + Next.js**: matches the "cloud + serverless cron" preference. Free tier covers a personal tool comfortably. Vercel Cron triggers a scheduled API route — no separate worker process to manage.
- **Postgres (Supabase or Neon)**: free tiers exist; both expose a connection string that works from Vercel. Time-series-shaped data is small enough that any relational DB is fine — no need for a TSDB.
- **Amadeus Self-Service Flight Offers Search**: free tier provides 2,000 calls/month. Estimated usage is ~180 calls/month, leaving wide headroom. Reliable, structured JSON, supports filtering by airline (`includedAirlineCodes=AS,DL,UA`).
- **Resend** for transactional email (free tier 3,000/mo, simple API). **Pushover** optional for phone push.

### 3.3 Why not the alternatives

- **Scraping Google Flights / airline sites**: brittle, against ToS, fails silently when markup changes — bad fit for a "set and forget" tool.
- **Kiwi Tequila / Duffel**: Kiwi requires partnership approval for production; Duffel is more bookings-focused. Amadeus is the path of least resistance for read-only price polling.
- **Self-hosted VPS**: more ops burden than this scale needs.

### 3.4 Data flow per check

1. Cron triggers `/api/cron/check-prices` (secured with a shared secret in headers).
2. Handler reads all `legs` where `status = 'active'`.
3. For each leg, build an Amadeus Flight Offers Search query:
   - origin, destination
   - departureDate (one-way; no returnDate)
   - `includedAirlineCodes`: leg.airlines
   - adults: 1, currency: USD, max: 50 (need a wider net to find main-cabin after filtering out basic economy)
4. Parse response → drop offers that don't qualify as main-cabin (see §5.4). From what remains, take the lowest price per airline.
5. Write one row to `price_snapshots` per qualifying airline. If no qualifying main-cabin fare exists for an airline, skip that airline — never invent a price. Then write one row to `daily_lowest` with the single cheapest price across all qualifying airlines for this leg and check time.
6. For each leg with a `purchase_price` set, evaluate alert rules against `daily_lowest`. If triggered and not fired in the last 24h, write an `alerts` row and send the email.
7. Archive any legs where `departure_date < today` (set `status = 'archived'`). This runs as a nightly cleanup step, separate from the price-check loop.
8. Log run metadata (duration, API calls, snapshots written, alerts fired, errors) to `cron_runs` for debugging.

---

## 4. Data model

```sql
-- A one-way leg the user wants to track. May or may not be purchased yet.
CREATE TABLE legs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin          text NOT NULL,           -- IATA, e.g. 'SEA'
  destination     text NOT NULL,           -- IATA, e.g. 'SFO'
  departure_date  date NOT NULL,
  airlines        text[] NOT NULL,         -- ['AS','DL','UA'] subset to track
  cabin           text DEFAULT 'ECONOMY',
  passengers      int  DEFAULT 1,

  -- Optional UI grouping so out + return display together. Pure cosmetic.
  trip_group      text,                    -- e.g. 'sf-trip-2026-06-09'
  trip_group_role text,                    -- 'outbound' | 'return' | null

  -- Purchase tracking (null if not yet bought)
  purchase_price  numeric(10,2),
  purchase_date   date,
  purchase_airline text,                   -- IATA code of booked carrier
  booking_ref     text,

  -- Alerting config (per-leg overrides, null = use defaults)
  alert_threshold_abs numeric(10,2),       -- e.g. 50.00 → alert if drop ≥ $50
  alert_threshold_pct numeric(5,2),        -- e.g. 10.00 → alert if drop ≥ 10%

  status          text NOT NULL DEFAULT 'active',  -- active|completed|archived
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX legs_active_idx ON legs(status) WHERE status = 'active';
CREATE INDEX legs_trip_group_idx ON legs(trip_group) WHERE trip_group IS NOT NULL;

-- One row per (leg, airline, check time). Append-only.
-- Only main-cabin fares pass the filter; basic-economy snapshots are dropped at parse time.
CREATE TABLE price_snapshots (
  id              bigserial PRIMARY KEY,
  leg_id          uuid NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
  checked_at      timestamptz NOT NULL DEFAULT now(),
  airline         text NOT NULL,           -- 'AS', 'DL', 'UA' — always a specific carrier, never a sentinel
  price           numeric(10,2) NOT NULL,  -- total price (base + taxes), USD
  currency        text NOT NULL DEFAULT 'USD',
  fare_brand      text,                    -- e.g. 'MAIN', 'MAIN CABIN', 'ECONOMY'
  is_changeable   boolean,                 -- true if changeable / refundable-as-credit
  flight_offer    jsonb,                   -- raw Amadeus offer for the cheapest qualifying match
  source          text NOT NULL DEFAULT 'amadeus'
);

CREATE INDEX snapshots_leg_time_idx ON price_snapshots(leg_id, checked_at DESC);

-- Overall lowest qualifying price across all airlines, one row per (leg, check time).
-- Used by alert evaluation and the recommendation engine. Avoids sentinel 'ANY' values
-- polluting price_snapshots and keeps aggregate queries simple.
CREATE TABLE daily_lowest (
  id              bigserial PRIMARY KEY,
  leg_id          uuid NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
  checked_at      timestamptz NOT NULL DEFAULT now(),
  price           numeric(10,2) NOT NULL,  -- total price (base + taxes), USD
  currency        text NOT NULL DEFAULT 'USD',
  airline         text NOT NULL,           -- carrier that offered this price
  fare_brand      text,
  is_changeable   boolean,
  flight_offer    jsonb
);

CREATE INDEX daily_lowest_leg_time_idx ON daily_lowest(leg_id, checked_at DESC);

-- Fired alerts. Used to dedupe (rolling 24h window) and to surface in UI.
CREATE TABLE alerts (
  id              bigserial PRIMARY KEY,
  leg_id          uuid NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
  fired_at        timestamptz NOT NULL DEFAULT now(),
  kind            text NOT NULL,           -- 'price_drop' | 'all_time_low' | 'buy_signal'
  current_price   numeric(10,2) NOT NULL,
  reference_price numeric(10,2) NOT NULL,  -- purchase_price or historical low
  cheapest_airline text,                   -- airline offering current_price at alert time
  delivered       boolean DEFAULT false,
  payload         jsonb
);

-- Operational log of cron executions.
CREATE TABLE cron_runs (
  id              bigserial PRIMARY KEY,
  started_at      timestamptz NOT NULL,
  finished_at     timestamptz,
  legs_checked    int,
  api_calls       int,
  snapshots_written int,
  alerts_fired    int,
  errors          jsonb
);
```

**Volume.** `price_snapshots`: ~4 legs × 3 checks/day × 3 airlines × 365 days ≈ 13,000 rows/year. `daily_lowest`: ~4,400 rows/year. Both trivial; kept indefinitely.

---

## 5. Background job

### 5.1 Schedule

Three price-check runs per day, spread out so we sample different times of day (prices do shift intraday). Vercel Cron schedules are UTC:

| Local (PT) | UTC (PDT) | UTC (PST) |
|---|---|---|
| 08:00 PT | 15:00 UTC | 16:00 UTC |
| 14:00 PT | 21:00 UTC | 22:00 UTC |
| 22:00 PT | 05:00 UTC | 06:00 UTC |

Use PDT offsets as the default; accept the 1h drift in winter.

Configured via `vercel.json` → `crons`. Each run hits a single endpoint that processes all legs sequentially.

A fourth nightly cron (e.g. 02:00 UTC) hits `/api/cron/cleanup` to archive legs where `departure_date < today`.

### 5.2 Endpoint contract

`POST /api/cron/check-prices`

- Auth: `Authorization: Bearer ${CRON_SECRET}` (Vercel injects this automatically for Vercel Crons; for GitHub Actions, set as a secret).
- Returns: `{ ok: true, legs_checked: N, snapshots_written: M, alerts_fired: K }`.
- Idempotent: rerunning produces extra snapshots and `daily_lowest` rows, never wrong state. Alerts dedupe by `(leg_id, kind)` with a rolling 24h window — no alert of a given kind fires more than once per leg per 24-hour period.

### 5.3 Resilience

- Per-leg try/catch — one failure doesn't kill the run.
- Amadeus token cached in a `token_cache` table (one row, `expires_at` column). Vercel serverless functions have no guaranteed warm state between invocations, so in-memory caching is not reliable.
- Exponential backoff on 429 / 5xx with max 3 retries.
- If a run fails entirely, log to `cron_runs.errors` and surface in the dashboard.

### 5.4 Fare class filter (main-cabin only)

The user explicitly does not want basic-economy fares tracked. These look like the lowest price but come with no seat selection, no changes, and no upgrades — they are not equivalent products to a main-cabin ticket and pollute the price-drop signal.

Amadeus returns fare brand info on each offer. The exact field names and brand strings vary by carrier. The qualification function should accept an offer and return `{ qualifies: bool, brand: str, changeable: bool }`.

**Rule:** an offer qualifies if it is **not** in any of the per-carrier exclusion lists below.

| Carrier | Exclude (basic / saver) | Accept (main and above) |
|---|---|---|
| Alaska (AS) | `SAVER` | `MAIN`, `FIRST`, `PREMIUM CLASS` |
| Delta (DL) | `BASIC ECONOMY`, `BASIC` | `MAIN CABIN`, `MAIN`, `COMFORT+`, `FIRST`, `DELTA ONE` |
| United (UA) | `BASIC ECONOMY`, `BASIC` | `ECONOMY`, `ECONOMY PLUS`, `PREMIUM PLUS`, `BUSINESS`, `FIRST` |

Match the brand string from `flightOffer.travelerPricings[].fareDetailsBySegment[].brandedFare` (or `brandedFareLabel`). Comparison is case-insensitive, trimmed. If brand info is missing (some Amadeus responses omit it), fall back to inspecting `cabin` (must be `ECONOMY` or above — never `BASIC_ECONOMY`) and `fareDetailsBySegment[].includedCheckedBags.quantity` (basic-economy almost always returns 0; main-cabin varies, so this is a soft signal only).

**Persist the brand and changeability** (`fare_brand`, `is_changeable` columns) so the dashboard can show "$214 — Alaska Main, changeable" rather than just a number, and so historical data stays interpretable if the rules change later.

**Validation plan:** during the first 2 weeks, log all returned offers (qualifying and rejected) to a side table. Spot-check against airline.com to confirm the filter isn't dropping legitimate main-cabin fares or letting basic-economy through. Adjust the brand-string lists as needed.

---

## 6. Alerting rules

For each active leg with a `purchase_price`:

**Trigger price-drop alert when ALL of:**
- `daily_lowest.price < purchase_price - alert_threshold_abs` **OR** `daily_lowest.price < purchase_price * (1 - alert_threshold_pct/100)`
- No alert of kind `price_drop` fired for this leg in the last 24h (rolling window, checked against `alerts.fired_at`).
- `departure_date - today >= 1` (no point alerting after departure).
- `daily_lowest` only contains qualifying main-cabin fares, so this condition is guaranteed by construction.

The alert body names the cheapest airline from `daily_lowest.airline` so the user knows which carrier to check.

**Optionally fire `all_time_low`** when the latest `daily_lowest.price` is the lowest value ever recorded for this leg (compare against `MIN(price)` from `daily_lowest` for that leg).

**Default thresholds:** `$50 OR 10%`, whichever is met first. Tunable per leg.

**Alert content (raw price drop, no change-fee math).**
The user opted to keep alerts simple — report the raw price drop and let them decide whether rebooking is worth it after factoring in change fees themselves. Email subject: `✈️ SEA→SFO Mon Jun 9: $214 (you paid $289)`. Body includes airline, fare brand, snapshot history chart, and a link back to the leg detail page. Optionally include a deep link to the airline's "manage trip" or rebook page if the booking_ref is set.

---

## 7. Recommendation engine (Phase 2)

Triggered when viewing a future leg without a `purchase_price`.

**Inputs:**
- All historical `daily_lowest` rows for the same (origin, destination) pair (already main-cabin by construction).
- Lead time = `departure_date - today` in days.
- Day-of-week of departure.

**Output:** one of `BUY_NOW`, `WAIT`, `NEUTRAL`, plus a confidence score and a short rationale.

**Method (start simple, iterate):**

1. Filter historical snapshots for the same route and same departure day-of-week.
2. For each historical departure, find the price observed at the same lead-time bucket (e.g., 14–21 days out).
3. Build the distribution of those prices. Compute current price's percentile within it.
4. Rules:
   - Current ≤ 25th percentile → `BUY_NOW`.
   - Current ≥ 75th percentile and lead time > 14 days → `WAIT`.
   - Current ≥ 75th percentile and lead time ≤ 7 days → `BUY_NOW` (no upside in waiting).
   - Otherwise → `NEUTRAL`.
5. Require a minimum sample size (e.g., ≥10 comparable past departures) before rendering anything other than `NEUTRAL — insufficient data`.

This is intentionally non-ML for v1. Add a regression model only if rules feel wrong after real data accumulates.

---

## 8. UI

Minimal, single-user, no real auth. Five screens:

1. **Dashboard.** Table of active legs, optionally grouped by `trip_group` so out + return appear together. For each leg: route, date, current lowest, fare brand, purchase price (if any), delta, sparkline of the last 30 days, status badge.
2. **Leg detail.** Big chart (price over time, line per airline + overall low). Snapshot table below with brand and changeability columns. Edit / archive / delete buttons.
3. **Add leg.** Form: origin, destination, departure date, airlines, optional purchase info, optional `trip_group` label.
4. **Pattern explorer.** Pick a route → show heatmap of avg price by lead time × day-of-week.
5. **Settings.** API key (encrypted at rest), notification email, default alert thresholds, cron run history.

**Stack:** Next.js (App Router), Tailwind, Recharts for charts, server components for data loading. No client-side state library — Postgres is the source of truth and pages just re-render.

**Auth:** since it's personal, gate the whole app behind HTTP Basic Auth via a thin Next.js middleware. The username and password come from env vars (`BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD`). No session cookies, no login page.

---

## 9. Configuration & secrets

Env vars on Vercel:

```
AMADEUS_CLIENT_ID
AMADEUS_CLIENT_SECRET
DATABASE_URL
RESEND_API_KEY
NOTIFY_EMAIL_TO
CRON_SECRET              # auto-injected by Vercel Crons
BASIC_AUTH_USER          # HTTP Basic Auth username
BASIC_AUTH_PASSWORD      # HTTP Basic Auth password
```

---

## 10. Cost estimate

| Item | Tier | Cost |
|---|---|---|
| Vercel | Hobby | $0 |
| Postgres (Supabase free or Neon free) | Free | $0 |
| Amadeus Flight Offers Search | Free up to 2,000 calls/mo (using ~180) | $0 |
| Resend | Free up to 3,000 emails/mo | $0 |
| Domain (optional) | — | $12/yr |

Realistic total: **$0–$1/month** for the foreseeable future.

---

## 11. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Amadeus self-service prices diverge from what's bookable on Alaska/Delta/United directly | Medium | Spot-check vs. airline sites for first 2 weeks. If systematic gap, store a per-airline correction factor or add a scraping fallback for the affected carrier. |
| Amadeus changes brand-name strings (e.g., "MAIN CABIN" → "Main Cabin", new sub-brand) and the filter starts dropping legitimate fares or accepting basic-economy | Medium | Log all rejected offers in the first 2 weeks. Periodic spot-check against airline.com. Brand list is in code, not DB — easy to update. |
| Vercel cron missed runs | Low | `cron_runs` log surfaces gaps; weekly sanity-check script can alert if no run in 12h. |
| Amadeus token / quota issue | Low | Backoff + retry; quota is 10× headroom. |
| API returns 0 qualifying main-cabin offers for a real leg | Low-Medium | Log and skip — don't write a $0 snapshot. If persistent on a leg, surface a dashboard warning. |
| Alert fatigue | Medium | 24h dedupe per kind; option to mute leg. |
| Database grows unbounded | Very low | Volume math says no. Revisit after 5 years. |

---

## 12. Roadmap

**Phase 1 — MVP (week 1–2)**
- Schema, Amadeus client, fare-brand filter, cron endpoint, basic dashboard.
- Manual add-leg form. Email alerts on price drop vs. purchase.

**Phase 2 — History & UX (week 3–4)**
- Leg detail charts. Trip-group display. Pattern explorer screen. Per-leg alert config.
- All-time-low alert kind.

**Phase 3 — Recommendation (after ~60 days of data)**
- Percentile-based buy/wait recommendation on leg detail.
- Backtest against early purchases to sanity-check.

**Phase 4 — Optional polish**
- Push notifications (Pushover, or hook into the iOS app you're building).
- Multi-passenger and cabin filtering.
- Add PAE as a substitutable origin to SEA legs.
- Export to CSV.

---

## 13. Open questions

All questions are now resolved:

1. **Trip group: manual free-text only in MVP.** The form accepts a free-text `trip_group` label; no auto-suggest. Auto-suggest (querying nearby-date legs during form submission) is deferred to Phase 2.
2. **Brand string maintenance.** Handled manually — edit the exclusion list in code when an unexpected brand string is spotted. The validation plan in §5.4 (logging all offers for the first 2 weeks) is the early-warning mechanism.
3. **Currency/taxes.** `price` columns store the Amadeus `total` (base + taxes, USD). Base price is not stored separately.
