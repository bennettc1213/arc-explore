"use client";

import { MagneticCursor } from "@/components/ui/magnetic-cursor";
import { usePathname } from "next/navigation";

export function CustomCursor() {
  const pathname = usePathname();
  if (pathname === "/dev/cursor") return null;
  return (
    <MagneticCursor magneticFactor={0.1} hoverPadding={5}>
      {null}
    </MagneticCursor>
  );
}
