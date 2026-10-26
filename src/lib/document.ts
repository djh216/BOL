import { roundCents } from "@/lib/format";
import type { BolDocument, OrderLine, ParsedOrder } from "@/lib/types";

function asString(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${label} is missing.`);
  const cleaned = value.replace(/[\u00a0\u202f]/g, " ").replace(/[ \t]+/g, " ").trim();
  if (!cleaned) throw new Error(`${label} is missing.`);
  if (cleaned.length > max) throw new Error(`${label} is too long.`);
  return cleaned;
}

function asMoney(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} is not a valid amount.`);
  }
  return roundCents(value);
}

function asCount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100000) {
    throw new Error(`${label} is not a valid count.`);
  }
  return value;
}

function asLine(value: unknown, index: number): OrderLine {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Line ${index + 1} is incomplete.`);
  }
  const line = value as Record<string, unknown>;
  return {
    plcbCode: asString(line.plcbCode, `PLCB code on line ${index + 1}`, 20),
    name: asString(line.name, `Product name on line ${index + 1}`, 180),
    bottles: asCount(line.bottles, `Bottle count on line ${index + 1}`),
    unitPrice: asMoney(line.unitPrice, `Unit price on line ${index + 1}`),
    grossPrice: asMoney(line.grossPrice, `Gross price on line ${index + 1}`),
  };
}

export function documentFromPayload(value: unknown): BolDocument {
  if (typeof value !== "object" || value === null) {
    throw new Error("The bill of lading details are missing.");
  }
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    throw new Error("Add at least one product before generating a bill of lading.");
  }
  if (body.lines.length > 80) {
    throw new Error("This order has more products than the bill of lading can print.");
  }

  const cityRaw = typeof body.cityLine === "string" ? body.cityLine.trim() : "";

  return {
    restaurantName: asString(body.restaurantName, "Restaurant name", 120),
    street: asString(body.street, "Street address", 160),
    cityLine: cityRaw ? asString(cityRaw, "City, state, and ZIP", 80) : "",
    orderNumber: asString(body.orderNumber, "Order number", 20),
    orderDate: asString(body.orderDate, "Order date", 40),
    lines: body.lines.map(asLine),
    totalBottles: asCount(body.totalBottles, "Total bottles"),
    totalBoxes: asCount(body.totalBoxes, "Total boxes"),
    taxableAmount: asMoney(body.taxableAmount, "Taxable amount"),
    tax: asMoney(body.tax, "Tax"),
    freight: asMoney(body.freight, "Freight"),
    directDeliveryFee: asMoney(body.directDeliveryFee ?? 0, "Direct delivery fee"),
    total: asMoney(body.total, "Order total"),
  };
}

export function payloadFromOrder(
  order: ParsedOrder,
  restaurantName: string,
  edits?: { street?: string; cityLine?: string; totalBoxes?: number },
): BolDocument {
  return documentFromPayload({
    restaurantName,
    street: edits?.street ?? order.street,
    cityLine: edits?.cityLine ?? order.cityLine,
    orderNumber: order.orderNumber,
    orderDate: order.orderDate,
    lines: order.lines,
    totalBottles: order.totalBottles,
    totalBoxes: edits?.totalBoxes ?? order.totalBoxes,
    taxableAmount: order.taxableAmount,
    tax: order.tax,
    freight: order.freight,
    directDeliveryFee: 0,
    total: order.orderTotal,
  });
}
