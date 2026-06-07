"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const AIRLINE_OPTIONS = [
  { code: "AS", name: "Alaska" },
  { code: "DL", name: "Delta" },
  { code: "UA", name: "United" },
];

type Leg = {
  id: string;
  origin: string;
  destination: string;
  departureDate: string;
  airlines: string[];
  tripGroup: string | null;
  tripGroupRole: string | null;
  purchasePrice: string | null;
  purchaseDate: string | null;
  purchaseAirline: string | null;
  bookingRef: string | null;
  alertThresholdAbs: string | null;
  alertThresholdPct: string | null;
  notes: string | null;
};

export default function EditLegForm({ leg }: { leg: Leg }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    departureDate: leg.departureDate,
    airlines: leg.airlines,
    tripGroup: leg.tripGroup ?? "",
    tripGroupRole: leg.tripGroupRole ?? "",
    purchasePrice: leg.purchasePrice ?? "",
    purchaseDate: leg.purchaseDate ?? "",
    purchaseAirline: leg.purchaseAirline ?? "",
    bookingRef: leg.bookingRef ?? "",
    alertThresholdAbs: leg.alertThresholdAbs ?? "",
    alertThresholdPct: leg.alertThresholdPct ?? "",
    notes: leg.notes ?? "",
  });

  function toggleAirline(code: string) {
    setForm((f) => ({
      ...f,
      airlines: f.airlines.includes(code)
        ? f.airlines.filter((a) => a !== code)
        : [...f.airlines, code],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.airlines.length === 0) {
      setError("Select at least one airline.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/legs/${leg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        departureDate: form.departureDate,
        airlines: form.airlines,
        tripGroup: form.tripGroup || null,
        tripGroupRole: form.tripGroupRole || null,
        purchasePrice: form.purchasePrice ? parseFloat(form.purchasePrice) : null,
        purchaseDate: form.purchaseDate || null,
        purchaseAirline: form.purchaseAirline || null,
        bookingRef: form.bookingRef || null,
        alertThresholdAbs: form.alertThresholdAbs ? parseFloat(form.alertThresholdAbs) : null,
        alertThresholdPct: form.alertThresholdPct ? parseFloat(form.alertThresholdPct) : null,
        notes: form.notes || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to save.");
      setSubmitting(false);
      return;
    }

    router.push(`/legs/${leg.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-500">
        <div>
          <p className="font-medium text-gray-400 text-xs uppercase tracking-wide mb-1">Origin</p>
          <p className="text-gray-900 font-medium">{leg.origin}</p>
        </div>
        <div>
          <p className="font-medium text-gray-400 text-xs uppercase tracking-wide mb-1">Destination</p>
          <p className="text-gray-900 font-medium">{leg.destination}</p>
        </div>
      </div>

      <Field label="Departure date" required>
        <input
          type="date"
          value={form.departureDate}
          onChange={(e) => setForm((f) => ({ ...f, departureDate: e.target.value }))}
          className="input"
          required
        />
      </Field>

      <Field label="Airlines to track" required>
        <div className="flex gap-3">
          {AIRLINE_OPTIONS.map(({ code, name }) => (
            <label key={code} className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={form.airlines.includes(code)}
                onChange={() => toggleAirline(code)}
                className="rounded border-gray-300"
              />
              {name}
            </label>
          ))}
        </div>
      </Field>

      <hr className="border-gray-100" />
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Purchase info</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Purchase price ($)">
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="289.00"
            value={form.purchasePrice}
            onChange={(e) => setForm((f) => ({ ...f, purchasePrice: e.target.value }))}
            className="input"
          />
        </Field>
        <Field label="Purchase date">
          <input
            type="date"
            value={form.purchaseDate}
            onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
            className="input"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Booked airline">
          <select
            value={form.purchaseAirline}
            onChange={(e) => setForm((f) => ({ ...f, purchaseAirline: e.target.value }))}
            className="input"
          >
            <option value="">—</option>
            {AIRLINE_OPTIONS.map(({ code, name }) => (
              <option key={code} value={code}>{name} ({code})</option>
            ))}
          </select>
        </Field>
        <Field label="Booking ref">
          <input
            type="text"
            placeholder="ABCDEF"
            value={form.bookingRef}
            onChange={(e) => setForm((f) => ({ ...f, bookingRef: e.target.value }))}
            className="input"
          />
        </Field>
      </div>

      <hr className="border-gray-100" />
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Alert thresholds</p>
      <p className="text-xs text-gray-400 -mt-3">Leave blank to use defaults ($50 or 10%).</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Min drop ($)">
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="50"
            value={form.alertThresholdAbs}
            onChange={(e) => setForm((f) => ({ ...f, alertThresholdAbs: e.target.value }))}
            className="input"
          />
        </Field>
        <Field label="Min drop (%)">
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            placeholder="10"
            value={form.alertThresholdPct}
            onChange={(e) => setForm((f) => ({ ...f, alertThresholdPct: e.target.value }))}
            className="input"
          />
        </Field>
      </div>

      <hr className="border-gray-100" />
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Trip grouping</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Trip group label">
          <input
            type="text"
            placeholder="sf-trip-2026-06-09"
            value={form.tripGroup}
            onChange={(e) => setForm((f) => ({ ...f, tripGroup: e.target.value }))}
            className="input"
          />
        </Field>
        <Field label="Role">
          <select
            value={form.tripGroupRole}
            onChange={(e) => setForm((f) => ({ ...f, tripGroupRole: e.target.value }))}
            className="input"
          >
            <option value="">—</option>
            <option value="outbound">Outbound</option>
            <option value="return">Return</option>
          </select>
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          rows={2}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          className="input resize-none"
        />
      </Field>

      <div className="flex justify-end gap-3 pt-2">
        <a href={`/legs/${leg.id}`} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
          Cancel
        </a>
        <button
          type="submit"
          disabled={submitting}
          className="bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
