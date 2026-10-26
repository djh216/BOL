import { ParseError, parseOrderConfirmation } from "@/lib/parse-order";

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Upload the order confirmation PDF." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Upload the order confirmation PDF." }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "That PDF is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "That PDF is larger than 12 MB." }, { status: 400 });
  }
  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "Upload a PDF order confirmation." }, { status: 400 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const order = await parseOrderConfirmation(bytes);
    return Response.json(order);
  } catch (error) {
    const message =
      error instanceof ParseError
        ? error.message
        : "The order confirmation could not be read.";
    return Response.json({ error: message }, { status: 422 });
  }
}
