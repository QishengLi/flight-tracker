# Flight Tracker — Architecture

## 1. System Overview

The app has three independent parts: a Next.js web UI, a scheduled cron job, and a Postgres database that both share.

```mermaid
graph TB
    subgraph Browser
        User["👤 User"]
    end

    subgraph Vercel
        Proxy["proxy.ts\nHTTP Basic Auth"]
        UI["Next.js App\n(App Router, SSR)"]
        CronJob["/api/cron/check-prices\nGET · 15:00 UTC daily"]
        Cleanup["/api/cron/cleanup\nGET · 02:00 UTC daily"]
    end

    subgraph External
        SerpAPI["SerpAPI\nGoogle Flights"]
        Resend["Resend\nTransactional Email"]
    end

    subgraph Neon
        DB[("Postgres")]
    end

    User -->|"HTTPS + Basic Auth"| Proxy
    Proxy --> UI
    UI -->|"reads/writes"| DB

    VCron["Vercel Cron Scheduler"] -->|"GET + Bearer token"| CronJob
    VCron -->|"GET + Bearer token"| Cleanup
    CronJob -->|"flight prices"| SerpAPI
    CronJob -->|"snapshots, alerts"| DB
    CronJob -->|"price drop alert"| Resend
    Cleanup -->|"archive departed legs"| DB
    Resend -->|"email"| User
```

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) | SSR server components + API routes in one project |
| Hosting | Vercel (Hobby) | Free tier, built-in cron scheduler, zero-config deploys |
| Database | Neon (serverless Postgres) | Free tier, works with Vercel via connection string |
| ORM | Drizzle | Type-safe schema-as-code, lightweight |
| Flight prices | SerpAPI (Google Flights) | 250 free calls/month, nonstop filter, exclude basic economy |
| Email | Resend | Simple API, free tier covers alert volume |
| Charts | Recharts | React-native, no canvas setup needed |
| Auth | HTTP Basic Auth (proxy.ts) | Single-user tool — no session management needed |

---

## 3. Request Flows

### 3a. User views the dashboard

```mermaid
sequenceDiagram
    actor User
    participant Proxy as proxy.ts
    participant Page as Dashboard (RSC)
    participant DB as Neon Postgres

    User->>Proxy: GET /
    Proxy->>Proxy: check Basic Auth header
    Proxy->>Page: pass through
    Page->>DB: SELECT legs WHERE status='active'
    Page->>DB: SELECT daily_lowest (latest per leg)
    Page-->>User: rendered HTML (legs table + filters)
```

### 3b. Cron job runs (daily price check)

```mermaid
sequenceDiagram
    participant Vercel as Vercel Cron
    participant Cron as /api/cron/check-prices
    participant DB as Neon Postgres
    participant API as SerpAPI
    participant Email as Resend

    Vercel->>Cron: GET (Authorization: Bearer CRON_SECRET)
    Cron->>Cron: verify CRON_SECRET
    Cron->>DB: INSERT cron_runs (started_at)
    Cron->>DB: SELECT active legs

    loop for each leg
        Cron->>API: GET google_flights?nonstop&exclude_basic
        API-->>Cron: flight offers (prices per airline)
        Cron->>Cron: filter: direct flights only, target airlines only
        Cron->>DB: INSERT price_snapshots (one row per airline)
        Cron->>DB: INSERT daily_lowest (cheapest across airlines)
        Cron->>Cron: evaluate alert rules
        opt price drop ≥ threshold AND not alerted in 24h
            Cron->>DB: INSERT alerts
            Cron->>Email: send price drop email
        end
    end

    Cron->>DB: UPDATE cron_runs (finished_at, counts, errors)
    Cron-->>Vercel: {ok, legsChecked, snapshotsWritten, alertsFired}
```

---

## 4. Database Schema

