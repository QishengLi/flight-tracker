import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { legs } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const allowed = ["status", "notes", "purchasePrice", "alertThresholdAbs", "alertThresholdPct"];
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const [row] = await db
    .update(legs)
    .set(updates)
    .where(eq(legs.id, id))
    .returning();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}
