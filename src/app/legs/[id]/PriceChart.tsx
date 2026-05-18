"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

const AIRLINE_COLORS: Record<string, string> = {
  AS: "#2563eb",
  DL: "#7c3aed",
  UA: "#059669",
};

export type ChartPoint = {
  date: string;
  [airline: string]: number | string;
};

export default function PriceChart({
  data,
  airlines,
  purchasePrice,
}: {
  data: ChartPoint[];
  airlines: string[];
  purchasePrice: number | null;
}) {
  if (data.length === 0) {
    return (
      <p className="text-gray-400 text-sm">
        No snapshots yet. The cron job will populate this.
      </p>
    );
  }

  const allPrices = data.flatMap((d) =>
    airlines.map((a) => d[a] as number | undefined).filter((v): v is number => v !== undefined)
  );
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const pad = Math.max((maxPrice - minPrice) * 0.15, 10);
  const yMin = Math.floor(Math.max(0, minPrice - pad) / 10) * 10;
  const yMax = Math.ceil((maxPrice + pad) / 10) * 10;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
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
          formatter={(value) => [`$${Number(value).toFixed(0)}`, ""]}
          contentStyle={{
            fontSize: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 6,
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
        {purchasePrice !== null && (
          <ReferenceLine
            y={purchasePrice}
            stroke="#f59e0b"
            strokeDasharray="4 3"
            label={{
              value: `Paid $${purchasePrice.toFixed(0)}`,
              position: "insideTopRight",
              fontSize: 11,
              fill: "#f59e0b",
            }}
          />
        )}
        {airlines.map((airline) => (
          <Line
            key={airline}
            type="monotone"
            dataKey={airline}
            name={airline}
            stroke={AIRLINE_COLORS[airline] ?? "#6b7280"}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
