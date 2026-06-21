const SERPAPI_URL = "https://serpapi.com/search.json";

// Maps lowercase airline name strings to IATA codes.
const AIRLINE_NAME_TO_IATA: Record<string, string> = {
  "alaska airlines": "AS",
  "alaska": "AS",
  "delta": "DL",
  "delta air lines": "DL",
  "united": "UA",
  "united airlines": "UA",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveIata(flight: any): string | null {
  // Flight number prefix is most reliable: "AS 100" → "AS"
  const numMatch = flight?.flight_number?.match(/^([A-Z]{2})\s/);
  if (numMatch) return numMatch[1];
  const name = flight?.airline?.toLowerCase().trim();
  return name ? (AIRLINE_NAME_TO_IATA[name] ?? null) : null;
}

export interface FlightResult {
  airline: string;
  price: number;
  travelClass: string;
  flightNumber: string | null;
  departureTime: string | null;
  raw: unknown;
}

export async function searchFlights(params: {
  origin: string;
  destination: string;
  departureDate: string;
  airlines: string[];
  adults?: number;
}): Promise<FlightResult[]> {
  const query = new URLSearchParams({
    engine: "google_flights",
    departure_id: params.origin,
    arrival_id: params.destination,
    outbound_date: params.departureDate,
    type: "2",
    adults: String(params.adults ?? 1),
    currency: "USD",
    hl: "en",
    exclude_basic: "true",
    api_key: process.env.SERPAPI_API_KEY!,
  });

  const res = await fetchWithRetry(`${SERPAPI_URL}?${query.toString()}`);
  if (!res.ok) {
    throw new Error(`SerpAPI error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allOffers: any[] = [
    ...(data.best_flights ?? []),
    ...(data.other_flights ?? []),
  ];

  const results: FlightResult[] = [];
  for (const offer of allOffers) {
    const firstFlight = offer.flights?.[0];
    if (!firstFlight || typeof offer.price !== "number") continue;
    if ((offer.flights?.length ?? 0) > 1) continue; // skip connecting flights
    const iata = resolveIata(firstFlight);
    if (!iata) continue;
    if (params.airlines.length > 0 && !params.airlines.includes(iata)) continue;
    results.push({
      airline: iata,
      price: offer.price,
      travelClass: firstFlight.travel_class ?? "Economy",
      flightNumber: firstFlight.flight_number ?? null,
      departureTime: firstFlight.departure_airport?.time ?? null,
      raw: offer,
    });
  }

  return results;
}

async function fetchWithRetry(url: string, attempt = 1): Promise<Response> {
  const res = await fetch(url);
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    return fetchWithRetry(url, attempt + 1);
  }
  return res;
}
