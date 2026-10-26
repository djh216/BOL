import { readFile, writeFile, mkdir } from "node:fs/promises";
import { buildBillOfLadingPdf } from "../src/lib/bol-pdf";
import { payloadFromOrder } from "../src/lib/document";
import { parseOrderConfirmation } from "../src/lib/parse-order";
import type { BolDocument } from "../src/lib/types";

type Item = { str: string; x: number; y: number; page: number };

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function textItems(data: Uint8Array): Promise<Item[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs
    .getDocument({
      data,
      useSystemFonts: true,
      disableWorker: true,
      isEvalSupported: false,
    } as unknown as Parameters<typeof pdfjs.getDocument>[0])
    .promise;
  const items: Item[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item) || typeof item.str !== "string" || !item.str.trim()) continue;
      items.push({
        str: item.str.replace(/[\u00a0\u202f]/g, " "),
        x: item.transform[4] ?? 0,
        y: item.transform[5] ?? 0,
        page: pageNumber,
      });
    }
  }
  const closable = doc as { destroy?: () => Promise<void> | void };
  if (typeof closable.destroy === "function") await closable.destroy();
  return items;
}

function findItem(items: Item[], text: string, page?: number) {
  return items.find((item) => item.str.trim() === text && (page ? item.page === page : true));
}

async function checkAlba() {
  const bytes = new Uint8Array(await readFile("public/samples/alba-order-confirmation.pdf"));
  const order = await parseOrderConfirmation(bytes);
  assert(order.orderNumber === "189271630", `order number ${order.orderNumber}`);
  assert(order.orderDate === "Sep 21, 2026", `order date ${order.orderDate}`);
  assert(order.street === "7 W KING ST", `street ${order.street}`);
  assert(order.cityLine === "MALVERN, PA 19355", `city ${order.cityLine}`);
  assert(order.totalBottles === 39, `bottles ${order.totalBottles}`);
  assert(order.totalBoxes === 4, `boxes ${order.totalBoxes}`);
  assert(order.taxableAmount === 703.11, `taxable ${order.taxableAmount}`);
  assert(order.tax === 42.19, `tax ${order.tax}`);
  assert(order.freight === 97.5, `freight ${order.freight}`);
  assert(order.orderTotal === 842.8, `total ${order.orderTotal}`);
  assert(order.lines.length === 4, `lines ${order.lines.length}`);
  assert(order.lines[0].plcbCode === "100052603", order.lines[0].plcbCode);
  assert(order.lines[0].name === "Cantine Leuci Fiano Salento 2024", order.lines[0].name);
  assert(order.lines[0].bottles === 6 && order.lines[0].unitPrice === 11.99, "line 1 qty/price");
  assert(order.lines[0].grossPrice === 71.94, `line 1 gross ${order.lines[0].grossPrice}`);
  assert(
    order.lines[1].name === "Domenico Clerico Langhe Nebbiolo Capisme e 2024",
    order.lines[1].name,
  );
  assert(order.lines[3].bottles === 24 && order.lines[3].grossPrice === 323.76, "line 4");
  assert(order.warnings.length === 0, order.warnings.join(" "));

  const pdf = Buffer.from(
    await buildBillOfLadingPdf(payloadFromOrder(order, "Alba"), new Date("2026-10-26T15:19:00Z")),
  );
  const items = await textItems(new Uint8Array(pdf));
  for (const text of [
    "Alba",
    "7 W KING ST",
    "MALVERN, PA 19355",
    "189271630",
    "Sep 21, 2026",
    "Cantine Leuci Fiano Salento 2024",
    "Total Bottles: 39",
    "Direct Delivery Fee:",
    "$0.00",
    "$842.80",
    "PROOF OF DELIVERY",
    "Received By (Print Name)",
  ]) {
    assert(findItem(items, text), `missing "${text}" on Alba bill of lading`);
  }
  assert(findItem(items, "Page 1 of 1"), "Alba bill of lading should stay on one page");
  assert(!items.some((item) => item.page > 1), "Alba bill of lading gained an extra page");
  await mkdir("/tmp/bol-check", { recursive: true });
  await writeFile("/tmp/bol-check/alba.pdf", pdf);
  console.log("alba ok", pdf.length, "bytes");
}

const altaVia: BolDocument = {
  restaurantName: "Alta Via Pizzeria Bakery Square",
  street: "169-g Bakery Sq Blvd 6425 Penn Ave",
  cityLine: "Pittsburgh, PA 15206",
  orderNumber: "188736084",
  orderDate: "Aug 12, 2026",
  lines: [
    {
      plcbCode: "644502",
      name: "Rocchina Prosecco Brut DOC 2020",
      bottles: 36,
      unitPrice: 11.49,
      grossPrice: 413.64,
    },
  ],
  totalBottles: 36,
  totalBoxes: 3,
  taxableAmount: 413.64,
  tax: 28.96,
  freight: 72,
  directDeliveryFee: 0,
  total: 514.6,
};

