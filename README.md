# Bill of lading

Turn a special-order confirmation into an F. Magnotta bill of lading.

Type the restaurant name, upload the order confirmation PDF, and download a two-page letter-size bill of lading. The form matches the Magnotta bill of lading: letterhead, customer and order block, PLCB product table, tax and freight, proof-of-delivery lines, and a signature page.

The confirmation supplies the ship-to address, order number, order date, product codes, bottle counts, prices, tax, and freight. The restaurant name is typed in, because the confirmation does not include it. Direct delivery fee prints as $0.00. Total boxes starts at one case per 12 bottles, rounded up, and can be changed before download.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4327](http://127.0.0.1:4327).

`npm test` checks the bundled Alba confirmation and compares a generated Alta Via bill of lading against the sample PDF.

Sample files:

- `public/samples/alba-order-confirmation.pdf`
- `public/samples/alta-via-bill-of-lading.pdf`
