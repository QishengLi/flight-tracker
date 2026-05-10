import { db } from "@/db";
import { alerts, legs } from "@/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";
import { sendPriceDropAlert } from "./email";

const DEFAULT_THRESHOLD_ABS = 50;
const DEFAULT_THRESHOLD_PCT = 10;

interface LegRow {
  id: string;
  origin: string;
  destination: string;
  departureDate: string;
  purchasePrice: string | null;
  alertThresholdAbs: string | null;
  alertThresholdPct: string | null;
}

interface LowestRow {
  price: number;
  airline: string;
  fareBrand: string | null;
}

export async function evaluateAlerts(
  leg: LegRow,
  lowest: LowestRow
): Promise<boolean> {
  if (!leg.purchasePrice) return false;

  const purchasePrice = parseFloat(leg.purchasePrice);
  const threshAbs = leg.alertThresholdAbs
    ? parseFloat(leg.alertThresholdAbs)
    : DEFAULT_THRESHOLD_ABS;
  const threshPct = leg.alertThresholdPct
    ? parseFloat(leg.alertThresholdPct)
    : DEFAULT_THRESHOLD_PCT;

  const today = new Date().toISOString().split("T")[0];
  if (leg.departureDate <= today) return false;

  const dropAbs = purchasePrice - lowest.price;
  const dropPct = (dropAbs / purchasePrice) * 100;
  if (dropAbs < threshAbs && dropPct < threshPct) return false;

  // Rolling 24h dedupe.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recent] = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(
      and(
        eq(alerts.legId, leg.id),
        eq(alerts.kind, "price_drop"),
        gt(alerts.firedAt, cutoff)
      )
    )
    .limit(1);

  if (recent) return false;

  await db.insert(alerts).values({
    legId: leg.id,
    kind: "price_drop",
    currentPrice: String(lowest.price),
    referencePrice: String(purchasePrice),
    cheapestAirline: lowest.airline,
    delivered: false,
    payload: { fareBrand: lowest.fareBrand },
  });

  await sendPriceDropAlert({
    legId: leg.id,
    origin: leg.origin,
    destination: leg.destination,
    departureDate: leg.departureDate,
    currentPrice: lowest.price,
    purchasePrice,
    cheapestAirline: lowest.airline,
    fareBrand: lowest.fareBrand,
  });

  await db
    .update(alerts)
    .set({ delivered: true })
    .where(and(eq(alerts.legId, leg.id), eq(alerts.delivered, false)));

  return true;
}
