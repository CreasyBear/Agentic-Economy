"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { AnimatePresence, animate, motion, motionValue, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import type { MotionStyle, MotionValue, Transition } from "motion/react";
import { motionTokens } from "../lib/motion-tokens";
import styles from "./liquid-tab-bar.module.css";

export interface LiquidTab {
  value: string;
  label: string;
  /** A 20px outline icon, such as a lucide icon with a 1.75 stroke. */
  icon: ReactNode;
  /** Drawn inside the selection. Defaults to `icon` filled in; pass your own when filling the outline would hide its detail. */
  activeIcon?: ReactNode;
  /** A count beside the icon, such as unread messages. Its digits roll when it changes and it leaves at 0. */
  badge?: number;
  /** Spoken with the tab, such as "3 unread". Defaults to the number. */
  badgeLabel?: string;
}

/**
 * Horizontal navigation for a handful of peer sections. The selection is a liquid lens: its leading edge races to the new tab while
 * the trailing edge catches up, so it stretches with the distance and speed of the move and thins a little as it stretches.
 * Whatever passes under the lens is redrawn inverted, so outline icons fill in as it arrives. Grab the lens and throw it,
 * or use the arrow keys. Tabs get the id `liquidTabId(id, value)` and control `liquidPanelId(id, value)`.
 */
export interface LiquidTabBarProps {
  tabs: LiquidTab[];
  value: string;
  onValueChange: (value: string) => void;
  /** Which tabs show their label: the selected one, which opens as it is chosen (the default), every tab, or none. */
  labels?: "active" | "always" | "none";
  /** Accessible name of the tab list. */
  label?: string;
  id?: string;
  className?: string;
}

export const liquidTabId = (id: string, value: string) => `${id}-tab-${value}`;
export const liquidPanelId = (id: string, value: string) => `${id}-panel-${value}`;

/** Geometry in px. Keep in step with the stylesheet. */
const PAD = 4, GAP = 2, HEIGHT = 44, SLOT = 44, LABEL_ROOM = 10;
/** Most the lens thins while stretched, and how far it leans toward a hovered tab, in tabs. */
const THIN = .11, LEAN = .14;
const style = { "--liquid-pad": `${PAD}px`, "--liquid-gap": `${GAP}px`, "--liquid-height": `${HEIGHT}px`, "--liquid-slot": `${SLOT}px` } satisfies MotionStyle & Record<`--${string}`, string>;

const { spring } = motionTokens;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 100) / 100;
/** Shared spring characters restated as stiffness and damping, so a new target keeps the current velocity. */
const physical = (visualDuration: number, bounce: number): Transition => {
  const root = 2 * Math.PI / (visualDuration * 1.2);
  return { type: "spring", stiffness: root * root, damping: 2 * (1 - bounce) * root, mass: 1, restDelta: .0005, restSpeed: .02 };
};
/** The leading edge sets off at once; the trailing edge is heavier, so the lens stretches in proportion to the jump. */
const lead = physical(.34, .22), trail = physical(.56, .14);
/** While held, the edges chase the pointer: the one in front almost rigidly, the one behind with a short drag. */
const heldLead = physical(.07, 0), heldTrail = physical(.2, 0);
const leanSpring = physical(spring.snappy.visualDuration, 0), press = physical(.2, 0), open = physical(spring.morph.visualDuration, .08);
const instant: Transition = { duration: 0 };
/** Resistance past the first or last tab, in tabs. */
const rubber = (overshoot: number, limit = .45, constant = .55) => overshoot * limit * constant / (limit + constant * Math.abs(overshoot));

