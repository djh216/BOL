import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { formatGeneratedAt, formatMoney } from "@/lib/format";
import type { BolDocument, OrderLine } from "@/lib/types";

const PAGE_W = 612;
const PAGE_H = 792;

const LEFT = 65.597;
const RIGHT = 546.403;
const CONTENT_BOTTOM = 704;

const WINE = rgb(76 / 255, 0, 19 / 255);
const SLATE = rgb(75 / 255, 85 / 255, 99 / 255);
const MUTED = rgb(107 / 255, 114 / 255, 128 / 255);
const INK = rgb(55 / 255, 65 / 255, 81 / 255);
const BANNER_TEXT = rgb(133 / 255, 77 / 255, 14 / 255);
const BANNER_BG = rgb(0.9960784, 0.9764706, 0.7647059);
const BANNER_BAR = rgb(0.9176471, 0.7019608, 0.03137255);
const RULE = rgb(0.8392157, 0.7607843, 0.7803922);
const SIGN_LINE = rgb(0.6117647, 0.6392157, 0.6862745);
const HEAD_BG = rgb(0.9764706, 0.9803922, 0.9843137);
const HEAD_TEXT = rgb(117 / 255, 87 / 255, 94 / 255);
const FOOTER = rgb(0.5, 0.5, 0.5);

const HEADER_TOP = 340.8477;
const CANON_DIVIDER = 427.5154;
const CANON_ROW_BASELINE = 391.5;

const CANON_TAIL = {
  taxable: 31.98,
  tax: 54.38,
  freight: 76.78,
  fee: 99.18,
  note1: 103.18,
  note2: 115.98,
  note3: 128.78,
  bottles: 34.38,
  boxes: 61.58,
  totalRule: 109.6,
  total: 131.18,
  fullRule: 174.4,
  proof: 208.78,
  lines: 258.4,
};

const COMPACT_TAIL = {
  taxable: 22,
  tax: 40,
  freight: 58,
  fee: 76,
  note1: 82,
  note2: 94.2,
  note3: 106.4,
  bottles: 24.2,
  boxes: 44,
  totalRule: 86,
  total: 104,
  fullRule: 128,
  proof: 152,
  lines: 186,
};

const FREIGHT_NOTE = [
  "Because freight on Special Orders is not subject",
  "to sales tax, it is broken out separately from the",
  "product price.",
];

type Fonts = {
  regular: PDFFont;
  medium: PDFFont;
  semibold: PDFFont;
  bold: PDFFont;
};

type MeasuredRow = {
  line: OrderLine;
  nameLines: string[];
  height: number;
};

type Tail = typeof CANON_TAIL;

function mixTail(t: number): Tail {
  const mixed = { ...CANON_TAIL };
  const keys = Object.keys(CANON_TAIL) as (keyof Tail)[];
  for (const key of keys) {
    mixed[key] = CANON_TAIL[key] + (COMPACT_TAIL[key] - CANON_TAIL[key]) * t;
  }
  return mixed;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function drawText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  baselineFromTop: number,
  color: RGB,
) {
  page.drawText(text, {
    x,
    y: PAGE_H - baselineFromTop,
    size,
    font,
    color,
  });
}

function drawRight(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  right: number,
  baselineFromTop: number,
  color: RGB,
) {
  const width = font.widthOfTextAtSize(text, size);
  drawText(page, text, font, size, right - width, baselineFromTop, color);
}

function drawCenter(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  baselineFromTop: number,
  color: RGB,
  targetWidth?: number,
) {
  const natural = font.widthOfTextAtSize(text, size);
  const width = targetWidth ?? natural;
  const extra = (width - natural) / Math.max(text.length - 1, 1);
  let x = (PAGE_W - width) / 2;
  if (!targetWidth || Math.abs(extra) < 0.05) {
    drawText(page, text, font, size, (PAGE_W - natural) / 2, baselineFromTop, color);
    return;
  }
  for (const character of text) {
    const characterWidth = font.widthOfTextAtSize(character, size);
    drawText(page, character, font, size, x, baselineFromTop, color);
    x += characterWidth + extra;
  }
}

