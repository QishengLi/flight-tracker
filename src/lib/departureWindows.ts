// Departure-time windows used to filter which flights a leg tracks.
// A leg with no windows selected tracks all departure times.

export type DepartureWindow = "morning" | "afternoon" | "evening";

export const DEPARTURE_WINDOWS: {
  key: DepartureWindow;
  label: string;
  hint: string;
}[] = [
  { key: "morning", label: "Morning", hint: "5am–12pm" },
  { key: "afternoon", label: "Afternoon", hint: "12pm–6pm" },
  { key: "evening", label: "Evening", hint: "6pm–5am" },
];

const WINDOW_KEYS = new Set(DEPARTURE_WINDOWS.map((w) => w.key));

// Whether the given hour (0–23) falls in a window. Evening wraps past midnight.
const IN_WINDOW: Record<DepartureWindow, (hour: number) => boolean> = {
  morning: (h) => h >= 5 && h < 12,
  afternoon: (h) => h >= 12 && h < 18,
  evening: (h) => h >= 18 || h < 5,
};

export function isDepartureWindow(value: string): value is DepartureWindow {
  return WINDOW_KEYS.has(value as DepartureWindow);
}

// Keep only recognized window keys; used to sanitize request payloads.
export function normalizeWindows(input: unknown): DepartureWindow[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (v): v is DepartureWindow => typeof v === "string" && isDepartureWindow(v)
  );
}

// Pull the hour out of a departure timestamp like "2026-06-09 18:30".
export function parseDepartureHour(departureTime: string | null | undefined): number | null {
  if (!departureTime) return null;
  const m = departureTime.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hour = Number(m[1]);
  return hour >= 0 && hour <= 23 ? hour : null;
}

// True if the departure falls in at least one selected window.
// No windows selected → matches everything. Unparseable time → kept (don't
// silently drop a flight we can't classify).
export function matchesDepartureWindows(
  departureTime: string | null | undefined,
  windows: string[] | null | undefined
): boolean {
  if (!windows || windows.length === 0) return true;
  const hour = parseDepartureHour(departureTime);
  if (hour === null) return true;
  return windows.some((w) => isDepartureWindow(w) && IN_WINDOW[w](hour));
}