interface SlotGeometry { left: number; width: number }
interface Layout { slots: SlotGeometry[]; total: number }
function measure(widths: number[]): Layout {
  let x = PAD;
  const slots = widths.map(width => {
    const slot = { left: x, width };
    x += width + GAP;
    return slot;
  });
  return { slots, total: x - GAP + PAD };
}
/** Left edge and width at a fractional tab position, extrapolated past either end. */
function at({ slots }: Layout, p: number): SlotGeometry {
  const first = slots[0], last = slots.at(-1);
  if (!first || !last) return { left: PAD, width: SLOT };
  if (p <= 0) return { left: first.left + p * (first.width + GAP), width: first.width };
  if (p >= slots.length - 1) return { left: last.left + (p - slots.length + 1) * (last.width + GAP), width: last.width };
  const i = Math.floor(p), f = p - i, start = slots[i], end = slots[i + 1];
  if (!start || !end) return first;
  return { left: start.left + f * (end.left - start.left), width: start.width + f * (end.width - start.width) };
}
/** The fractional tab position whose center sits at x. */
function positionAt({ slots }: Layout, x: number) {
  const centers = slots.map(slot => slot.left + slot.width / 2);
  const first = centers[0], second = centers[1], last = centers.at(-1), previous = centers.at(-2);
  if (first === undefined || second === undefined || last === undefined || previous === undefined) return 0;
  if (x <= first) return (x - first) / (second - first);
  if (x >= last) return centers.length - 1 + (x - last) / (last - previous);
  for (let i = 0; i < centers.length - 1; i++) {
    const start = centers[i], end = centers[i + 1];
    if (start !== undefined && end !== undefined && x <= end) return i + (x - start) / (end - start);
  }
  return centers.length - 1;
}

const subscribe = () => () => {};
function useReducedFlag() {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  return !!useReducedMotion() && hydrated;
}

/** One digit as a column of ten that rolls to its value. */
function Digit({ digit, reduced }: { digit: number; reduced: boolean }) {
  return <span className={styles.digit}>
    <motion.span className={styles.column} initial={false} animate={{ y: `${-digit * 10}%` }} transition={reduced ? instant : spring.snappy}>
      {"0123456789".split("").map(n => <span key={n}>{n}</span>)}
    </motion.span>
  </span>;
}

function Badge({ count, reduced, inverted }: { count: number; reduced: boolean; inverted?: boolean }) {
  const text = count > 99 ? "99" : String(count);
  return <AnimatePresence initial={false}>
    {count > 0 && <motion.span key="badge" className={styles.badge} data-inverted={inverted || undefined} aria-hidden="true"
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: .6 }} animate={{ opacity: 1, scale: 1, width: 10 + text.length * 7 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: .6, transition: { duration: motionTokens.duration.fast } }}
      transition={reduced ? { duration: .12 } : { ...spring.snappy, opacity: { duration: motionTokens.duration.fast } }}>
      {text.split("").map((n, i) => <Digit key={text.length - i} digit={Number(n)} reduced={reduced} />)}
    </motion.span>}
  </AnimatePresence>;
}

interface Gesture { pointer: number; x: number; grab: number; last: number; dragging: boolean; direction: number; history: { t: number; p: number }[] }

