export const BOTTLES_PER_CASE = 12;

export function casesForBottles(bottles: number): number {
  if (!Number.isFinite(bottles) || bottles <= 0) return 0;
  return Math.ceil(bottles / BOTTLES_PER_CASE);
}

export function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function formatMoney(amount: number): string {
  const negative = amount < 0;
  const formatted = Math.abs(amount).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  return negative ? `-${formatted}` : formatted;
}

export function formatGeneratedAt(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}/${get("day")}/${get("year")}, ${get("hour")}:${get("minute")} ${get("dayPeriod")}`.replace(
    /[\u00a0\u202f]/g,
    " ",
  );
}

export function billFileName(restaurantName: string, orderNumber: string): string {
  const clean = restaurantName
    .replace(/[^\w\s.-]+/g, "")
    .trim()
    .replace(/\s+/g, " ");
  return `Bill of Lading - ${clean || "Order"} - ${orderNumber}.pdf`;
}
