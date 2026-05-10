import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { legs } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const rows = await db
    .select()
    .from(legs)
    .where(eq(legs.status, "active"))
    .orderBy(legs.departureDate);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const {
    origin,
    destination,
    departureDate,
    airlines,
    cabin = "ECONOMY",
    passengers = 1,
    tripGroup,
    tripGroupRole,
    purchasePrice,
    purchaseDate,
    purchaseAirline,
    bookingRef,
    alertThresholdAbs,
    alertThresholdPct,
    notes,
  } = body;

  if (!origin || !destination || !departureDate || !airlines?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const [row] = await db
    .insert(legs)
    .values({
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      departureDate,
      airlines,
      cabin,
      passengers,
      tripGroup: tripGroup || null,
      tripGroupRole: tripGroupRole || null,
      purchasePrice: purchasePrice ? String(purchasePrice) : null,
      purchaseDate: purchaseDate || null,
      purchaseAirline: purchaseAirline || null,
      bookingRef: bookingRef || null,
      alertThresholdAbs: alertThresholdAbs ? String(alertThresholdAbs) : null,
      alertThresholdPct: alertThresholdPct ? String(alertThresholdPct) : null,
      notes: notes || null,
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
