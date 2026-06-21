"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TrendPoint {
  leadDays: number;
  price: number;
}

interface BinRow {
  leadDays: number;
  p25: number;
  band: number; // p75 - p25
  median: number;
}

function bin(points: TrendPoint[]): BinRow[] {
  const buckets = new Map<number, number[]>();
  for (const p of points) {
    const b = Math.floor(p.leadDays / 5) * 5;
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push(p.price);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([leadDays, prices]) => {
      prices.sort((a, b) => a - b);
      const n = prices.length;
      const p25 = prices[Math.floor(n * 0.25)];
      const p75 = prices[Math.floor(n * 0.75)];
      const mid = Math.floor(n / 2);
      const median = n % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
      return { leadDays, p25, band: p75 - p25, median };
    });
}

export default function TrendsChart({
  points,
  distinctDepartures,
}: {
  points: TrendPoint[];
  distinctDepartures: number;
}) {
  if (points.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <p className="text-gray-400 text-sm">No price history for this route yet.</p>
      </div>
    );
  }

  const rows = bin(points);
  const allPrices = points.map((p) => p.price);
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const pad = Math.max((maxP - minP) * 0.15, 10);
  const yMin = Math.floor(Math.max(0, minP - pad) / 10) * 10;
  const yMax = Math.ceil((maxP + pad) / 10) * 10;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {distinctDepartures < 3 && (
        <p className="text-xs text-amber-600 mb-3">
          Only {distinctDepartures} past trip{distinctDepartures !== 1 ? "s" : ""} on this route — trends improve with more history.
        </p>
      )}
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="leadDays"
            type="number"
            domain={[0, 90]}
            reversed
            tickFormatter={(v) => `${v}d`}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            label={{
              value: "Days before departure →",
              position: "insideBottom",
              offset: -12,
              fontSize: 11,
              fill: "#9ca3af",
            }}
          />
          <YAxis
            domain={[yMin, yMax]}
            tickFormatter={(v) => `$${v}`}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip
            formatter={(value, name) => {
              const label = name === "median" ? "Median" : name === "p25" ? "25th pct" : "75th pct";
              return [`$${Number(value).toFixed(0)}`, label];
            }}
            labelFormatter={(v) => `${v} days out`}
            contentStyle={{ fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6 }}
          />
          {/* p25 base (invisible fill, sets the bottom of the band) */}
          <Area dataKey="p25" stackId="band" stroke="none" fill="transparent" />
          {/* band = p75 - p25 (stacked on top of p25) */}
          <Area dataKey="band" stackId="band" stroke="none" fill="#dbeafe" fillOpacity={0.6} name="75th pct" />
          {/* median line */}
          <Line
            dataKey="median"
            type="monotone"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
            name="median"
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 mt-2 text-center">
        Shaded band = 25th–75th percentile · Line = median · {points.length} data points from {distinctDepartures} past trip{distinctDepartures !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