function drawRule(page: PDFPage, x: number, top: number, width: number, color: RGB = RULE) {
  page.drawRectangle({
    x,
    y: PAGE_H - top - 0.8,
    width,
    height: 0.8,
    color,
  });
}

let assetPromise: Promise<{ regular: Buffer; medium: Buffer; semibold: Buffer; bold: Buffer; logo: Buffer }> | null =
  null;

function loadAssets() {
  if (!assetPromise) {
    const fonts = path.join(process.cwd(), "public", "fonts");
    const read = (name: string) => readFile(path.join(fonts, name));
    assetPromise = Promise.all([
      read("Inter-Regular.ttf"),
      read("Inter-Medium.ttf"),
      read("Inter-SemiBold.ttf"),
      read("Inter-Bold.ttf"),
      readFile(path.join(process.cwd(), "public", "brand", "magnotta-logo.png")),
    ]).then(([regular, medium, semibold, bold, logo]) => ({
      regular,
      medium,
      semibold,
      bold,
      logo,
    }));
  }
  return assetPromise;
}

function drawFooter(page: PDFPage, font: PDFFont, pageNumber: number, pageCount: number, stamp: string) {
  drawRight(page, stamp, font, 7, 571, 742, FOOTER);
  drawRight(page, `Page ${pageNumber} of ${pageCount}`, font, 7, 571, 750.3, FOOTER);
}

function drawLetterhead(
  page: PDFPage,
  fonts: Fonts,
  logo: Awaited<ReturnType<PDFDocument["embedPng"]>>,
  doc: BolDocument,
) {
  page.drawImage(logo, {
    x: 65.597,
    y: PAGE_H - 65.644 - 57.601,
    width: 160.002,
    height: 57.601,
  });

  const company = [
    { text: "F. Magnotta, LLC", font: fonts.semibold, color: WINE, baseline: 77.6 },
    { text: "310 Genet St.", font: fonts.regular, color: SLATE, baseline: 93.6 },
    { text: "Scranton, PA 18505", font: fonts.regular, color: SLATE, baseline: 109.6 },
    { text: "Phone (570) 800-7995", font: fonts.bold, color: SLATE, baseline: 125.6 },
  ];
  for (const line of company) {
    drawRight(page, line.text, line.font, 11.2, RIGHT, line.baseline, line.color);
  }

  drawCenter(page, "BILL OF LADING", fonts.bold, 19.2, 168.8, WINE, 160.9);

  page.drawRectangle({
    x: LEFT,
    y: PAGE_H - 193.646 - 35.2,
    width: RIGHT - LEFT,
    height: 35.2,
    color: BANNER_BG,
  });
  page.drawRectangle({
    x: LEFT,
    y: PAGE_H - 193.646 - 35.2,
    width: 3.2,
    height: 35.2,
    color: BANNER_BAR,
  });
  drawText(
    page,
    "This is not an invoice / No payment due",
    fonts.bold,
    11.2,
    78.4,
    215.2,
    BANNER_TEXT,
  );

  drawText(page, "CUSTOMER:", fonts.semibold, 9.6, LEFT, 257.6, MUTED);
  drawRight(page, "ORDER #", fonts.semibold, 9.6, RIGHT, 257.6, MUTED);
  drawRight(page, doc.orderNumber, fonts.regular, 12.8, RIGHT, 275.2, WINE);
  drawRight(page, "ORDER DATE", fonts.semibold, 9.6, RIGHT, 296, MUTED);
  drawRight(page, doc.orderDate, fonts.regular, 12.8, RIGHT, 313.6, WINE);
}

function customerBlock(doc: BolDocument, fonts: Fonts): { headerTop: number; nameLines: string[]; streetLines: string[]; cityLines: string[] } {
  const nameLines = wrapText(doc.restaurantName, fonts.bold, 14.4, 370);
  const streetLines = doc.street ? wrapText(doc.street, fonts.regular, 11.2, 370) : [];
  const cityLines = doc.cityLine ? wrapText(doc.cityLine, fonts.regular, 11.2, 370) : [];
  const single =
    nameLines.length === 1 && streetLines.length <= 1 && cityLines.length <= 1;
  if (single) return { headerTop: HEADER_TOP, nameLines, streetLines, cityLines };

  let cursor = 283.2 + nameLines.length * 18;
  cursor = Math.max(cursor, 301.6);
  cursor += streetLines.length * 16;
  cursor += Math.max(cityLines.length, 1) * 16;
  const headerTop = Math.max(HEADER_TOP, cursor + 7);
  return { headerTop, nameLines, streetLines, cityLines };
}

