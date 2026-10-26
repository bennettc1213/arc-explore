"use client";

import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

const format = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * A number that counts up from zero the first time it comes into view.
 *
 * **The real number is what the server renders.** Crawlers, screen readers and
 * anyone without JavaScript get the true figure in the HTML; the count is a
 * client-side flourish over it, written straight to `textContent` so it costs
 * no React re-render per frame.
 *
 * **It never snaps a real number back to zero in front of someone.** If the
 * figure is already on screen and fully opaque by the time this hydrates — a
 * slow phone, where the page painted long before the JavaScript arrived — the
 * count is skipped and the number stays put. Watching "1,303" become "0" and
 * climb back is worse than no animation. The landing page fades its stats in,
 * so on a normal load hydration wins that race and the count plays.
 *
 * Triggers slightly *before* the number enters the viewport (positive bottom
 * margin), so a figure below the fold resets to zero while still off-screen
 * and is counting as it scrolls into view.
 */
export function CountUp({
  value,
  duration = 1.6,
  delay = 0,
  className,
}: {
  value: number;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px 15% 0px" });
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || !inView || reduce || value <= 0) return;
    if (alreadySeen(node)) return;

    node.textContent = format(0);
    const controls = animate(0, value, {
      duration,
      delay,
      ease: [0.22, 1, 0.36, 1], // --ease-out
      onUpdate: (v) => {
        node.textContent = format(v);
      },
    });
    return () => {
      controls.stop();
      node.textContent = format(value);
    };
  }, [inView, reduce, value, duration, delay]);

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {format(value)}
    </span>
  );
}

/** On screen and effectively fully opaque, i.e. a visitor may have read it. */
function alreadySeen(node: HTMLElement): boolean {
  const rect = node.getBoundingClientRect();
  const onScreen = rect.bottom > 0 && rect.top < window.innerHeight;
  if (!onScreen) return false;
  let opacity = 1;
  for (let el: HTMLElement | null = node; el && el !== document.body; el = el.parentElement) {
    opacity *= Number(getComputedStyle(el).opacity);
  }
  return opacity > 0.9;
}
