"use client";

import { motion, useInView, useReducedMotion, type Variants } from "framer-motion";
import React, { useRef } from "react";

import { cn } from "@/lib/utils";

type HighlightDirection = "left" | "right" | "top" | "bottom";

interface TactileHighlightProps {
  children: React.ReactNode;
  className?: string;
  direction?: HighlightDirection;
  delay?: number;
  trigger?: "auto" | "hover" | "inView";
}

/**
 * TactileHighlight — an animated block that springs in behind a phrase.
 *
 * Integrated from a supplied component, with two deliberate departures, both
 * because the original assumed a different design system:
 *
 * 1. **Colour.** The original paints a zinc-950 block in light mode and a white
 *    one under Tailwind's `dark:` variant — which keys off the *visitor's OS
 *    setting*. This site is dark-only, so a visitor whose OS is in light mode
 *    would have got a near-black block on a near-black page: an invisible
 *    highlight. The block is the one accent instead.
 *
 *    The `mix-blend-difference` trick is kept, and it is why the text is also
 *    accent-coloured: inside `main`'s isolated stacking context the backdrop
 *    is transparent wherever the block is not, so the text paints as itself —
 *    orange — and where the block *is*, accent minus accent is black. So the
 *    phrase reads orange before the block arrives, flips to near-black as the
 *    block sweeps under it (partially, mid-sweep), and lands at the same
 *    black-on-accent pairing `--on-accent` exists for (≈6:1, AA). White text,
 *    as in the original, would difference to cyan on orange.
 *
 * 2. **Corners.** The original morphs its radius 12px → 4px. Square corners are
 *    the design system's pixel-art rule (`* { border-radius: 0 }`), and an
 *    inline style from the animation would beat that rule, so the radius is
 *    left out. The spring, the directional wipe and the hover tilt are intact.
 *
 * Reduced motion: the block is shown in place with no spring and no hover
 * wobble. The highlight carries meaning (it is the emphasis), so it is not
 * removed — only its motion is.
 */
export const TactileHighlight = ({
  children,
  className,
  direction = "left",
  delay = 0.1,
  trigger = "inView",
}: TactileHighlightProps) => {
  const ref = useRef(null);
  // once: false lets the animation restart when scrolled back into view.
  const isInView = useInView(ref, { once: false, margin: "-10%" });
  const reduce = useReducedMotion();

  const isAnimated = reduce || trigger === "auto" || (trigger === "inView" && isInView);

  const horizontal = direction === "left" || direction === "right";
  const originX = direction === "left" ? 0 : direction === "right" ? 1 : 0.5;
  const originY = direction === "top" ? 0 : direction === "bottom" ? 1 : 0.5;

  const variants: Variants = {
    hidden: {
      scaleX: horizontal ? 0 : 1,
      scaleY: horizontal ? 1 : 0,
    },
    visible: {
      scaleX: 1,
      scaleY: 1,
      rotate: 0,
      scale: 1,
      transition: reduce
        ? { duration: 0 }
        : { type: "spring", damping: 22, stiffness: 130, mass: 0.8, delay },
    },
    hover: reduce
      ? {}
      : {
          scale: 1.05,
          rotate: direction === "left" ? -1.5 : direction === "right" ? 1.5 : 0,
          transition: { type: "spring", damping: 15, stiffness: 400 },
        },
  };

  return (
    <span
      ref={ref}
      className={cn("relative inline-block whitespace-nowrap cursor-default", className)}
      style={{ padding: "0 0.15em", margin: "0 -0.15em" }}
    >
      <motion.span
        aria-hidden
        // Always "hidden", even under reduced motion: the server cannot know the
        // preference, so branching here would make the first client render
        // disagree with the HTML. Reduced motion gets a zero-length transition
        // instead, which lands on the same frame.
        initial="hidden"
        animate={isAnimated ? "visible" : "hidden"}
        whileHover={trigger === "hover" ? "visible" : "hover"}
        variants={variants}
        className="absolute inset-0 z-0"
        style={{
          originX,
          originY,
          background: "var(--accent)",
          boxShadow: "0 18px 48px -18px var(--accent-glow)",
        }}
      />
      <span
        className="relative z-10 mix-blend-difference pointer-events-none"
        style={{ color: "var(--accent)" }}
      >
        {children}
      </span>
    </span>
  );
};

export default TactileHighlight;