function drawCustomer(
  page: PDFPage,
  fonts: Fonts,
  nameLines: string[],
  streetLines: string[],
  cityLines: string[],
) {
  const single =
    nameLines.length === 1 && streetLines.length <= 1 && cityLines.length <= 1;
  if (single) {
    drawText(page, nameLines[0] ?? "", fonts.bold, 14.4, LEFT, 283.2, WINE);
    if (streetLines[0]) drawText(page, streetLines[0], fonts.regular, 11.2, LEFT, 301.6, INK);
    if (cityLines[0]) drawText(page, cityLines[0], fonts.regular, 11.2, LEFT, 317.6, INK);
    return;
  }

  let baseline = 283.2;
  for (const line of nameLines) {
    drawText(page, line, fonts.bold, 14.4, LEFT, baseline, WINE);
    baseline += 18;
  }
  baseline = Math.max(baseline, 301.6);
  for (const line of streetLines) {
    drawText(page, line, fonts.regular, 11.2, LEFT, baseline, INK);
    baseline += 16;
  }
  for (const line of cityLines) {
    drawText(page, line, fonts.regular, 11.2, LEFT, baseline, INK);
    baseline += 16;
  }
}

function measureRows(lines: OrderLine[], fonts: Fonts): MeasuredRow[] {
  return lines.map((line) => {
    const nameLines = wrapText(line.name, fonts.medium, 11.2, 190);
    const height = nameLines.length === 1 ? 24 : 10 + nameLines.length * 13.6;
    return { line, nameLines, height };
  });
}

function drawTableHeader(page: PDFPage, fonts: Fonts, top: number) {
  page.drawRectangle({
    x: LEFT,
    y: PAGE_H - top - 32,
    width: RIGHT - LEFT,
    height: 32,
    color: HEAD_BG,
  });
  const baseline = top + 19.75;
  drawText(page, "PLCB Code", fonts.medium, 11.2, 72, baseline, HEAD_TEXT);
  drawText(page, "Product Name", fonts.medium, 11.2, 152, baseline, HEAD_TEXT);
  const bottles = "Bottles";
  const bottlesWidth = fonts.medium.widthOfTextAtSize(bottles, 11.2);
  drawText(page, bottles, fonts.medium, 11.2, 377.15 - bottlesWidth / 2, baseline, HEAD_TEXT);
  drawRight(page, "Unit Price", fonts.medium, 11.2, 463.25, baseline, HEAD_TEXT);
  drawRight(page, "Gross Price", fonts.medium, 11.2, 540, baseline, HEAD_TEXT);
  drawRule(page, LEFT, top + 31.2, RIGHT - LEFT);
}

function drawRows(page: PDFPage, fonts: Fonts, rows: MeasuredRow[], firstBaseline: number, canonical: boolean) {
  let baseline = firstBaseline;
  for (const row of rows) {
    const codeSize = fonts.regular.widthOfTextAtSize(row.line.plcbCode, 11.2) > 68 ? 9.5 : 11.2;
    drawText(page, row.line.plcbCode, fonts.regular, codeSize, 72, baseline, WINE);
    row.nameLines.forEach((nameLine, index) => {
      drawText(page, nameLine, fonts.medium, 11.2, 152, baseline + index * 13.6, WINE);
    });
    const bottles = String(row.line.bottles);
    const bottlesWidth = fonts.regular.widthOfTextAtSize(bottles, 11.2);
    drawText(page, bottles, fonts.regular, 11.2, 377.15 - bottlesWidth / 2, baseline, WINE);
    drawRight(page, formatMoney(row.line.unitPrice), fonts.regular, 11.2, 463.25, baseline, WINE);
    drawRight(page, formatMoney(row.line.grossPrice), fonts.regular, 11.2, 540, baseline, WINE);
    baseline += canonical ? 24 : row.height;
  }
}