export function LiquidTabBar({ tabs, value, onValueChange, labels = "active", label = "Sections", id, className }: LiquidTabBarProps) {
  const autoId = useId();
  const baseId = id ?? autoId;
  const reduced = useReducedFlag();
  const count = tabs.length;
  const activeIndex = Math.max(0, tabs.findIndex(tab => tab.value === value));

  const rowRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const measureRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const gesture = useRef<Gesture | null>(null);
  const heading = useRef(activeIndex);
  const suppressClick = useRef(false);
  const [labelWidths, setLabelWidths] = useState<number[]>([]);
  const [held, setHeld] = useState(false);

  // One open amount per tab, kept by value so a tab keeps its state when the list changes around it.
  const [opens] = useState(() => new Map<string, MotionValue<number>>());
  const openOf = (tab: LiquidTab, index: number) => {
    let mv = opens.get(tab.value);
    if (!mv) { mv = motionValue(labels === "always" || (labels === "active" && index === activeIndex) ? 1 : 0); opens.set(tab.value, mv); }
    return mv;
  };
  const openValues = tabs.map(openOf);

  const left = useMotionValue(activeIndex), right = useMotionValue(activeIndex);
  const lean = useMotionValue(0), pressed = useMotionValue(0);

  const widthOf = (i: number, amount: number) => labels === "none" ? SLOT : SLOT + (LABEL_ROOM + (labelWidths[i] ?? 0)) * amount;
  const layoutNow = () => measure(openValues.map((mv, i) => widthOf(i, mv.get())));

  const clipPath = useTransform(() => {
    const layout = measure(openValues.map((mv, i) => widthOf(i, mv.get())));
    const l = left.get(), r = right.get(), leaning = lean.get(), press = pressed.get();
    const start = at(layout, Math.min(l, r) + Math.min(leaning, 0)), end = at(layout, Math.max(l, r) + Math.max(leaning, 0));
    const x1 = start.left, x2 = end.left + end.width;
    const thin = reduced ? 0 : Math.tanh(Math.abs(r - l) * 1.1) * THIN * HEIGHT / 2;
    const inset = thin + press * 2, sideInset = press * 2;
    const radius = HEIGHT / 2 - inset;
    return `inset(${round(PAD + inset)}px ${round(layout.total - x2 + sideInset)}px ${round(PAD + inset)}px ${round(x1 + sideInset)}px round ${round(radius)}px)`;
  });
  const total = useTransform(() => measure(openValues.map((mv, i) => widthOf(i, mv.get()))).total);

  // Labels are measured once they render, so a tab opens to exactly the width of its words.
  useLayoutEffect(() => {
    const next = measureRefs.current.slice(0, count).map(node => Math.ceil(node?.offsetWidth ?? 0));
    setLabelWidths(current => current.length === next.length && current.every((w, i) => w === next[i]) ? current : next);
  }, [count, tabs]);

  // A new value opens its label and sends the lens there; the edge facing the move leads.
  useEffect(() => {
    tabs.forEach((tab, i) => {
      const mv = opens.get(tab.value);
      if (!mv) return;
      const to = labels === "always" || (labels === "active" && i === activeIndex) ? 1 : 0;
      if (reduced) mv.jump(to); else animate(mv, to, open);
    });
    heading.current = activeIndex;
    // The chosen tab is now under the lens, so any lean toward it lets go.
    if (reduced) lean.jump(0); else animate(lean, 0, leanSpring);
    if (gesture.current?.dragging) return;
    if (reduced) { left.jump(activeIndex); right.jump(activeIndex); return; }
    const forward = activeIndex >= (left.get() + right.get()) / 2;
    animate(left, activeIndex, forward ? trail : lead);
    animate(right, activeIndex, forward ? lead : trail);
  }, [activeIndex, labels, lean, left, opens, reduced, right, tabs]);

  function select(index: number, focus = false) {
    const tab = tabs[index];
    if (!tab) return;
    if (focus) tabRefs.current[index]?.focus({ preventScroll: true });
    if (tab.value !== value) onValueChange(tab.value);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    let next: number;
    const delta = moves[event.key];
    if (delta !== undefined) next = (activeIndex + delta + count) % count;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    else return;
    event.preventDefault();
    select(next, true);
  }

  function leanToward(index: number | null) {
    if (reduced || gesture.current?.dragging) return;
    const to = index === null ? 0 : clamp(index - activeIndex, -1, 1) * LEAN;
    animate(lean, to, leanSpring);
  }

  function rowX(clientX: number) { return clientX - (rowRef.current?.getBoundingClientRect().left ?? 0); }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>, index: number) {
    if (event.button !== 0 || !event.isPrimary) return;
    suppressClick.current = false;
    // A press on another tab answers at once: the lens leans toward it before the click lands, for touch as well as mouse.
    if (index !== activeIndex) { leanToward(index); return; }
    if (reduced) return;
    // Grabbing the lens: it squeezes a little under the pointer and follows it once it moves.
    const layout = layoutNow();
    const p = positionAt(layout, rowX(event.clientX));
    gesture.current = { pointer: event.pointerId, x: event.clientX, grab: p - (left.get() + right.get()) / 2, last: p, dragging: false, direction: 0, history: [{ t: event.timeStamp, p }] };
    animate(pressed, 1, press);
    animate(lean, 0, leanSpring);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== event.pointerId) return;
    if (!g.dragging) {
      if (Math.abs(event.clientX - g.x) < 5) return;
      g.dragging = true;
      setHeld(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const raw = positionAt(layoutNow(), rowX(event.clientX)) - g.grab;
    const p = raw < 0 ? rubber(raw) : raw > count - 1 ? count - 1 + rubber(raw - count + 1) : raw;
    const delta = p - g.last;
    if (Math.abs(delta) > .002) g.direction = Math.sign(delta);
    g.last = p;
    g.history.push({ t: event.timeStamp, p });
    if (g.history.length > 8) g.history.shift();
    animate(left, p, g.direction < 0 ? heldLead : heldTrail);
    animate(right, p, g.direction > 0 ? heldLead : heldTrail);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== event.pointerId) return;
    gesture.current = null;
    animate(pressed, 0, physical(.4, .35));
    if (!g.dragging) return;
    setHeld(false);
    suppressClick.current = true;
    // Project the throw with its release speed, land on the nearest tab to that point, and hand the speed to the lens.
    const recent = g.history.filter(sample => event.timeStamp - sample.t < 90);
    const first = recent[0], last = recent[recent.length - 1];
    const velocity = first && last && last.t > first.t && event.timeStamp - last.t < 60 ? (last.p - first.p) / (last.t - first.t) * 1000 : 0;
    // Momentum is projected with a deceleration curve; a clear flick always moves on at least one tab, however short the drag.
    let target = clamp(Math.round(g.last + velocity / 1000 * .993 / (1 - .993)), 0, count - 1);
    if (target === activeIndex && Math.abs(velocity) > 4) target = clamp(activeIndex + Math.sign(velocity), 0, count - 1);
    const forward = target >= g.last;
    heading.current = target;
    animate(left, target, { ...(forward ? trail : lead), velocity: left.getVelocity() });
    animate(right, target, { ...(forward ? lead : trail), velocity: right.getVelocity() });
    select(target);
  }


  const row = (inverted: boolean) => tabs.map((tab, i) => <Tab key={tab.value} tab={tab} index={i} open={openOf(tab, i)} labelWidth={labelWidths[i] ?? 0} labels={labels} inverted={inverted} reduced={reduced}
    selected={i === activeIndex} baseId={baseId} setRef={node => { if (!inverted) tabRefs.current[i] = node; }}
    onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } select(i); }}
    onPointerDown={event => onPointerDown(event, i)} onHover={() => leanToward(i)} />);

  return <motion.div ref={rowRef} role="tablist" aria-label={label} aria-orientation="horizontal" className={[styles.bar, className].filter(Boolean).join(" ")} style={{ ...style, width: total }}
    data-held={held || undefined} data-reduced={reduced || undefined} onKeyDown={onKeyDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
    onPointerLeave={() => leanToward(null)}>
    <div className={styles.row}>{row(false)}</div>
    <motion.div className={styles.lens} style={{ clipPath }} aria-hidden="true"><div className={styles.row}>{row(true)}</div></motion.div>
    <div className={styles.measure} aria-hidden="true">{tabs.map((tab, i) => <span key={tab.value} ref={node => { measureRefs.current[i] = node; }} className={styles.label}>{tab.label}</span>)}</div>
  </motion.div>;
}

