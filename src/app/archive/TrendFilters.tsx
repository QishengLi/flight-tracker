"use client";

import { useRouter, useSearchParams } from "next/navigation";

const AIRLINES = ["ALL", "AS", "DL", "UA"];

export default function TrendFilters({ routes }: { routes: string[] }) {
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
        value={params.get("tr") ?? routes[0] ?? ""}
        onChange={(e) => update("tr", e.target.value)}
        className="min-w-[140px] text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-blue-400"
      >
        {routes.map((r) => {
          const [o, d] = r.split("-");
          return <option key={r} value={r}>{o} → {d}</option>;
        })}
      </select>

      <select
        value={params.get("ta") ?? "ALL"}
        onChange={(e) => update("ta", e.target.value)}
        className="min-w-[120px] text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-blue-400"
      >
        {AIRLINES.map((a) => (
          <option key={a} value={a}>{a === "ALL" ? "All airlines" : a}</option>
        ))}
      </select>
    </div>
  );
}
