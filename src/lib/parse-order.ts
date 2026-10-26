import { casesForBottles, roundCents } from "@/lib/format";
import type { OrderLine, ParsedOrder } from "@/lib/types";

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

type Span = {
  text: string;
  x: number;
  y: number;
  size: number;
  page: number;
  order: number;
};

const KNOWN_LABELS = new Set([
  "Order Date",
  "Order #",
  "Customer PO #",
  "Order Type",
  "Status",
  "Shipping Information",
  "Shipping Address",
  "Contact Information",
  "License Premise",
  "License Nickname",
  "Primary Contact",
  "Contact Email",
  "Primary Phone",
  "Primary Business Phone",
  "Totals",
  "Total Bottles",
  "Gross Price",
  "Taxable Amount",
  "Tax",
  "Freight",
  "Freight*",
  "Order Total",
]);

function cleanLine(value: string): string {
  return value
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

function parseMoney(value: string): number {
  const match = value.replace(/each/i, "").match(/-?\$?\s*([\d,]+\.\d{2}|\d+)/);
  if (!match) {
    throw new ParseError(`Could not read the amount "${value}".`);
  }
  return roundCents(Number(match[1].replace(/,/g, "")));
}

function isTextItem(item: unknown): item is { str: string; transform: number[] } {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    "transform" in item &&
    typeof (item as { str: unknown }).str === "string" &&
    Array.isArray((item as { transform: unknown }).transform)
  );
}

async function extractSpans(data: Uint8Array): Promise<Span[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  let doc;
  try {
    const task = pdfjs.getDocument({
      data,
      useSystemFonts: true,
      disableWorker: true,
      isEvalSupported: false,
    } as unknown as Parameters<typeof pdfjs.getDocument>[0]);
    doc = await task.promise;
  } catch {
    throw new ParseError("That file isn't a readable PDF.");
  }

  const spans: Span[] = [];
  let order = 0;
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageSpans: Span[] = [];
      for (const item of content.items) {
        if (!isTextItem(item)) continue;
        const text = item.str.replace(/[\u00a0\u202f]/g, " ");
        if (!text.trim()) continue;
        const x = item.transform[4] ?? 0;
        const y = item.transform[5] ?? 0;
        const size = Math.hypot(item.transform[0] ?? 0, item.transform[1] ?? 0);
        pageSpans.push({ text: text.trim(), x, y, size, page: pageNumber, order: 0 });
      }
      pageSpans.sort((a, b) => b.y - a.y || a.x - b.x);
      for (const span of pageSpans) {
        span.order = order;
        order += 1;
        spans.push(span);
      }
    }
  } finally {
    const closable = doc as { destroy?: () => Promise<void> | void } | undefined;
    if (closable && typeof closable.destroy === "function") await closable.destroy();
  }

  return spans;
}

function requireSpan(spans: Span[], label: string): Span {
  const found = spans.find((span) => span.text === label);
  if (!found) {
    throw new ParseError(`Could not find "${label}" on the order confirmation.`);
  }
  return found;
}

function valueBeside(spans: Span[], label: Span): Span {
  const value = spans
    .filter(
      (span) =>
        span.page === label.page &&
        Math.abs(span.y - label.y) < 2.5 &&
        span.x > label.x + 8,
    )
    .sort((a, b) => b.x - a.x)[0];
  if (!value) {
    throw new ParseError(`Could not read the value next to "${label.text}".`);
  }
  return value;
}

function addressAfter(spans: Span[], label: Span): string[] {
  const lines: string[] = [];
  let previous = label;
  for (const span of spans) {
    if (span.order <= label.order) continue;
    if (Math.abs(span.x - label.x) > 28) continue;
    const text = cleanLine(span.text);
    if (!text || KNOWN_LABELS.has(text)) break;
    if (span.size < 9) break;
    const gap = previous.page === span.page ? previous.y - span.y : 1000;
    if (lines.length > 0 && gap > 36) break;
    lines.push(text);
    previous = span;
    if (/\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(text)) break;
    if (lines.length >= 4) break;
  }
  return lines;
}

function readAddress(spans: Span[]): { street: string; cityLine: string } {
  const shipping = spans.find((span) => span.text === "Shipping Address");
  const premise = spans.find((span) => span.text === "License Premise");
  const lines = shipping ? addressAfter(spans, shipping) : [];
  const used = lines.length > 0 ? lines : premise ? addressAfter(spans, premise) : [];
  if (used.length === 0) {
    throw new ParseError("Could not find a shipping address on the order confirmation.");
  }
  if (used.length === 1) return { street: used[0], cityLine: "" };
  return { street: used.slice(0, -1).join(", "), cityLine: used[used.length - 1] };
}

