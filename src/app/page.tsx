export const dynamic = "force-dynamic";

import Link from "next/link";
import { db } from "@/db";
import { legs, dailyLowest } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";

function statusBadge(status: string) {
  return status === "active" ? "Active" : status;
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtPrice(p: string | null) {
  if (!p) return "—";
  return `$${parseFloat(p).toFixed(0)}`;
}

function delta(current: number | null, purchase: string | null) {
  if (current === null || !purchase) return null;
  return current - parseFloat(purchase);
}

export default async function Dashboard() {
  const activeLegs = await db
    .select()
    .from(legs)
    .where(eq(legs.status, "active"))
    .orderBy(legs.departureDate);

  // Fetch latest daily_lowest for each leg.
  const latestPrices = await Promise.all(
    activeLegs.map(async (leg) => {
      const [row] = await db
        .select()
        .from(dailyLowest)
        .where(eq(dailyLowest.legId, leg.id))
        .orderBy(desc(dailyLowest.checkedAt))
        .limit(1);
      return { legId: leg.id, row: row ?? null };
    })
  );

  const priceMap = new Map(latestPrices.map((p) => [p.legId, p.row]));

  // Group by trip_group for display.
  const grouped = new Map<string, typeof activeLegs>();
  const ungrouped: typeof activeLegs = [];

  for (const leg of activeLegs) {
    if (leg.tripGroup) {
      const key = leg.tripGroup;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(leg);
    } else {
      ungrouped.push(leg);
    }
  }

  const allGroups: Array<{ label: string | null; legs: typeof activeLegs }> = [
    ...Array.from(grouped.entries()).map(([label, legs]) => ({ label, legs })),
    ...ungrouped.map((leg) => ({ label: null, legs: [leg] })),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Flight Tracker</h1>
        <Link
          href="/legs/new"
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-blue-700"
        >
          + Add leg
        </Link>
      </header>

      <main className="px-6 py-8 max-w-5xl mx-auto">
        {activeLegs.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">No active legs.</p>
            <Link href="/legs/new" className="text-blue-600 hover:underline mt-2 inline-block">
              Add your first leg →
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {allGroups.map(({ label, legs: groupLegs }) => (
              <div key={label ?? groupLegs[0].id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {label && (
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {label}
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                      <th className="px-4 py-3 font-medium">Route</th>
                      <th className="px-4 py-3 font-medium">Departure</th>
                      <th className="px-4 py-3 font-medium">Airlines</th>
                      <th className="px-4 py-3 font-medium">Current low</th>
                      <th className="px-4 py-3 font-medium">Paid</th>
                      <th className="px-4 py-3 font-medium">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {groupLegs.map((leg) => {
                      const latest = priceMap.get(leg.id);
                      const currentPrice = latest ? parseFloat(latest.price) : null;
                      const d = delta(currentPrice, leg.purchasePrice);
                      return (
                        <tr key={leg.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            <Link href={`/legs/${leg.id}`} className="hover:text-blue-600">
                              {leg.origin} → {leg.destination}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{fmtDate(leg.departureDate)}</td>
                          <td className="px-4 py-3 text-gray-600">{leg.airlines.join(", ")}</td>
                          <td className="px-4 py-3 text-gray-900">
                            {currentPrice !== null ? (
                              <span>
                                ${currentPrice.toFixed(0)}
                                {latest?.airline && (
                                  <span className="text-gray-400 text-xs ml-1">
                                    {latest.airline}
                                    {latest.fareBrand ? ` · ${latest.fareBrand}` : ""}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-gray-400">No data</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{fmtPrice(leg.purchasePrice)}</td>
                          <td className="px-4 py-3">
                            {d !== null ? (
                              <span className={d < 0 ? "text-green-600 font-medium" : "text-gray-400"}>
                                {d < 0 ? `↓ $${Math.abs(d).toFixed(0)}` : d === 0 ? "—" : `↑ $${d.toFixed(0)}`}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
