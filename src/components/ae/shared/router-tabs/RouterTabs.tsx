/* AE-only router tabs preserve real route links where Arc's tab trigger API cannot render them. */
"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft as NavArrowLeft, ChevronRight as NavArrowRight } from "lucide-react";
import { AnimatePresence, LayoutGroup, animate, motion, useReducedMotion } from "motion/react";
import type { AnimationPlaybackControls, Variants } from "motion/react";
import { motionTokens } from "@/components/arc/lib/motion-tokens";
import type { TabsContextValue, TabsContentProps, TabsListProps, TabsProps, TabsTriggerProps } from "./router-tabs.contracts";
import styles from "./router-tabs.module.css";

/** `direction` is +1 when the new tab sits after the old one; `panelHeightRef` holds the visible panel height so the next panel can morph from it; `leavingRectRef` pins the outgoing panel where it was on screen. */
const TabsContext = createContext<TabsContextValue>({ active: "", layoutId: "tabs", direction: 1, animateContent: true, panelHeightRef: { current: null }, leavingRectRef: { current: null } });

export function Tabs({ value, defaultValue, onValueChange, className, animateContent = true, ...props }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const [direction, setDirection] = useState(1);
  const active = value ?? internal;
  const layoutId = useId();
  const root = useRef<HTMLDivElement>(null);
  const panelHeightRef = useRef<number | null>(null);
  const leavingRectRef = useRef<DOMRect | null>(null);
  const contextValue = useMemo(() => ({ active, layoutId, direction, animateContent, panelHeightRef, leavingRectRef }), [active, layoutId, direction, animateContent, panelHeightRef, leavingRectRef]);
  function handleChange(next: unknown) {
    if (typeof next !== "string") return;
    const frame = root.current;
    leavingRectRef.current = animateContent ? frame?.querySelector(':scope > [role="tabpanel"][data-state="active"]')?.getBoundingClientRect() ?? null : null;
    const order = frame ? Array.from(frame.querySelectorAll<HTMLElement>('[role="tab"][data-value]')).filter(tab => tab.closest(`.${styles.root}`) === frame).map(tab => tab.dataset.value) : [];
    const from = order.indexOf(active), to = order.indexOf(next);
    if (from >= 0 && to >= 0 && from !== to) setDirection(to > from ? 1 : -1);
    if (value === undefined) setInternal(next); onValueChange?.(next);
  }
  return <TabsContext.Provider value={contextValue}><LayoutGroup id={layoutId}><TabsPrimitive.Root {...props} ref={root} className={[styles.root, className].filter(Boolean).join(" ")} value={active} onValueChange={handleChange}/></LayoutGroup></TabsContext.Provider>;
}

export function TabsList({ className, ...props }: TabsListProps) {
  const { active } = useContext(TabsContext);
  const reduced = useReducedMotion();
  const shell = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ overflow: false, left: false, right: false });
  const update = useCallback(() => {
    const frame = shell.current;
    const scroll = viewport.current;
    if (!frame || !scroll) return;
    const max = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
    const next = { overflow: scroll.scrollWidth > frame.clientWidth + 1, left: scroll.scrollLeft > 1, right: scroll.scrollLeft < max - 1 };
    setEdges(previous => previous.overflow === next.overflow && previous.left === next.left && previous.right === next.right ? previous : next);
  }, []);
  const reveal = useCallback((tab: HTMLElement | null) => {
    const scroll = viewport.current;
    if (!scroll || !tab) return;
    const frame = scroll.getBoundingClientRect();
    const item = tab.getBoundingClientRect();
    const max = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
    const left = frame.left + (scroll.scrollLeft > 1 ? 34 : 0);
    const right = frame.right - (scroll.scrollLeft < max - 1 ? 34 : 0);
    const delta = item.left < left ? item.left - left : item.right > right ? item.right - right : 0;
    if (delta) scroll.scrollBy({ left: delta, behavior: reduced ? "instant" : "smooth" });
  }, [reduced]);
  useLayoutEffect(() => {
    const frame = shell.current;
    const scroll = viewport.current;
    const content = list.current;
    if (!frame || !scroll || !content) return;
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    observer.observe(scroll);
    observer.observe(content);
    scroll.addEventListener("scroll", update, { passive: true });
    update();
    return () => { observer.disconnect(); scroll.removeEventListener("scroll", update); };
  }, [update]);
  useLayoutEffect(() => { reveal(list.current?.querySelector<HTMLElement>('[role="tab"][data-state="active"]') ?? null); }, [active, reveal]);
  const scrollTabs = (direction: number) => viewport.current?.scrollBy({ left: direction * (viewport.current?.clientWidth ?? 0) * .75, behavior: reduced ? "instant" : "smooth" });
  return <div ref={shell} className={styles.listShell} data-overflow={edges.overflow} data-left={edges.left} data-right={edges.right}>
    {edges.overflow && <button type="button" className={`${styles.scrollButton} ${styles.scrollLeft}`} aria-label="Scroll tabs left" disabled={!edges.left} onClick={() => scrollTabs(-1)}><NavArrowLeft width={17} height={17} aria-hidden="true"/></button>}
    <motion.div ref={viewport} layoutScroll className={styles.viewport} onFocusCapture={event => { if (event.target instanceof HTMLElement && event.target.getAttribute("role") === "tab") reveal(event.target); }}>
      <TabsPrimitive.List activateOnFocus={false} {...props} ref={list} className={[styles.list, className].filter(Boolean).join(" ")}/>
    </motion.div>
    {edges.overflow && <button type="button" className={`${styles.scrollButton} ${styles.scrollRight}`} aria-label="Scroll tabs right" disabled={!edges.right} onClick={() => scrollTabs(1)}><NavArrowRight width={17} height={17} aria-hidden="true"/></button>}
  </div>;
}

