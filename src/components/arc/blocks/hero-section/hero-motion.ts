/* Actual Arc Hero section registry source retrieved 2026-10-03. hero-motion.ts SHA-256: 13b3c25c7316aa0f222a1ec393027ac02f20f59194d638d17961a59868a04a21
 * Installed content path; native link and heading identity ports preserve host semantics. */
import { useSyncExternalStore } from "react";
import { useReducedMotion } from "motion/react";
import type { Transition, Variants } from "motion/react";
import { motionTokens } from "../../lib/motion-tokens";

export type Bezier = [number, number, number, number];
export const ease = {
  enter: [...motionTokens.ease.enter] as Bezier,
  standard: [...motionTokens.ease.standard] as Bezier,
  inOut: [...motionTokens.ease.inOut] as Bezier,
};

/** The one entrance a hero plays: children rise in reading order, once. */
export const heroGroup: Variants = { hidden: {}, shown: { transition: { staggerChildren: motionTokens.stagger.line, delayChildren: .04 } } };
export const heroRise: Variants = {
  hidden: { opacity: 0, y: 12, filter: `blur(${motionTokens.blur.subtle}px)` },
  shown: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: .64, ease: ease.enter } },
};
export const heroFade: Variants = { hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: motionTokens.duration.standard } } };

export const instant: Transition = { duration: 0 };

const noop = () => () => {};
/**
 * Reduced motion, read only after hydration. The server cannot know the preference, so the first client render matches the
 * server's full motion markup and the reduced branch takes over on the next render, before anything has moved.
 */
export function useHeroReducedMotion() {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  return !!useReducedMotion() && hydrated;
}
