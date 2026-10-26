import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Bill of lading · F. Magnotta",
  description:
    "Turn a special-order confirmation into an F. Magnotta bill of lading. Type the restaurant name and upload the PDF.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#f3efe7] text-[#2c2422]">
        <header className="border-b border-[#e6d9cc] bg-[#fffdf8]">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/magnotta-logo.png"
              alt="F. Magnotta, importer and distributor of fine wines"
              className="h-14 w-auto"
            />
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[#8a6a4f]">
                F. MAGNOTTA LLC
              </p>
              <h1 className="text-xl font-semibold tracking-tight text-[#4c0013] sm:text-2xl">
                Bill of Lading Generator
              </h1>
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