function drawTail(page: PDFPage, fonts: Fonts, doc: BolDocument, dividerTop: number, tail: Tail) {
  const at = (offset: number) => dividerTop + offset;
  drawText(page, `Total Bottles: ${doc.totalBottles}`, fonts.semibold, 12.8, LEFT, at(tail.bottles), WINE);
  const bottlesPrefix = fonts.semibold.widthOfTextAtSize(`Total Bottles: `, 12.8);
  drawText(page, "Total Boxes:", fonts.semibold, 12.8, LEFT, at(tail.boxes), WINE);
  drawText(
    page,
    String(doc.totalBoxes),
    fonts.semibold,
    12.8,
    LEFT + bottlesPrefix,
    at(tail.boxes),
    WINE,
  );

  FREIGHT_NOTE.forEach((line, index) => {
    const key = (`note${index + 1}`) as "note1" | "note2" | "note3";
    drawText(page, line, fonts.regular, 9.6, LEFT, at(tail[key]), MUTED);
  });

  const moneyRows: [string, number, keyof Tail][] = [
    ["Taxable Amount:", doc.taxableAmount, "taxable"],
    ["Tax:", doc.tax, "tax"],
    ["Freight:", doc.freight, "freight"],
    ["Direct Delivery Fee:", doc.directDeliveryFee, "fee"],
  ];
  for (const [label, amount, key] of moneyRows) {
    drawText(page, label, fonts.regular, 11.2, 318.8, at(tail[key]), SLATE);
    drawRight(page, formatMoney(amount), fonts.medium, 11.2, RIGHT, at(tail[key]), WINE);
  }

  drawRule(page, 318.93, at(tail.totalRule), RIGHT - 318.93);
  drawText(page, "Total:", fonts.bold, 12.8, 318.8, at(tail.total), WINE);
  drawRight(page, formatMoney(doc.total), fonts.bold, 12.8, RIGHT, at(tail.total), WINE);

  drawRule(page, LEFT, at(tail.fullRule), RIGHT - LEFT);
  drawCenter(page, "PROOF OF DELIVERY", fonts.semibold, 12.8, at(tail.proof), WINE, 139.8);

  const lineTop = at(tail.lines);
  const segments: [number, number][] = [
    [65.597, 169.336],
    [273.333, 65.334],
    [377.068, 169.335],
  ];
  for (const [x, width] of segments) {
    page.drawRectangle({
      x,
      y: PAGE_H - lineTop - 0.8,
      width,
      height: 0.8,
      color: SIGN_LINE,
    });
  }
}

function drawSignatureLabels(page: PDFPage, fonts: Fonts) {
  drawText(page, "Received By (Print Name)", fonts.semibold, 9.6, 65.6, 54.4, SLATE);
  drawText(page, "Date", fonts.semibold, 9.6, 273.3, 54.4, SLATE);
  drawText(page, "Signature", fonts.semibold, 9.6, 377.1, 54.4, SLATE);
}

function continuationBanner(page: PDFPage, fonts: Fonts, doc: BolDocument) {
  drawText(page, doc.restaurantName, fonts.bold, 12, LEFT, 40, WINE);
  drawRight(page, `Order ${doc.orderNumber}`, fonts.regular, 11, RIGHT, 40, WINE);
}

type ContentSlice = {
  rows: MeasuredRow[];
  headerTop: number;
  firstBaseline: number;
  dividerTop: number;
  includeTail: boolean;
  canonical: boolean;
  continued: boolean;
};

