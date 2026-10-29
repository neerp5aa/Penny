import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Penny — make money make sense",
  description: "A fictional personal finance learning demo for Canadian students.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-CA">
      <body>{children}</body>
    </html>
  );
}
