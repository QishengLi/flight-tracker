import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { legs } from "@/db/schema";
import { and, eq, lt, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await db
    .update(legs)
    .set({ status: "archived", updatedAt: new Date() })
    .where(
      and(
        eq(legs.status, "active"),
        lt(legs.departureDate, sql`CURRENT_DATE`)
      )
    )
    .returning({ id: legs.id });

  return NextResponse.json({ ok: true, archived: result.length });
}
