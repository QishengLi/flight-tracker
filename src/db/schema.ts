import {
  pgTable,
  uuid,
  text,
  date,
  numeric,
  boolean,
  integer,
  bigserial,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
import { sql } from "drizzle-orm";

export const legs = pgTable(
  "legs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    origin: text("origin").notNull(),
    destination: text("destination").notNull(),
    departureDate: date("departure_date").notNull(),
    airlines: text("airlines").array().notNull(),
    cabin: text("cabin").default("ECONOMY").notNull(),
    passengers: integer("passengers").default(1).notNull(),

    tripGroup: text("trip_group"),
    tripGroupRole: text("trip_group_role"),

    purchasePrice: numeric("purchase_price", { precision: 10, scale: 2 }),
    purchaseDate: date("purchase_date"),
    purchaseAirline: text("purchase_airline"),
    bookingRef: text("booking_ref"),

    alertThresholdAbs: numeric("alert_threshold_abs", {
      precision: 10,
      scale: 2,
    }),
    alertThresholdPct: numeric("alert_threshold_pct", {
      precision: 5,
      scale: 2,
    }),

    status: text("status").default("active").notNull(),
    notes: text("notes"),
    createdAt: timestamptz("created_at").default(sql`now()`).notNull(),
    updatedAt: timestamptz("updated_at").default(sql`now()`).notNull(),
  },
  (t) => [
    index("legs_active_idx").on(t.status).where(sql`${t.status} = 'active'`),
    index("legs_trip_group_idx")
      .on(t.tripGroup)
      .where(sql`${t.tripGroup} IS NOT NULL`),
  ]
);

export const priceSnapshots = pgTable(
  "price_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    legId: uuid("leg_id")
      .notNull()
      .references(() => legs.id, { onDelete: "cascade" }),
    checkedAt: timestamptz("checked_at").default(sql`now()`).notNull(),
    airline: text("airline").notNull(),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").default("USD").notNull(),
    fareBrand: text("fare_brand"),
    flightNumber: text("flight_number"),
    departureTime: text("departure_time"),
    isChangeable: boolean("is_changeable"),
    flightOffer: jsonb("flight_offer"),
    source: text("source").default("amadeus").notNull(),
  },
  (t) => [index("snapshots_leg_time_idx").on(t.legId, t.checkedAt)]
);

export const dailyLowest = pgTable(
  "daily_lowest",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    legId: uuid("leg_id")
      .notNull()
      .references(() => legs.id, { onDelete: "cascade" }),
    checkedAt: timestamptz("checked_at").default(sql`now()`).notNull(),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").default("USD").notNull(),
    airline: text("airline").notNull(),
    fareBrand: text("fare_brand"),
    flightNumber: text("flight_number"),
    departureTime: text("departure_time"),
    isChangeable: boolean("is_changeable"),
    flightOffer: jsonb("flight_offer"),
  },
  (t) => [index("daily_lowest_leg_time_idx").on(t.legId, t.checkedAt)]
);

export const alerts = pgTable("alerts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  legId: uuid("leg_id")
    .notNull()
    .references(() => legs.id, { onDelete: "cascade" }),
  firedAt: timestamptz("fired_at").default(sql`now()`).notNull(),
  kind: text("kind").notNull(),
  currentPrice: numeric("current_price", { precision: 10, scale: 2 }).notNull(),
  referencePrice: numeric("reference_price", {
    precision: 10,
    scale: 2,
  }).notNull(),
  cheapestAirline: text("cheapest_airline"),
  delivered: boolean("delivered").default(false),
  payload: jsonb("payload"),
});

export const cronRuns = pgTable("cron_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  startedAt: timestamptz("started_at").notNull(),
  finishedAt: timestamptz("finished_at"),
  legsChecked: integer("legs_checked"),
  apiCalls: integer("api_calls"),
  snapshotsWritten: integer("snapshots_written"),
  alertsFired: integer("alerts_fired"),
  errors: jsonb("errors"),
});
