"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const AIRLINE_OPTIONS = [
  { code: "AS", name: "Alaska" },
  { code: "DL", name: "Delta" },
  { code: "UA", name: "United" },
];

export default function NewLegPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    origin: "",
    destination: "",
    departureDate: "",
    airlines: ["AS", "DL", "UA"] as string[],
    // optional purchase fields
    purchasePrice: "",
    purchaseDate: "",
    purchaseAirline: "",
    bookingRef: "",
    // optional grouping
    tripGroup: "",
    tripGroupRole: "",
    notes: "",
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

    const payload = {
      origin: form.origin.trim().toUpperCase(),
      destination: form.destination.trim().toUpperCase(),
      departureDate: form.departureDate,
      airlines: form.airlines,
      purchasePrice: form.purchasePrice ? parseFloat(form.purchasePrice) : undefined,
      purchaseDate: form.purchaseDate || undefined,
      purchaseAirline: form.purchaseAirline || undefined,
      bookingRef: form.bookingRef || undefined,
      tripGroup: form.tripGroup || undefined,
      tripGroupRole: form.tripGroupRole || undefined,
      notes: form.notes || undefined,
    };

    const res = await fetch("/api/legs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create leg.");
      setSubmitting(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <a href="/" className="text-blue-600 text-sm hover:underline">← Dashboard</a>
        <h1 className="text-lg font-semibold text-gray-900 mt-1">Add leg</h1>
      </header>

      <main className="px-6 py-8 max-w-xl mx-auto">
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Origin (IATA)" required>
              <input
                type="text"
                maxLength={3}
                placeholder="SEA"
                value={form.origin}
                onChange={(e) => setForm((f) => ({ ...f, origin: e.target.value.toUpperCase() }))}
                className="input"
                required
              />
            </Field>
            <Field label="Destination (IATA)" required>
              <input
                type="text"
                maxLength={3}
                placeholder="SFO"
                value={form.destination}
                onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value.toUpperCase() }))}
                className="input"
                required
              />
            </Field>
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
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Purchase info (optional)</p>

          <div className="grid grid-cols-2 gap-4">
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

          <div className="grid grid-cols-2 gap-4">
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
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Trip grouping (optional)</p>

          <div className="grid grid-cols-2 gap-4">
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
            <a href="/" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</a>
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Add leg"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
