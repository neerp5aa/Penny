import type { Metadata, Viewport } from "next";
import { PreferencesProvider, PREFERENCES_BOOT_SCRIPT } from "@/components/penny/preferences";
import "./globals.css";

export const metadata: Metadata = {
  title: "Penny — make money make sense",
  description: "A fictional personal finance learning demo for Canadian students.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1714" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The boot script sets data-theme/data-density before hydration, so React must not
    // treat those attributes as a mismatch.
    <html lang="en-CA" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_BOOT_SCRIPT }} />
      </head>
      <body>
        <PreferencesProvider>{children}</PreferencesProvider>
      </body>
    </html>
  );
}
