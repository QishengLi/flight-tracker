import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { legs, priceSnapshots, dailyLowest, cronRuns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { searchFlights } from "@/lib/serpapi";
import { evaluateAlerts } from "@/lib/alerts";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const errors: unknown[] = [];
  let legsChecked = 0;
  let snapshotsWritten = 0;
  let alertsFired = 0;
  let apiCalls = 0;

  const [runRow] = await db
    .insert(cronRuns)
    .values({ startedAt })
    .returning({ id: cronRuns.id });

  const activeLegs = await db
    .select()
    .from(legs)
    .where(eq(legs.status, "active"));

  for (const leg of activeLegs) {
    try {
      const offers = await searchFlights({
        origin: leg.origin,
        destination: leg.destination,
        departureDate: leg.departureDate,
        airlines: leg.airlines,
      });
      apiCalls++;

      if (offers.length === 0) continue;

      // Lowest price per airline.
      const byAirline = new Map<string, (typeof offers)[0]>();
      for (const o of offers) {
        const existing = byAirline.get(o.airline);
        if (!existing || o.price < existing.price) byAirline.set(o.airline, o);
      }

      for (const [airline, o] of byAirline) {
        await db.insert(priceSnapshots).values({
          legId: leg.id,
          airline,
          price: String(o.price),
          fareBrand: o.travelClass,
          isChangeable: null,
          flightOffer: o.raw as Record<string, unknown>,
        });
        snapshotsWritten++;
      }

      // Overall lowest.
      const best = offers.reduce((a, b) => (a.price <= b.price ? a : b));
      await db.insert(dailyLowest).values({
        legId: leg.id,
        price: String(best.price),
        airline: best.airline,
        fareBrand: best.travelClass,
        isChangeable: null,
        flightOffer: best.raw as Record<string, unknown>,
      });

      const fired = await evaluateAlerts(leg, {
        price: best.price,
        airline: best.airline,
        fareBrand: best.travelClass,
      });
      if (fired) alertsFired++;

      legsChecked++;
    } catch (err) {
      errors.push({ legId: leg.id, error: String(err) });
    }
  }

  await db
    .update(cronRuns)
    .set({
      finishedAt: new Date(),
      legsChecked,
      apiCalls,
      snapshotsWritten,
      alertsFired,
      errors: errors.length ? errors : null,
    })
    .where(eq(cronRuns.id, runRow.id));

  return NextResponse.json({ ok: true, legsChecked, snapshotsWritten, alertsFired });
}
