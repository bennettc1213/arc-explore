"use client";

import { useEffect, useRef, type FC, type ReactNode } from "react";
import gsap from "gsap";

import { useMedia, useReducedMotion } from "@/components/chrome/hooks";

interface MagneticCursorProps {
  children: ReactNode;
  magneticFactor?: number;
  hoverPadding?: number;
  cursorSize?: number;
  cursorColor?: string;
  blendMode?: "difference" | "exclusion" | "normal" | "screen" | "overlay";
  cursorClassName?: string;
  disableOnTouch?: boolean;
  /** Controls that receive the effect. The app intentionally limits this to buttons. */
  targetSelector?: string;
}

/** A magnetic treatment for buttons, not a replacement for the pointer. */
export const MagneticCursor: FC<MagneticCursorProps> = ({
  children,
  magneticFactor = 0.12,
  hoverPadding = 6,
  cursorSize = 24,
  cursorColor = "white",
  blendMode = "exclusion",
  cursorClassName = "",
  disableOnTouch = true,
  targetSelector = "button, .btn",
}) => {
  const cursorRef = useRef<HTMLDivElement>(null);
  const finePointer = useMedia("(pointer: fine)");
  const reducedMotion = useReducedMotion();
  const enabled = !reducedMotion && (!disableOnTouch || finePointer);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!enabled || !cursor) return;

    let active: HTMLElement | null = null;

    function reset() {
      if (active) {
        gsap.to(active, { x: 0, y: 0, duration: 0.45, ease: "elastic.out(1, 0.45)", overwrite: "auto" });
      }
      active = null;
      document.documentElement.classList.remove("magnetic-cursor-active");
      gsap.to(cursor, { opacity: 0, duration: 0.12, overwrite: "auto" });
    }

    function enter(event: PointerEvent) {
      const target = event.currentTarget as HTMLElement;
      if (target.matches(":disabled, [aria-disabled=true]")) return;
      active = target;
      const bounds = target.getBoundingClientRect();
      gsap.set(cursor, { xPercent: -50, yPercent: -50 });
      gsap.to(cursor, {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
        width: bounds.width + hoverPadding * 2,
        height: bounds.height + hoverPadding * 2,
        borderRadius: getComputedStyle(target).borderRadius,
        opacity: 1,
        duration: 0.18,
        ease: "power3.out",
        overwrite: "auto",
      });
    }

    function move(event: PointerEvent) {
      if (!active) return;
      const bounds = active.getBoundingClientRect();
      const x = (event.clientX - bounds.left - bounds.width / 2) * magneticFactor;
      const y = (event.clientY - bounds.top - bounds.height / 2) * magneticFactor;
      gsap.to(active, { x, y, duration: 0.25, ease: "power3.out", overwrite: "auto" });
      gsap.set(cursor, { x: bounds.left + bounds.width / 2 + x, y: bounds.top + bounds.height / 2 + y });
    }

    const elements = new Set<HTMLElement>();
    function bind(element: HTMLElement) {
      if (elements.has(element)) return;
      elements.add(element);
      element.addEventListener("pointerenter", enter);
      element.addEventListener("pointermove", move);
      element.addEventListener("pointerleave", reset);
    }
    function bindAll() {
      if (active && !active.isConnected) reset();
      document.querySelectorAll<HTMLElement>(targetSelector).forEach(bind);
    }
    bindAll();
    const observer = new MutationObserver(bindAll);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("blur", reset);
    window.addEventListener("scroll", reset, { passive: true, capture: true });

    return () => {
      reset();
      observer.disconnect();
      elements.forEach((element) => {
        gsap.killTweensOf(element);
        element.removeEventListener("pointerenter", enter);
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerleave", reset);
      });
      window.removeEventListener("blur", reset);
      window.removeEventListener("scroll", reset, true);
    };
  }, [enabled, magneticFactor, hoverPadding, targetSelector]);

  return (
    <>
      {enabled && (
        <div
          ref={cursorRef}
          aria-hidden="true"
          className={`magnetic-cursor ${cursorClassName}`}
          style={{
            position: "fixed", top: 0, left: 0, zIndex: 9999, pointerEvents: "none", opacity: 0,
            width: cursorSize, height: cursorSize, border: `1px solid ${cursorColor}`,
            mixBlendMode: blendMode, willChange: "transform, width, height, opacity",
          }}
        />
      )}
      {children}
    </>
  );
};
