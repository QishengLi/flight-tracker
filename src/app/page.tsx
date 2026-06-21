export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/db";
import { legs, dailyLowest } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import DashboardFilters from "./DashboardFilters";
import TabNav from "./TabNav";

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

function toMonthValue(dateStr: string) {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function fmtMonthLabel(ym: string) {
  return new Date(ym + "-15").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; role?: string }>;
}) {
  const { month, role } = await searchParams;

  const allLegs = await db
    .select()
    .from(legs)
    .where(eq(legs.status, "active"))
    .orderBy(legs.departureDate);

  // Derive sorted unique months for the filter dropdown.
  const monthSet = new Set(allLegs.map((l) => toMonthValue(l.departureDate)));
  const months = Array.from(monthSet)
    .sort()
    .map((value) => ({ value, label: fmtMonthLabel(value) }));

  // Apply filters.
  const filtered = allLegs.filter((leg) => {
    if (month && toMonthValue(leg.departureDate) !== month) return false;
    if (role) {
      // "outbound"/"return" match tripGroupRole; legs with no role are shown in both views.
      if (leg.tripGroupRole && leg.tripGroupRole !== role) return false;
    }
    return true;
  });

  // Fetch latest daily_lowest for each visible leg.
  const latestPrices = await Promise.all(
    filtered.map(async (leg) => {
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

  // Group by trip_group.
  const grouped = new Map<string, typeof filtered>();
  const ungrouped: typeof filtered = [];
  for (const leg of filtered) {
    if (leg.tripGroup) {
      if (!grouped.has(leg.tripGroup)) grouped.set(leg.tripGroup, []);
      grouped.get(leg.tripGroup)!.push(leg);
    } else {
      ungrouped.push(leg);
    }
  }

  const allGroups: Array<{ label: string | null; legs: typeof filtered }> = [
    ...Array.from(grouped.entries()).map(([label, legs]) => ({ label, legs })),
    ...ungrouped.map((leg) => ({ label: null, legs: [leg] })),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Flight Tracker</h1>
        <Link
          href="/legs/new"
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-blue-700"
        >
          + Add leg
        </Link>
      </header>
      <TabNav />

      <main className="px-4 py-6 sm:px-6 sm:py-8 max-w-5xl mx-auto">
        {allLegs.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">No active legs.</p>
            <Link href="/legs/new" className="text-blue-600 hover:underline mt-2 inline-block">
              Add your first leg →
            </Link>
          </div>
        ) : (
          <>
            <Suspense>
              <DashboardFilters months={months} />
            </Suspense>

            {allGroups.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-12">No legs match the current filters.</p>
            ) : (
              <div className="space-y-6">
                {allGroups.map(({ label, legs: groupLegs }) => (
                  <div key={label ?? groupLegs[0].id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    {label && (
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {label}
                      </div>
                    )}

                    {/* Mobile card list */}
                    <div className="md:hidden divide-y divide-gray-100">
                      {groupLegs.map((leg) => {
                        const latest = priceMap.get(leg.id);
                        const currentPrice = latest ? parseFloat(latest.price) : null;
                        const d = delta(currentPrice, leg.purchasePrice);
                        return (
                          <Link key={leg.id} href={`/legs/${leg.id}`} className="block px-4 py-4 hover:bg-gray-50 active:bg-gray-100">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium text-gray-900 text-sm">
                                  {leg.origin} → {leg.destination}
                                </p>
                                {leg.tripGroupRole && (
                                  <span className="text-xs text-gray-400">{leg.tripGroupRole}</span>
                                )}
                                <p className="text-xs text-gray-500 mt-0.5">{fmtDate(leg.departureDate)}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{leg.airlines.join(", ")}</p>
                              </div>
                              <div className="text-right shrink-0">
                                {currentPrice !== null ? (
                                  <>
                                    <p className="text-sm font-medium text-gray-900">${currentPrice.toFixed(0)}</p>
                                    {latest?.airline && (
                                      <p className="text-xs text-gray-400">{latest.airline}{latest.fareBrand ? ` · ${latest.fareBrand}` : ""}</p>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-xs text-gray-400">No data</p>
                                )}
                                {d !== null && (
                                  <p className={`text-xs font-medium mt-0.5 ${d < 0 ? "text-green-600" : "text-gray-400"}`}>
                                    {d < 0 ? `↓ $${Math.abs(d).toFixed(0)}` : d === 0 ? "—" : `↑ $${d.toFixed(0)}`}
                                    {leg.purchasePrice && <span className="text-gray-300 font-normal"> vs {fmtPrice(leg.purchasePrice)}</span>}
                                  </p>
                                )}
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>

                    {/* Desktop table */}
                    <table className="hidden md:table w-full text-sm">
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
                                {leg.tripGroupRole && (
                                  <span className="block text-xs text-gray-400 mt-0.5">{leg.tripGroupRole}</span>
                                )}
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
          </>
        )}
      </main>
    </div>
  );
}
