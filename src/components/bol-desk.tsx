"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp, LoaderCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { billFileName, formatMoney } from "@/lib/format";
import type { ParsedOrder } from "@/lib/types";
import { cn } from "cn";

type Status = "idle" | "working" | "ready" | "error";

type PrintedFields = {
  restaurantName: string;
  street: string;
  cityLine: string;
  totalBoxes: string;
};

export function BolDesk() {
  const [restaurantName, setRestaurantName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [order, setOrder] = useState<ParsedOrder | null>(null);
  const [street, setStreet] = useState("");
  const [cityLine, setCityLine] = useState("");
  const [totalBoxes, setTotalBoxes] = useState("0");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [previewPending, setPreviewPending] = useState(false);
  const [printed, setPrinted] = useState<PrintedFields | null>(null);
  const requestId = useRef(0);

  const filename = useMemo(() => {
    if (!order) return "bill-of-lading.pdf";
    return billFileName(printed?.restaurantName || restaurantName || "Restaurant", order.orderNumber);
  }, [order, printed, restaurantName]);

  const fieldsChanged =
    printed !== null &&
    (printed.restaurantName !== restaurantName.trim() ||
      printed.street !== street.trim() ||
      printed.cityLine !== cityLine.trim() ||
      printed.totalBoxes !== totalBoxes);

  function takeFile(next: File | null) {
    if (!next) return;
    const isPdf = next.type === "application/pdf" || next.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError("Upload the order confirmation as a PDF.");
      setStatus("error");
      return;
    }
    setFile(next);
    setError("");
    if (status === "error") setStatus("idle");
  }

  async function generate(source = file, name = restaurantName) {
    if (!source) {
      setError("Upload an order confirmation PDF.");
      setStatus("error");
      return;
    }
    if (!name.trim()) {
      setError("Type the restaurant name. It is printed as the customer on the bill of lading.");
      setStatus("error");
      return;
    }

    setStatus("working");
    setError("");
    try {
      const form = new FormData();
      form.set("file", source);
      const parsedResponse = await fetch("/api/parse", { method: "POST", body: form });
      const parsedBody = (await parsedResponse.json()) as ParsedOrder & { error?: string };
      if (!parsedResponse.ok) {
        throw new Error(parsedBody.error || "The order confirmation could not be read.");
      }
      const printedFields = {
        restaurantName: name.trim(),
        street: parsedBody.street.trim(),
        cityLine: parsedBody.cityLine.trim(),
        totalBoxes: String(parsedBody.totalBoxes),
      };
      setOrder(parsedBody);
      setStreet(parsedBody.street);
      setCityLine(parsedBody.cityLine);
      setTotalBoxes(printedFields.totalBoxes);
      await renderPdf({
        order: parsedBody,
        restaurantName: printedFields.restaurantName,
        street: printedFields.street,
        cityLine: printedFields.cityLine,
        totalBoxes: parsedBody.totalBoxes,
      });
      setPrinted(printedFields);
      setStatus("ready");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "The order confirmation could not be read.");
    }
  }

  async function renderPdf(input: {
    order: ParsedOrder;
    restaurantName: string;
    street: string;
    cityLine: string;
    totalBoxes: number;
  }) {
    const id = ++requestId.current;
    setPreviewPending(true);
    try {
      const response = await fetch("/api/bol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantName: input.restaurantName,
          street: input.street,
          cityLine: input.cityLine,
          orderNumber: input.order.orderNumber,
          orderDate: input.order.orderDate,
          lines: input.order.lines,
          totalBottles: input.order.totalBottles,
          totalBoxes: input.totalBoxes,
          taxableAmount: input.order.taxableAmount,
          tax: input.order.tax,
          freight: input.order.freight,
          directDeliveryFee: 0,
          total: input.order.orderTotal,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "The bill of lading could not be created.");
      }
      const blob = await response.blob();
      if (id !== requestId.current) return;
      const url = URL.createObjectURL(blob);
      setPdfUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return url;
      });
    } finally {
      if (id === requestId.current) setPreviewPending(false);
    }
  }

  async function updateBol() {
    if (!order) return;
    const boxes = Number(totalBoxes);
    if (!restaurantName.trim()) {
      setError("Type the restaurant name. It is printed as the customer on the bill of lading.");
      setStatus("error");
      return;
    }
    if (!street.trim()) {
      setError("Enter the street address for the bill of lading.");
      setStatus("error");
      return;
    }
    if (totalBoxes === "" || !Number.isInteger(boxes) || boxes < 0) {
      setError("Enter the number of boxes for this delivery.");
      setStatus("error");
      return;
    }

    const printedFields = {
      restaurantName: restaurantName.trim(),
      street: street.trim(),
      cityLine: cityLine.trim(),
      totalBoxes,
    };
    setError("");
    try {
      await renderPdf({
        order,
        restaurantName: printedFields.restaurantName,
        street: printedFields.street,
        cityLine: printedFields.cityLine,
        totalBoxes: boxes,
      });
      setPrinted(printedFields);
      setStatus("ready");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "The bill of lading could not be updated.");
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] lg:items-start">
      <Card className="bg-[#fffdf8] shadow-sm ring-[#e6d9cc]">
        <CardHeader>
          <CardTitle className="text-[#4c0013]">Order confirmation</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void generate();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="restaurant">Restaurant name</Label>
              <Input
                id="restaurant"
                value={restaurantName}
                onChange={(event) => setRestaurantName(event.target.value)}
                placeholder="Restaurant Name"
                autoComplete="organization"
                className="h-10 bg-white"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmation">Order confirmation PDF</Label>
              <label
                htmlFor="confirmation"
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(false);
                  takeFile(event.dataTransfer.files?.[0] ?? null);
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
                  dragOver
                    ? "border-[#4c0013] bg-[#f8ecd4]"
                    : "border-[#e0d3c4] bg-[#fffcf7] hover:border-[#4c0013]/50",
                )}
              >
                <FileUp className="size-5 text-[#4c0013]" aria-hidden />
                <span className="text-sm font-medium text-[#2c2422]">
                  {file ? file.name : "Drop the PDF here, or browse"}
                </span>
                <span className="text-xs text-[#6d625c]">
                  {file
                    ? `${Math.max(1, Math.round(file.size / 1024))} KB`
                    : "The same confirmation the licensee receives"}
                </span>
                <input
                  id="confirmation"
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(event) => takeFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            {error ? (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              variant="outline"
              className="h-10 bg-white"
              disabled={status === "working"}
            >
              {status === "working" ? <LoaderCircle className="animate-spin" /> : null}
              Generate BOL
            </Button>
          </form>

          {order ? (
            <div className="mt-6 flex flex-col gap-4 border-t border-[#eadfce] pt-5">
              <div>
                <h2 className="text-sm font-semibold text-[#4c0013]">Ship to</h2>
                <p className="mt-1 text-xs leading-5 text-[#6d625c]">
                  Taken from the confirmation. Change the restaurant name, address, or box count,
                  then choose Update BOL to reprint the bill.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="street">Street</Label>
                <Input
                  id="street"
                  value={street}
                  onChange={(event) => setStreet(event.target.value)}
                  className="h-10 bg-white"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="city">City, state, ZIP</Label>
                <Input
                  id="city"
                  value={cityLine}
                  onChange={(event) => setCityLine(event.target.value)}
                  className="h-10 bg-white"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="boxes">Total boxes</Label>
                <Input
                  id="boxes"
                  inputMode="numeric"
                  value={totalBoxes}
                  onChange={(event) => setTotalBoxes(event.target.value.replace(/[^\d]/g, ""))}
                  className="h-10 bg-white"
                />
                <p className="text-xs leading-5 text-[#6d625c]">
                  One box is a case of 12 bottles, rounded up from {order.totalBottles} bottles.
                  Change it if this order ships in a different number of boxes.
                </p>
              </div>
              {fieldsChanged ? (
                <Button
                  type="button"
                  className="h-10"
                  disabled={previewPending}
                  onClick={() => void updateBol()}
                >
                  {previewPending ? <LoaderCircle className="animate-spin" /> : null}
                  Update BOL
                </Button>
              ) : null}

              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs text-[#6d625c]">Order</dt>
                  <dd className="font-medium">{order.orderNumber}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#6d625c]">Order date</dt>
                  <dd className="font-medium">{order.orderDate}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#6d625c]">Bottles</dt>
                  <dd className="font-medium">{order.totalBottles}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#6d625c]">Order total</dt>
                  <dd className="font-medium">{formatMoney(order.orderTotal)}</dd>
                </div>
              </dl>

              <div className="overflow-hidden rounded-lg ring-1 ring-[#eadfce]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#f7f3ec] text-xs text-[#75575e]">
                    <tr>
                      <th className="px-2 py-2 font-medium">Product</th>
                      <th className="px-2 py-2 text-right font-medium">Bottles</th>
                      <th className="px-2 py-2 text-right font-medium">Gross</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lines.map((line) => (
                      <tr key={line.plcbCode} className="border-t border-[#f0e6da]">
                        <td className="px-2 py-2">
                          <div className="font-medium text-[#4c0013]">{line.name}</div>
                          <div className="text-xs text-[#6d625c]">
                            {line.plcbCode} · {formatMoney(line.unitPrice)}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{line.bottles}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatMoney(line.grossPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
                <dt className="text-[#6d625c]">Taxable amount</dt>
                <dd className="text-right tabular-nums">{formatMoney(order.taxableAmount)}</dd>
                <dt className="text-[#6d625c]">Tax</dt>
                <dd className="text-right tabular-nums">{formatMoney(order.tax)}</dd>
                <dt className="text-[#6d625c]">Freight</dt>
                <dd className="text-right tabular-nums">{formatMoney(order.freight)}</dd>
                <dt className="text-[#6d625c]">Direct delivery fee</dt>
                <dd className="text-right tabular-nums">{formatMoney(0)}</dd>
                <dt className="pt-1 font-semibold text-[#4c0013]">Total</dt>
                <dd className="pt-1 text-right font-semibold tabular-nums text-[#4c0013]">
                  {formatMoney(order.orderTotal)}
                </dd>
              </dl>

              {order.warnings.length > 0 ? (
                <div className="rounded-lg bg-[#f8ecd4] px-3 py-2 text-sm text-[#854d0e]">
                  {order.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <section className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#4c0013]">Bill of lading</h2>
          </div>
          {pdfUrl ? (
            <a className={cn(buttonVariants(), "h-10 px-3")} href={pdfUrl} download={filename}>
              Download PDF
            </a>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-xl bg-[#e7e0d6] p-3 shadow-inner ring-1 ring-[#e0d4c6]">
          {pdfUrl ? (
            <iframe
              title="Bill of lading preview"
              src={pdfUrl}
              className="h-[min(1180px,82vh)] w-full rounded-md bg-white"
            />
          ) : (
            <div className="flex h-[520px] flex-col items-center justify-center gap-3 bg-white px-8 text-center">
              {status === "working" || previewPending ? (
                <LoaderCircle className="size-6 animate-spin text-[#4c0013]" />
              ) : null}
              <p className="max-w-sm text-sm leading-6 text-[#6d625c]">
                {status === "working"
                  ? "Reading the confirmation and laying out the bill of lading."
                  : "The finished bill of lading shows up here. It uses the F. Magnotta letterhead, the restaurant name you typed, and the figures from the confirmation."}
              </p>
            </div>
          )}
        </div>
        {previewPending && pdfUrl ? (
          <p className="text-xs text-[#6d625c]">Updating the preview…</p>
        ) : null}
      </section>
    </div>
  );
}