async function checkAltaViaLayout() {
  const generated = Buffer.from(
    await buildBillOfLadingPdf(altaVia, new Date("2026-08-12T21:04:00Z")),
  );
  const actual = await textItems(new Uint8Array(generated));
  await writeFile("/tmp/bol-check/alta-via.pdf", generated);

  // x/y are PDF coordinates (origin bottom-left) taken from the sample bill of lading.
  const anchors: [string, number, number, number][] = [
    ["BILL OF LADING", 1, 225.1, 623.2],
    ["F. Magnotta, LLC", 1, 455.5, 714.4],
    ["310 Genet St.", 1, 475.8, 698.4],
    ["Scranton, PA 18505", 1, 443.4, 682.4],
    ["Phone (570) 800-7995", 1, 421.5, 666.4],
    ["This is not an invoice / No payment due", 1, 78.4, 576.8],
    ["CUSTOMER:", 1, 65.6, 534.4],
    ["Alta Via Pizzeria Bakery Square", 1, 65.6, 508.8],
    ["169-g Bakery Sq Blvd 6425 Penn Ave", 1, 65.6, 490.4],
    ["Pittsburgh, PA 15206", 1, 65.6, 474.4],
    ["ORDER #", 1, 501.8, 534.4],
    ["188736084", 1, 478.2, 516.8],
    ["ORDER DATE", 1, 481.7, 496],
    ["Aug 12, 2026", 1, 466.6, 478.4],
    ["PLCB Code", 1, 72, 431.4],
    ["Product Name", 1, 152, 431.4],
    ["Bottles", 1, 358.5, 431.4],
    ["Unit Price", 1, 411.1, 431.4],
    ["Gross Price", 1, 478.3, 431.4],
    ["644502", 1, 72, 400.5],
    ["Rocchina Prosecco Brut DOC 2020", 1, 152, 400.5],
    ["36", 1, 370.2, 400.5],
    ["$11.49", 1, 429.5, 400.5],
    ["$413.64", 1, 497.5, 400.5],
    ["Total Bottles: 36", 1, 65.6, 330.1],
    ["Total Boxes:", 1, 65.6, 302.9],
    ["3", 1, 153.8, 302.9],
    ["Taxable Amount:", 1, 318.8, 332.5],
    ["Tax:", 1, 318.8, 310.1],
    ["Freight:", 1, 318.8, 287.7],
    ["Direct Delivery Fee:", 1, 318.8, 265.3],
    ["$0.00", 1, 514.7, 265.3],
    ["Total:", 1, 318.8, 233.3],
    ["$514.60", 1, 495.5, 233.3],
    ["PROOF OF DELIVERY", 1, 235.8, 155.7],
    ["Because freight on Special Orders is not subject", 1, 65.6, 261.3],
    ["product price.", 1, 65.6, 235.7],
    ["Received By (Print Name)", 1, 65.6, 92.1],
    ["Date", 1, 273.3, 92.1],
    ["Signature", 1, 377.1, 92.1],
    ["Page 1 of 1", 1, 536, 41.7],
  ];

  const used = new Set<Item>();
  let worst = 0;
  const misses: string[] = [];
  for (const [text, page, x, y] of anchors) {
    const match = actual
      .filter((item) => item.str.trim() === text && item.page === page && !used.has(item))
      .sort(
        (a, b) => Math.abs(a.x - x) + Math.abs(a.y - y) - (Math.abs(b.x - x) + Math.abs(b.y - y)),
      )[0];
    if (!match) {
      misses.push(`missing ${text}`);
      continue;
    }
    used.add(match);
    const dx = Math.abs(match.x - x);
    const dy = Math.abs(match.y - y);
    worst = Math.max(worst, dx, dy);
    if (dx > 8 || dy > 2) misses.push(`${text} dx ${dx.toFixed(1)} dy ${dy.toFixed(1)}`);
  }
  console.log("alta via worst anchor delta", worst.toFixed(2), "pt");
  if (misses.length) throw new Error(`Layout drifted: ${misses.join("; ")}`);
  console.log("alta via layout ok");

  const longOrder: BolDocument = {
    ...altaVia,
    lines: Array.from({ length: 30 }, (_, index) => ({
      plcbCode: String(100000 + index),
      name: `Estate Bottling Reserve ${index + 1}`,
      bottles: 6,
      unitPrice: 12.5,
      grossPrice: 75,
    })),
    totalBottles: 180,
    totalBoxes: 15,
  };
  const longPdf = Buffer.from(await buildBillOfLadingPdf(longOrder));
  const longItems = await textItems(new Uint8Array(longPdf));
  assert(
    longItems.some((item) => item.str.startsWith("Page 2 of")),
    "a long product list should continue onto another page",
  );
  assert(
    longItems.some((item) => item.str === "Received By (Print Name)"),
    "signature labels missing from the long bill of lading",
  );
  console.log("long order paginates");
}

checkAlba()
  .then(() => checkAltaViaLayout())
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
