export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/db";
import { legs, dailyLowest, priceSnapshots } from "@/db/schema";
import { eq, inArray, desc, min, count, and } from "drizzle-orm";
import TabNav from "../TabNav";
import ArchiveFilters from "./ArchiveFilters";
import TrendFilters from "./TrendFilters";
import TrendsChart from "./TrendsChart";

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtPrice(p: string | null | undefined) {
  if (!p) return "—";
  return `$${parseFloat(p).toFixed(0)}`;
}

function toMonthValue(d: string) {
  return d.slice(0, 7);
}

function fmtMonthLabel(ym: string) {
  return new Date(ym + "-15").toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; route?: string; tr?: string; ta?: string }>;
}) {
  const { month, route, tr, ta } = await searchParams;

  const allLegs = await db
    .select()
    .from(legs)
    .where(eq(legs.status, "archived"))
    .orderBy(desc(legs.departureDate));

  const legIds = allLegs.map((l) => l.id);

  const [lowestPrices, checkCounts] = await Promise.all([
    legIds.length > 0
      ? db
          .select({ legId: dailyLowest.legId, lowest: min(dailyLowest.price) })
          .from(dailyLowest)
          .where(inArray(dailyLowest.legId, legIds))
          .groupBy(dailyLowest.legId)
      : Promise.resolve([]),
    legIds.length > 0
      ? db
          .select({ legId: priceSnapshots.legId, total: count(priceSnapshots.id) })
          .from(priceSnapshots)
          .where(inArray(priceSnapshots.legId, legIds))
          .groupBy(priceSnapshots.legId)
      : Promise.resolve([]),
  ]);

  const lowestMap = new Map(lowestPrices.map((r) => [r.legId, r.lowest]));
  const countMap = new Map(checkCounts.map((r) => [r.legId, r.total]));

  const routes = Array.from(new Set(allLegs.map((l) => `${l.origin}-${l.destination}`))).sort();

  const months = Array.from(new Set(allLegs.map((l) => toMonthValue(l.departureDate))))
    .sort()
    .reverse()
    .map((v) => ({ value: v, label: fmtMonthLabel(v) }));

  const filtered = allLegs.filter((l) => {
    if (month && toMonthValue(l.departureDate) !== month) return false;
    if (route && `${l.origin}-${l.destination}` !== route) return false;
    return true;
  });

  // Trend data
  const trendRoute = tr ?? routes[0] ?? null;
  const trendAirline = ta ?? "ALL";
  let trendPoints: { leadDays: number; price: number }[] = [];
  let distinctDepartures = 0;

  if (trendRoute) {
    const [tOrigin, tDest] = trendRoute.split("-");
    const trendLegs = allLegs.filter((l) => l.origin === tOrigin && l.destination === tDest);
    distinctDepartures = trendLegs.length;
    const trendLegIds = trendLegs.map((l) => l.id);

    if (trendLegIds.length > 0) {
      const rows = await db
        .select({
          legId: dailyLowest.legId,
          checkedAt: dailyLowest.checkedAt,
          price: dailyLowest.price,
        })
        .from(dailyLowest)
        .where(
          trendAirline === "ALL"
            ? inArray(dailyLowest.legId, trendLegIds)
            : and(
                inArray(dailyLowest.legId, trendLegIds),
                eq(dailyLowest.airline, trendAirline)
              )
        );

      const depDateMap = new Map(trendLegs.map((l) => [l.id, l.departureDate]));
      trendPoints = rows.flatMap((row) => {
        const dep = depDateMap.get(row.legId);
        if (!dep) return [];
        const leadMs =
          new Date(dep + "T12:00:00").getTime() - new Date(row.checkedAt).getTime();
        const leadDays = Math.round(leadMs / (1000 * 60 * 60 * 24));
        if (leadDays < 0 || leadDays > 120) return [];
        return [{ leadDays, price: parseFloat(row.price) }];
      });
    }
  }

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

      <main className="px-4 py-6 sm:px-6 sm:py-8 max-w-5xl mx-auto space-y-10">
        {/* Archived legs table */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Archived Legs</h2>
          <Suspense>
            <ArchiveFilters months={months} routes={routes} />
          </Suspense>

          {filtered.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-12">
              {allLegs.length === 0
                ? "No archived legs yet. Legs are automatically archived after their departure date."
                : "No legs match the current filters."}
            </p>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Mobile card list */}
              <div className="md:hidden divide-y divide-gray-100">
                {filtered.map((leg) => {
                  const lowest = lowestMap.get(leg.id);
                  const paid = leg.purchasePrice ? parseFloat(leg.purchasePrice) : null;
                  const lowestNum = lowest ? parseFloat(lowest) : null;
                  const d = paid !== null && lowestNum !== null ? paid - lowestNum : null;
                  return (
                    <Link
                      key={leg.id}
                      href={`/legs/${leg.id}`}
                      className="block px-4 py-4 hover:bg-gray-50 active:bg-gray-100"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm text-gray-900">
                            {leg.origin} → {leg.destination}
                          </p>
                          {leg.tripGroupRole && (
                            <span className="text-xs text-gray-400">{leg.tripGroupRole}</span>
                          )}
                          <p className="text-xs text-gray-500 mt-0.5">{fmtDate(leg.departureDate)}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{leg.airlines.join(", ")}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-500">Paid: {fmtPrice(leg.purchasePrice)}</p>
                          <p className="text-xs text-gray-500">Low: {fmtPrice(lowest)}</p>
                          {d !== null && (
                            <p className={`text-xs font-medium mt-0.5 ${d > 0 ? "text-green-600" : "text-gray-400"}`}>
                              {d > 0 ? `↓ $${d.toFixed(0)}` : "—"}
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
                    <th className="px-4 py-3 font-medium">Paid</th>
                    <th className="px-4 py-3 font-medium">Lowest seen</th>
                    <th className="px-4 py-3 font-medium">Δ</th>
                    <th className="px-4 py-3 font-medium">Checks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((leg) => {
                    const lowest = lowestMap.get(leg.id);
                    const paid = leg.purchasePrice ? parseFloat(leg.purchasePrice) : null;
                    const lowestNum = lowest ? parseFloat(lowest) : null;
                    const d = paid !== null && lowestNum !== null ? paid - lowestNum : null;
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
                        <td className="px-4 py-3 text-gray-900">{fmtPrice(leg.purchasePrice)}</td>
                        <td className="px-4 py-3 text-gray-900">{fmtPrice(lowest)}</td>
                        <td className="px-4 py-3">
                          {d !== null ? (
                            <span className={d > 0 ? "text-green-600 font-medium" : "text-gray-400"}>
                              {d > 0 ? `↓ $${d.toFixed(0)}` : "—"}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-400">{countMap.get(leg.id) ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Route trends */}
        {routes.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Route Trends</h2>
            <p className="text-xs text-gray-500 mb-3">
              Price vs. days before departure — aggregated across all past trips on this route.
            </p>
            <Suspense>
              <TrendFilters routes={routes} />
            </Suspense>
            <TrendsChart points={trendPoints} distinctDepartures={distinctDepartures} />
          </section>
        )}
      </main>
    </div>
  );
}
