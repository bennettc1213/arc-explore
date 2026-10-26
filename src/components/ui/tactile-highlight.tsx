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
 *    left out. The spring and the directional wipe are intact.
 *
 * 3. **Hover grows the block; it does not tilt it.** The original rotates it
 *    1.5° and scales it uniformly. On a wide phrase that read as the whole
 *    shape lurching up at one end, so hover now expands the block around the
 *    text — a little wider, noticeably taller, from its centre — with a
 *    well-damped spring so it settles rather than wobbles. The block is also
 *    slightly thinner than the line box and the text sits a touch lower in it,
 *    which is what gives the growth room to read as an expansion.
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
      originX,
      transition: reduce
        ? { duration: 0 }
        : { type: "spring", damping: 22, stiffness: 130, mass: 0.8, delay },
    },
    hover: reduce
      ? {}
      : {
          scaleX: 1.04,
          scaleY: 1.22,
          // Grow from the middle: with a left-origin wipe the block would
          // otherwise stretch only to the right and look like it slid.
          originX: 0.5,
          originY: 0.5,
          transition: { type: "spring", damping: 26, stiffness: 320 },
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
        className="absolute z-0"
        style={{
          // Thinner than the line box: the top edge starts 0.1em down and the
          // bottom reaches 0.05em past the line box so descenders (y, g) stay
          // inside it; the text is lowered 0.05em to sit in what is left.
          top: "0.1em",
          right: 0,
          bottom: "-0.05em",
          left: 0,
          originX,
          originY,
          background: "var(--accent)",
          boxShadow: "0 18px 48px -18px var(--accent-glow)",
        }}
      />
      <span
        className="relative z-10 mix-blend-difference pointer-events-none"
        style={{ color: "var(--accent)", top: "0.05em" }}
      >
        {children}
      </span>
    </span>
  );
};

export default TactileHighlight;
