CREATE TABLE "alerts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"leg_id" uuid NOT NULL,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"current_price" numeric(10, 2) NOT NULL,
	"reference_price" numeric(10, 2) NOT NULL,
	"cheapest_airline" text,
	"delivered" boolean DEFAULT false,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "cron_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"legs_checked" integer,
	"api_calls" integer,
	"snapshots_written" integer,
	"alerts_fired" integer,
	"errors" jsonb
);
--> statement-breakpoint
CREATE TABLE "daily_lowest" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"leg_id" uuid NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"airline" text NOT NULL,
	"fare_brand" text,
	"flight_number" text,
	"departure_time" text,
	"is_changeable" boolean,
	"flight_offer" jsonb
);
--> statement-breakpoint
CREATE TABLE "legs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin" text NOT NULL,
	"destination" text NOT NULL,
	"departure_date" date NOT NULL,
	"airlines" text[] NOT NULL,
	"cabin" text DEFAULT 'ECONOMY' NOT NULL,
	"passengers" integer DEFAULT 1 NOT NULL,
	"trip_group" text,
	"trip_group_role" text,
	"purchase_price" numeric(10, 2),
	"purchase_date" date,
	"purchase_airline" text,
	"booking_ref" text,
	"alert_threshold_abs" numeric(10, 2),
	"alert_threshold_pct" numeric(5, 2),
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"leg_id" uuid NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"airline" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"fare_brand" text,
	"flight_number" text,
	"departure_time" text,
	"is_changeable" boolean,
	"flight_offer" jsonb,
	"source" text DEFAULT 'amadeus' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_leg_id_legs_id_fk" FOREIGN KEY ("leg_id") REFERENCES "public"."legs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_lowest" ADD CONSTRAINT "daily_lowest_leg_id_legs_id_fk" FOREIGN KEY ("leg_id") REFERENCES "public"."legs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_leg_id_legs_id_fk" FOREIGN KEY ("leg_id") REFERENCES "public"."legs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_lowest_leg_time_idx" ON "daily_lowest" USING btree ("leg_id","checked_at");--> statement-breakpoint
CREATE INDEX "legs_active_idx" ON "legs" USING btree ("status") WHERE "legs"."status" = 'active';--> statement-breakpoint
CREATE INDEX "legs_trip_group_idx" ON "legs" USING btree ("trip_group") WHERE "legs"."trip_group" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "snapshots_leg_time_idx" ON "price_snapshots" USING btree ("leg_id","checked_at");