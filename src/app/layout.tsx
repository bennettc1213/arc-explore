import type { Metadata } from "next";

// Fonts are self-hosted via @fontsource in globals.css — no Google Fonts
// network call, per the design system's stack notes.
import "./globals.css";
import "./remodel.css";

import { Chrome } from "@/components/chrome/Chrome";
import { Frame } from "@/components/chrome/Frame";

export const metadata: Metadata = {
  title: "Instela | Find scholarships and internships",
  description:
    "Instela helps students find internships and scholarships, prepare applications, and keep track of what they have sent.",
  icons: {
    icon: "/instela-mark.svg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <Chrome />
        <Frame>{children}</Frame>
      </body>
    </html>
  );
}
