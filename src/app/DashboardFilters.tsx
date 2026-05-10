"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function DashboardFilters({
  months,
}: {
  months: { value: string; label: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/?${next.toString()}`);
  }

  const selectedMonth = params.get("month") ?? "";
  const selectedRole = params.get("role") ?? "";

  return (
    <div className="flex gap-3 mb-6">
      <select
        value={selectedMonth}
        onChange={(e) => update("month", e.target.value)}
        className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-blue-400"
      >
        <option value="">All months</option>
        {months.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>

      <select
        value={selectedRole}
        onChange={(e) => update("role", e.target.value)}
        className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-blue-400"
      >
        <option value="">Outbound & Return</option>
        <option value="outbound">Outbound only</option>
        <option value="return">Return only</option>
      </select>
    </div>
  );
}
