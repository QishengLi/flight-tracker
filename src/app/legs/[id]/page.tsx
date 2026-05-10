export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { db } from "@/db";
import { legs, priceSnapshots, alerts as alertsTable } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import ArchiveLegButton from "./ArchiveLegButton";

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTs(ts: Date | string) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function LegDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [leg] = await db.select().from(legs).where(eq(legs.id, id)).limit(1);
  if (!leg) notFound();

  const snapshots = await db
    .select()
    .from(priceSnapshots)
    .where(eq(priceSnapshots.legId, id))
    .orderBy(desc(priceSnapshots.checkedAt))
    .limit(100);

  const firedAlerts = await db
    .select()
    .from(alertsTable)
    .where(eq(alertsTable.legId, id))
    .orderBy(desc(alertsTable.firedAt))
    .limit(20);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <a href="/" className="text-blue-600 text-sm hover:underline">← Dashboard</a>
        <h1 className="text-lg font-semibold text-gray-900 mt-1">
          {leg.origin} → {leg.destination} · {fmtDate(leg.departureDate)}
        </h1>
      </header>

      <main className="px-6 py-8 max-w-4xl mx-auto space-y-8">
        {/* Leg summary card */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Airlines tracked</p>
            <p className="font-medium">{leg.airlines.join(", ")}</p>
          </div>
          <div>
            <p className="text-gray-500">Status</p>
            <p className="font-medium capitalize">{leg.status}</p>
          </div>
          {leg.purchasePrice && (
            <>
              <div>
                <p className="text-gray-500">Purchase price</p>
                <p className="font-medium">${parseFloat(leg.purchasePrice).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-gray-500">Booked airline</p>
                <p className="font-medium">{leg.purchaseAirline ?? "—"}</p>
              </div>
              {leg.bookingRef && (
                <div>
                  <p className="text-gray-500">Booking ref</p>
                  <p className="font-medium font-mono">{leg.bookingRef}</p>
                </div>
              )}
            </>
          )}
          {leg.notes && (
            <div className="col-span-2">
              <p className="text-gray-500">Notes</p>
              <p>{leg.notes}</p>
            </div>
          )}
          <div className="col-span-2 pt-2">
            <ArchiveLegButton legId={leg.id} status={leg.status} />
          </div>
        </div>

        {/* Price snapshots */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Price history (last 100 checks)</h2>
          {snapshots.length === 0 ? (
            <p className="text-gray-400 text-sm">No snapshots yet. The cron job will populate this.</p>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-4 py-3 font-medium">Checked at</th>
                    <th className="px-4 py-3 font-medium">Airline</th>
                    <th className="px-4 py-3 font-medium">Price</th>
                    <th className="px-4 py-3 font-medium">Fare brand</th>
                    <th className="px-4 py-3 font-medium">Changeable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {snapshots.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-500">{fmtTs(s.checkedAt)}</td>
                      <td className="px-4 py-2 font-medium">{s.airline}</td>
                      <td className="px-4 py-2 text-gray-900">${parseFloat(s.price).toFixed(2)}</td>
                      <td className="px-4 py-2 text-gray-500">{s.fareBrand ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-500">
                        {s.isChangeable === null ? "—" : s.isChangeable ? "Yes" : "No"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Fired alerts */}
        {firedAlerts.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Alerts fired</h2>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-4 py-3 font-medium">Fired at</th>
                    <th className="px-4 py-3 font-medium">Kind</th>
                    <th className="px-4 py-3 font-medium">Price</th>
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">Airline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {firedAlerts.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-2 text-gray-500">{fmtTs(a.firedAt)}</td>
                      <td className="px-4 py-2">{a.kind}</td>
                      <td className="px-4 py-2 text-green-600 font-medium">
                        ${parseFloat(a.currentPrice).toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        ${parseFloat(a.referencePrice).toFixed(2)}
                      </td>
                      <td className="px-4 py-2">{a.cheapestAirline ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