interface TabProps {
  tab: LiquidTab; index: number; open: MotionValue<number>; labelWidth: number; labels: "active" | "always" | "none"; inverted: boolean; reduced: boolean; selected: boolean; baseId: string;
  setRef: (node: HTMLButtonElement | null) => void; onClick: () => void; onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void; onHover: () => void;
}

/** A tab, drawn twice: once in outline on the track, and once inverted and filled inside the lens, which is clipped to the selection. */
function Tab({ tab, open, labelWidth, labels, inverted, reduced, selected, baseId, setRef, onClick, onPointerDown, onHover }: TabProps) {
  const width = useTransform(open, amount => labels === "none" ? SLOT : SLOT + (LABEL_ROOM + labelWidth) * amount);
  const labelOpacity = useTransform(open, amount => clamp(amount * 1.5 - .35, 0, 1));
  const labelX = useTransform(open, amount => reduced ? 0 : (1 - amount) * -6);
  const content = <>
    <span className={styles.icon}>{inverted ? tab.activeIcon ?? <span className={styles.filled}>{tab.icon}</span> : tab.icon}</span>
    {tab.badge !== undefined && <span className={styles.badgeAnchor}><Badge count={tab.badge} reduced={reduced} inverted={inverted} /></span>}
    {labels !== "none" && <motion.span className={styles.label} style={{ opacity: labelOpacity, x: labelX }}>{tab.label}</motion.span>}
  </>;
  if (inverted) return <motion.span className={styles.tab} style={{ width }}>{content}</motion.span>;
  const spoken = tab.badge ? `, ${tab.badgeLabel ?? tab.badge}` : "";
  return <motion.button ref={setRef} type="button" role="tab" id={liquidTabId(baseId, tab.value)} aria-controls={liquidPanelId(baseId, tab.value)} aria-selected={selected}
    aria-label={`${tab.label}${spoken}`} tabIndex={selected ? 0 : -1} className={styles.tab} data-selected={selected || undefined} style={{ width }}
    onClick={onClick} onPointerDown={onPointerDown} onPointerEnter={event => { if (event.pointerType === "mouse") onHover(); }}>
    {content}
  </motion.button>;
}

export default LiquidTabBar;
