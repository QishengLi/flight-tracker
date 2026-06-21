"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function ArchiveFilters({
  months,
  routes,
}: {
  months: { value: string; label: string }[];
  routes: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/archive?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <select
        value={params.get("month") ?? ""}
        onChange={(e) => update("month", e.target.value)}
        className="min-w-[140px] text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-blue-400"
      >
        <option value="">All months</option>
        {months.map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>

      <select
        value={params.get("route") ?? ""}
        onChange={(e) => update("route", e.target.value)}
        className="min-w-[140px] text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-blue-400"
      >
        <option value="">All routes</option>
        {routes.map((r) => {
          const [o, d] = r.split("-");
          return <option key={r} value={r}>{o} → {d}</option>;
        })}
      </select>
    </div>
  );
}