function readProducts(spans: Span[]): OrderLine[] {
  const codes = spans.filter(
    (span) => /^\d{5,12}$/.test(span.text) && span.size < 9 && span.x < 140,
  );
  if (codes.length === 0) {
    throw new ParseError("Could not find any products on the order confirmation.");
  }

  const lines: OrderLine[] = [];
  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index];
    const next = codes[index + 1];
    const window = spans.filter(
      (span) => span.order > code.order && (next ? span.order < next.order : true),
    );
    const nameParts: string[] = [];
    for (const span of window) {
      if (/^Qty:/i.test(span.text)) break;
      if (span.x > 220) continue;
      if (span.size < 9.2) continue;
      if (KNOWN_LABELS.has(span.text)) continue;
      if (/\bML\b|per ounce|bottle/i.test(span.text) && span.size < 10) continue;
      nameParts.push(span.text);
    }
    const name = cleanLine(nameParts.join(" "));
    if (!name) {
      throw new ParseError(`Could not read the product name for code ${code.text}.`);
    }

    const qtySpan = window.find((span) => /^Qty:\s*\d+/i.test(span.text));
    if (!qtySpan) {
      throw new ParseError(`Could not read the quantity for ${name}.`);
    }
    const qtyMatch = qtySpan.text.match(/(\d+)/);
    const bottles = qtyMatch ? Number(qtyMatch[1]) : NaN;
    if (!Number.isFinite(bottles)) {
      throw new ParseError(`Could not read the quantity for ${name}.`);
    }

    const priceSpan =
      window.find((span) => /\$[\d,.]+\s*each/i.test(span.text)) ??
      window.find(
        (span) =>
          span.page === qtySpan.page &&
          Math.abs(span.y - qtySpan.y) < 2.5 &&
          span.x > qtySpan.x &&
          span.text.includes("$"),
      );
    if (!priceSpan) {
      throw new ParseError(`Could not read the unit price for ${name}.`);
    }
    const unitPrice = parseMoney(priceSpan.text);

    const grossSpan = window.find(
      (span) =>
        /^\$[\d,]+\.\d{2}$/.test(span.text) &&
        span.order > qtySpan.order &&
        span.x > 400,
    );
    const grossPrice = grossSpan
      ? parseMoney(grossSpan.text)
      : roundCents(bottles * unitPrice);

    lines.push({
      plcbCode: code.text,
      name,
      bottles,
      unitPrice,
      grossPrice,
    });
  }

  return lines;
}

export async function parseOrderConfirmation(data: Uint8Array): Promise<ParsedOrder> {
  const spans = await extractSpans(data);
  if (spans.length < 8) {
    throw new ParseError(
      "This PDF has no readable text. Use the order confirmation downloaded from the ordering site, not a scan or photo.",
    );
  }

  const dateLabel = requireSpan(spans, "Order Date");
  const dateSpan = spans.find(
    (span) =>
      span.order > dateLabel.order &&
      Math.abs(span.x - dateLabel.x) < 24 &&
      /^[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4}$/.test(span.text),
  );
  if (!dateSpan) {
    throw new ParseError("Could not find the order date.");
  }

  const orderLabel = requireSpan(spans, "Order #");
  const orderSpan = spans.find(
    (span) =>
      span.order > orderLabel.order &&
      Math.abs(span.x - orderLabel.x) < 24 &&
      /^\d{5,12}$/.test(span.text),
  );
  if (!orderSpan) {
    throw new ParseError("Could not find the order number.");
  }

  const address = readAddress(spans);
  const totalBottles = Number(valueBeside(spans, requireSpan(spans, "Total Bottles")).text);
  if (!Number.isFinite(totalBottles)) {
    throw new ParseError("Could not read the total bottles.");
  }

  const freightLabel =
    spans.find((span) => span.text === "Freight*") ??
    spans.find((span) => span.text === "Freight");
  if (!freightLabel) {
    throw new ParseError('Could not find "Freight" on the order confirmation.');
  }

  const taxableAmount = parseMoney(valueBeside(spans, requireSpan(spans, "Taxable Amount")).text);
  const tax = parseMoney(valueBeside(spans, requireSpan(spans, "Tax")).text);
  const freight = parseMoney(valueBeside(spans, freightLabel).text);
  const orderTotal = parseMoney(valueBeside(spans, requireSpan(spans, "Order Total")).text);
  const lines = readProducts(spans);

  const warnings: string[] = [];
  const bottleSum = lines.reduce((sum, line) => sum + line.bottles, 0);
  if (bottleSum !== totalBottles) {
    warnings.push(
      `Line quantities add up to ${bottleSum} bottles, while the confirmation totals ${totalBottles}. The bill of lading uses the confirmation total.`,
    );
  }
  const grossSum = roundCents(lines.reduce((sum, line) => sum + line.grossPrice, 0));
  if (Math.abs(grossSum - taxableAmount) > 0.02) {
    warnings.push(
      `Line prices add up to ${grossSum.toFixed(2)}, while the taxable amount is ${taxableAmount.toFixed(2)}. The bill of lading keeps both figures as printed on the confirmation.`,
    );
  }

  return {
    orderNumber: orderSpan.text,
    orderDate: dateSpan.text,
    street: address.street,
    cityLine: address.cityLine,
    totalBottles,
    taxableAmount,
    tax,
    freight,
    orderTotal,
    totalBoxes: casesForBottles(totalBottles),
    lines,
    warnings,
  };
}
