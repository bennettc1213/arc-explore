"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

export function DiscoveryPreferences({ children, activeCount }: { children: ReactNode; activeCount: number }) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function outside(event: PointerEvent) { if (details.current?.open && !details.current.contains(event.target as Node)) details.current.open = false; }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && details.current?.open) { details.current.open = false; details.current.querySelector("summary")?.focus(); }
    }
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  return <details ref={details} className="discovery-preferences-popover"><summary><Icon name="filter" size={16} />Filters & preferences{activeCount > 0 && <span>{activeCount}</span>}<Icon name="chevron" size={13} /></summary><div className="discovery-preferences-panel">{children}</div></details>;
}
