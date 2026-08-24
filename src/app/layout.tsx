import type { Metadata } from "next";

// Fonts are self-hosted via @fontsource in globals.css — no Google Fonts
// network call, per the design system's stack notes.
import "./globals.css";

import { Chrome } from "@/components/chrome/Chrome";
import { Footer } from "@/components/chrome/Footer";
import { Nav } from "@/components/chrome/Nav";

export const metadata: Metadata = {
  title: "Instela",
  description:
    "Instela helps students find internships and scholarships, prepare applications, and keep track of what they have sent.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <Chrome />
        <Nav />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
