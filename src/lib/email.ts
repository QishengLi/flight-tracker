import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY!);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export async function sendPriceDropAlert(params: {
  legId: string;
  origin: string;
  destination: string;
  departureDate: string;
  currentPrice: number;
  purchasePrice: number;
  cheapestAirline: string;
  fareBrand: string | null;
  flightNumber: string | null;
  departureTime: string | null;
}): Promise<void> {
  const drop = params.purchasePrice - params.currentPrice;
  const pct = ((drop / params.purchasePrice) * 100).toFixed(0);
  const dateStr = formatDate(params.departureDate);
  const subject = `✈️ ${params.origin}→${params.destination} ${dateStr}: $${params.currentPrice.toFixed(0)} (you paid $${params.purchasePrice.toFixed(0)})`;

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const legUrl = `${appUrl}/legs/${params.legId}`;

  const brandNote = params.fareBrand
    ? ` — ${params.cheapestAirline} ${params.fareBrand}`
    : ` — ${params.cheapestAirline}`;

  const flightNote = params.flightNumber
    ? `Flight ${params.flightNumber}${params.departureTime ? ` · departs ${params.departureTime}` : ""}`
    : params.departureTime
    ? `Departs ${params.departureTime}`
    : null;

  const html = `
<p><strong>${params.origin} → ${params.destination}</strong> on ${dateStr}</p>
<p>Current lowest main-cabin fare: <strong>$${params.currentPrice.toFixed(2)}${brandNote}</strong></p>
${flightNote ? `<p>${flightNote}</p>` : ""}
<p>You paid: $${params.purchasePrice.toFixed(2)}</p>
<p>Drop: <strong>$${drop.toFixed(2)} (${pct}%)</strong></p>
<p><a href="${legUrl}">View leg detail →</a></p>
<hr/>
<p style="font-size:12px;color:#666;">Change fees not included. Check airline site before rebooking.</p>
`;

  await getResend().emails.send({
    from: "Flight Tracker <noreply@resend.dev>",
    to: process.env.NOTIFY_EMAIL_TO!,
    subject,
    html,
  });
}
