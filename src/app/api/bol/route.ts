import { buildBillOfLadingPdf } from "@/lib/bol-pdf";
import { documentFromPayload } from "@/lib/document";
import { billFileName } from "@/lib/format";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "The bill of lading details are missing." }, { status: 400 });
  }

  try {
    const document = documentFromPayload(payload);
    const pdf = await buildBillOfLadingPdf(document);
    const filename = billFileName(document.restaurantName, document.orderNumber);
    const ascii = filename.replace(/[^\x20-\x7e]/g, "");
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The bill of lading could not be created.";
    return Response.json({ error: message }, { status: 422 });
  }
}