export function TabsTrigger({ className, children, value, ...props }: TabsTriggerProps) {
  const { active } = useContext(TabsContext);
  const reduced = useReducedMotion();
  // The LayoutGroup in Tabs scopes the highlight to this instance, so it glides between triggers but never flies in from another tab set.
  return <TabsPrimitive.Tab {...props} value={value} data-value={value} data-state={active === value ? "active" : "inactive"} className={[styles.trigger, className].filter(Boolean).join(" ")}>
    {active === value && <motion.span className={styles.selection} layoutId="selection" layoutDependency={active} transition={reduced ? { duration: 0 } : motionTokens.spring.morph} aria-hidden="true"/>}
    <span className={styles.triggerLabel}>{children}</span>
  </TabsPrimitive.Tab>;
}

const panelMotion: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 8 }),
  center: { opacity: 1, x: 0, transition: { opacity: { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }, x: motionTokens.spring.smooth } },
  exit: (direction: number) => ({ opacity: 0, x: direction * -6, transition: { duration: motionTokens.duration.instant, ease: [...motionTokens.ease.standard] } }),
};
/** Reduced motion: a short crossfade in place. Keys match panelMotion so server and client render identical styles. */
const panelFade: Variants = {
  enter: { opacity: 0, x: 0 },
  center: { opacity: 1, x: 0, transition: { duration: motionTokens.duration.instant } },
  exit: { opacity: 0, x: 0, transition: { duration: .1 } },
};

export function TabsContent({ className, value, keepMounted, children, ...props }: TabsContentProps) {
  const { active, direction, animateContent, panelHeightRef, leavingRectRef } = useContext(TabsContext);
  const reduced = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const selected = active === value;
  const classes = [styles.content, className].filter(Boolean).join(" ");
  // The incoming panel starts at the outgoing panel's height and settles at its own, so content below glides instead of jumping.
  useLayoutEffect(() => {
    if (!animateContent) {
      panelHeightRef.current = null;
      leavingRectRef.current = null;
      return;
    }
    const node = panel.current;
    if (!node || keepMounted) return;
    // Outgoing: the tab root may have changed size around it, so pin the panel to where it was while it fades.
    if (!selected) { const before = leavingRectRef.current; const now = node.getBoundingClientRect(); if (before) node.style.translate = `${before.left - now.left}px ${before.top - now.top}px`; node.inert = true; return; }
    node.style.translate = ""; node.inert = false;
    const from = panelHeightRef.current;
    const to = node.offsetHeight;
    let controls: AnimationPlaybackControls | undefined;
    const release = () => { node.style.height = ""; node.style.overflow = ""; };
    if (from !== null && Math.abs(from - to) > 1 && !reduced) {
      if (to > from) node.style.overflow = "clip";
      controls = animate(node, { height: [from, to] }, { ...motionTokens.spring.smooth, onComplete: release });
    }
    panelHeightRef.current = controls && from !== null ? from : to;
    const observer = new ResizeObserver(() => { panelHeightRef.current = node.offsetHeight; });
    observer.observe(node);
    return () => { observer.disconnect(); controls?.stop(); release(); };
  }, [animateContent, selected, reduced, keepMounted, panelHeightRef, leavingRectRef]);
  if (!animateContent) {
    if (!keepMounted && !selected) return null;
    return <TabsPrimitive.Panel {...props} value={value} {...(keepMounted ? { keepMounted: true } : {})} data-state={selected ? "active" : "inactive"} className={classes}>{children}</TabsPrimitive.Panel>;
  }
  if (keepMounted) return <TabsPrimitive.Panel {...props} value={value} keepMounted data-state={selected ? "active" : "inactive"} className={classes}>{children}</TabsPrimitive.Panel>;
  return <AnimatePresence initial={false} mode="popLayout" custom={direction}>
    {selected && <TabsPrimitive.Panel {...props} key={value} value={value} keepMounted data-state={selected ? "active" : "inactive"} render={<motion.div ref={panel} className={classes} custom={direction} variants={reduced ? panelFade : panelMotion} initial="enter" animate="center" exit="exit" />}>{children}</TabsPrimitive.Panel>}
  </AnimatePresence>;
}