function planContent(rows: MeasuredRow[], headerTop: number): { slices: ContentSlice[]; tail: Tail } {
  const canonical = rows.length === 1 && rows[0].nameLines.length === 1;
  const rowsHeight = canonical ? 0 : rows.reduce((sum, row) => sum + row.height, 0);
  const naturalDivider = canonical ? CANON_DIVIDER + (headerTop - HEADER_TOP) : headerTop + 32 + rowsHeight + 8;

  let tail = CANON_TAIL;
  let t = 0;
  while (naturalDivider + tail.lines > CONTENT_BOTTOM && t < 1) {
    t = Math.min(1, t + 0.05);
    tail = mixTail(t);
  }

  const tailFits = naturalDivider + tail.lines <= CONTENT_BOTTOM + 2;
  if (tailFits) {
    const firstBaseline = canonical ? CANON_ROW_BASELINE + (headerTop - HEADER_TOP) : headerTop + 32 + 16;
    return {
      tail,
      slices: [
        {
          rows,
          headerTop,
          firstBaseline,
          dividerTop: naturalDivider,
          includeTail: true,
          canonical,
          continued: false,
        },
      ],
    };
  }

  const slices: ContentSlice[] = [];
  let index = 0;
  let continued = false;
  while (index < rows.length) {
    const top = continued ? 72 : headerTop;
    const bodyTop = top + 32;
    const taken: MeasuredRow[] = [];
    let used = 0;
    while (index < rows.length) {
      const row = rows[index];
      const limit = CONTENT_BOTTOM - 36;
      if (taken.length > 0 && bodyTop + used + row.height > limit) break;
      taken.push(row);
      used += row.height;
      index += 1;
    }
    const last = index >= rows.length;
    const dividerTop = bodyTop + used + 8;
    const roomForTail = dividerTop + COMPACT_TAIL.lines <= CONTENT_BOTTOM;
    slices.push({
      rows: taken,
      headerTop: top,
      firstBaseline: bodyTop + 16,
      dividerTop,
      includeTail: last && roomForTail,
      canonical: false,
      continued,
    });
    continued = true;
    if (slices.length > 12) break;
  }

  const lastSlice = slices[slices.length - 1];
  if (lastSlice && !lastSlice.includeTail) {
    slices.push({
      rows: [],
      headerTop: 72,
      firstBaseline: 120,
      dividerTop: 96,
      includeTail: true,
      canonical: false,
      continued: true,
    });
  }

  return { slices, tail: COMPACT_TAIL };
}

export async function buildBillOfLadingPdf(
  doc: BolDocument,
  generatedAt = new Date(),
): Promise<Uint8Array> {
  const assets = await loadAssets();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts: Fonts = {
    regular: await pdf.embedFont(assets.regular, { subset: true }),
    medium: await pdf.embedFont(assets.medium, { subset: true }),
    semibold: await pdf.embedFont(assets.semibold, { subset: true }),
    bold: await pdf.embedFont(assets.bold, { subset: true }),
  };
  const logo = await pdf.embedPng(assets.logo);
  const stamp = formatGeneratedAt(generatedAt);
  const rows = measureRows(doc.lines, fonts);
  const block = customerBlock(doc, fonts);
  const plan = planContent(rows, block.headerTop);
  const pageCount = plan.slices.length + 1;

  pdf.setTitle(`Bill of Lading - ${doc.restaurantName}`);
  pdf.setAuthor("F. Magnotta, LLC");
  pdf.setSubject(`Order ${doc.orderNumber}`);
  pdf.setCreator("F. Magnotta bill of lading");

  plan.slices.forEach((slice, index) => {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    if (!slice.continued) {
      drawLetterhead(page, fonts, logo, doc);
      drawCustomer(page, fonts, block.nameLines, block.streetLines, block.cityLines);
    } else {
      continuationBanner(page, fonts, doc);
    }

    if (slice.rows.length > 0) {
      drawTableHeader(page, fonts, slice.headerTop);
      drawRows(page, fonts, slice.rows, slice.firstBaseline, slice.canonical);
      if (!slice.includeTail) drawRule(page, LEFT, slice.dividerTop, RIGHT - LEFT);
    }

    if (slice.includeTail) {
      drawRule(page, LEFT, slice.dividerTop, RIGHT - LEFT);
      drawTail(page, fonts, doc, slice.dividerTop, plan.tail);
    }

    drawFooter(page, fonts.regular, index + 1, pageCount, stamp);
  });

  const labelPage = pdf.addPage([PAGE_W, PAGE_H]);
  drawSignatureLabels(labelPage, fonts);
  drawFooter(labelPage, fonts.regular, pageCount, pageCount, stamp);

  return pdf.save();
}