```mermaid
erDiagram
    legs {
        uuid id PK
        text origin
        text destination
        date departure_date
        text[] airlines
        text cabin
        text trip_group
        text trip_group_role
        numeric purchase_price
        date purchase_date
        text purchase_airline
        text booking_ref
        numeric alert_threshold_abs
        numeric alert_threshold_pct
        text status
        text notes
    }

    price_snapshots {
        bigint id PK
        uuid leg_id FK
        timestamptz checked_at
        text airline
        numeric price
        text fare_brand
        boolean is_changeable
        jsonb flight_offer
    }

    daily_lowest {
        bigint id PK
        uuid leg_id FK
        timestamptz checked_at
        numeric price
        text airline
        text fare_brand
        jsonb flight_offer
    }

    alerts {
        bigint id PK
        uuid leg_id FK
        timestamptz fired_at
        text kind
        numeric current_price
        numeric reference_price
        text cheapest_airline
        boolean delivered
    }

    cron_runs {
        bigint id PK
        timestamptz started_at
        timestamptz finished_at
        int legs_checked
        int api_calls
        int snapshots_written
        int alerts_fired
        jsonb errors
    }

    legs ||--o{ price_snapshots : "one per airline per check"
    legs ||--o{ daily_lowest : "one per check"
    legs ||--o{ alerts : "fired when price drops"
```

**Key design decision:** `price_snapshots` stores one row per airline per check, while `daily_lowest` stores the single best price across all airlines. Alert evaluation reads from `daily_lowest` only — so alerts fire on the overall market low, not per-airline.

---

## 5. Alert Pipeline

```mermaid
flowchart TD
    A([daily_lowest written]) --> B{leg has\npurchase_price?}
    B -->|No| Z([skip])
    B -->|Yes| C{departure_date\n≥ today?}
    C -->|No| Z
    C -->|Yes| D{"price drop ≥ threshold?\n$50 abs OR 10% pct\n(whichever first)"}
    D -->|No| Z
    D -->|Yes| E{alert of kind\nprice_drop fired\nin last 24h?}
    E -->|Yes| Z
    E -->|No| F([INSERT alerts row])
    F --> G([Send Resend email\nwith route, price, delta])
    G --> H([Mark alert delivered])
```

**Thresholds** are per-leg overrides, falling back to `$50 OR 10%` defaults. The 24-hour rolling window prevents alert spam on slow-moving markets.

---

## 6. UI Page Map

```mermaid
graph LR
    Dashboard["/ \nDashboard\n─────────────\nAll active legs\nMonth filter\nOutbound/Return filter"]
    Detail["/legs/:id\nLeg Detail\n─────────────\nPrice chart\nSnapshot table\nAlerts fired"]
    New["/legs/new\nAdd Leg\n─────────────\nRoute + airlines\nPurchase info\nTrip grouping"]
    Edit["/legs/:id/edit\nEdit Leg\n─────────────\nAll editable fields\nAlert thresholds"]

    Dashboard -->|"click route"| Detail
    Dashboard -->|"+ Add leg"| New
    Detail -->|"Edit leg"| Edit
    Edit -->|"Save / Cancel"| Detail
```

---

## 7. SerpAPI Filter Chain

Every price check passes through three layers before a price is written to the database:

```
Raw offers from SerpAPI
        │
        ▼
┌───────────────────────┐
│  Direct flights only  │  offer.flights.length === 1
│  (no connections)     │
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│  Target airlines only │  carrier code ∈ leg.airlines
│  (AS, DL, UA)         │
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│  Main cabin only      │  exclude_basic=true (SerpAPI-side)
│  (no basic economy)   │
└──────────┬────────────┘
           │
           ▼
   Qualifying offers
   → price_snapshots (per airline)
   → daily_lowest (cheapest overall)
```

---

## 8. Cron Schedule

| Job | Schedule | UTC | Purpose |
|---|---|---|---|
| `check-prices` | Daily | 15:00 UTC (08:00 PT) | Fetch prices, write snapshots, fire alerts |
| `cleanup` | Daily | 02:00 UTC | Archive legs where `departure_date < today` |

**API budget:** 9 legs × 1 check/day × 30 days = 270 calls/month against a 250/month free quota. Reduce active legs below 8 to stay comfortably within the free tier.
