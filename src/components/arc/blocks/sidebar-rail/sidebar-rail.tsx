/* Adapted from Arc UI Pro sidebar-rail source. Upstream SHA-256: 2760b2f05c19862d713cef2c7eb28936bd6ed5ec5afe8feb2b8993979f763a3d. */
"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { LazyMotion, domMax, m, useReducedMotion } from "motion/react";

import { Drawer, DrawerContent } from "@/components/ae/shared/base-ui/drawer/drawer";
import { motionTokens } from "../../lib/motion-tokens";
import styles from "./sidebar-rail.module.css";

const FULL = 240;
const RAIL = 64;
const COMPACT = 480;
const ROOMY = 760;

export type SidebarRailEntry = Readonly<{
  id: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  renderLink: (props: Readonly<{
    className: string | undefined;
    children: ReactNode;
    onClick: () => void;
    "aria-current"?: "page";
  }>) => ReactNode;
}>;

export type SidebarRailGroup = Readonly<{
  id: string;
  label: string;
  items: readonly SidebarRailEntry[];
  context?: ReactNode;
}>;

export function SidebarRailNavigation({
  groups,
  collapsed,
  onNavigate,
}: Readonly<{
  groups: readonly SidebarRailGroup[];
  collapsed: boolean;
  onNavigate: () => void;
}>) {
  const id = useId();
  const reducedMotion = useReducedMotion() ?? false;
  const transition = reducedMotion
    ? { duration: motionTokens.duration.instant }
    : motionTokens.spring.morph;

  return (
    <nav className={styles.navigation} aria-label="App navigation">
      {groups.map((group) => {
        const headingId = `${id}-${group.id}`;
        return (
          <section
            key={group.id}
            className={styles.group}
            role="group"
            aria-labelledby={headingId}
          >
            <span
              id={headingId}
              className={collapsed ? styles.srOnly : styles.groupLabel}
            >
              {group.label}
            </span>
            {!collapsed && group.context != null ? (
              <div className={styles.groupContext}>{group.context}</div>
            ) : null}
            <ul className={styles.list}>
              {group.items.map((entry) => {
                const children = (
                  <span
                    className={styles.linkContent}
                    title={collapsed ? entry.label : undefined}
                  >
                    <span className={styles.icon} aria-hidden="true">
                      {entry.icon}
                    </span>
                    <span className={collapsed ? styles.srOnly : styles.label}>
                      {entry.label}
                    </span>
                  </span>
                );

                return (
                  <li key={entry.id} className={styles.itemSlot}>
                    {entry.active ? (
                      <m.span
                        layoutId={`${id}-active-entry`}
                        className={styles.highlight}
                        transition={transition}
                        aria-hidden="true"
                      />
                    ) : null}
                    {entry.renderLink({
                      className: styles.link,
                      children,
                      onClick: onNavigate,
                      ...(entry.active ? { "aria-current": "page" as const } : {}),
                    })}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}

function PanelGlyph({ collapsed, reducedMotion }: { collapsed: boolean; reducedMotion: boolean }) {
  const transition = reducedMotion
    ? { duration: motionTokens.duration.instant }
    : motionTokens.spring.smooth;

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="3.5" />
      <m.path
        d="M8.25 4.25v11.5"
        initial={false}
        animate={{ x: collapsed ? -2.5 : 0 }}
        transition={transition}
      />
    </svg>
  );
}

export function SidebarRail({
  enabled,
  brand,
  header,
  navigation,
  children,
}: Readonly<{
  enabled: boolean;
  brand: ReactNode;
  header: (trigger?: ReactNode) => ReactNode;
  navigation: (collapsed: boolean, onNavigate: () => void) => ReactNode;
  children: ReactNode;
}>) {
  const id = useId();
  const reducedMotion = useReducedMotion() ?? false;
  const [collapsed, setCollapsed] = useState(false);
  const [compact, setCompact] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settling, setSettling] = useState(true);
  const frameRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarId = `${id}-sidebar`;
  const drawerId = `${id}-drawer`;

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    let measured = false;
    let settleFrame: number | undefined;

    function fit(width: number) {
      if (!Number.isFinite(width) || width <= 0) return;

      const nextCompact = width < COMPACT;
      setCompact(nextCompact);
      setCollapsed(width < ROOMY);
      if (!nextCompact) setMobileOpen(false);

      if (!measured) {
        measured = true;
        if (typeof window.requestAnimationFrame === "function") {
          settleFrame = window.requestAnimationFrame(() => setSettling(false));
        } else {
          setSettling(false);
        }
      }
    }

    fit(frame.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") {
      setSettling(false);
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      fit(entry?.contentRect.width ?? frame.getBoundingClientRect().width);
    });
    observer.observe(frame);

    return () => {
      observer.disconnect();
      if (settleFrame !== undefined && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(settleFrame);
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled) setMobileOpen(false);
  }, [enabled]);

  function onNavigate() {
    setMobileOpen(false);
  }

  function focusToggle() {
    const toggle = toggleRef.current;
    if (!toggle?.isConnected) return false;
    toggle.focus({ preventScroll: true });
    return false;
  }

  const toggleLabel = compact
    ? "Open navigation"
    : collapsed
      ? "Expand sidebar"
      : "Collapse sidebar";
  const trigger = enabled ? (
    <button
      ref={toggleRef}
      type="button"
      className={styles.toggle}
      aria-label={toggleLabel}
      aria-expanded={compact ? mobileOpen : !collapsed}
      aria-controls={compact ? drawerId : sidebarId}
      {...(compact ? { "aria-haspopup": "dialog" as const } : {})}
      onClick={() => {
        if (compact) {
          setMobileOpen(true);
        } else {
          setCollapsed((value) => !value);
        }
      }}
    >
      <PanelGlyph collapsed={compact ? false : collapsed} reducedMotion={reducedMotion || settling} />
    </button>
  ) : undefined;

  return (
    <LazyMotion features={domMax}>
    <div
      ref={frameRef}
      className={`arc-market ${styles.frame}`}
      data-enabled={enabled || undefined}
      data-compact={compact || undefined}
    >
      <aside
        id={sidebarId}
        className={styles.sidebar}
        data-collapsed={collapsed || undefined}
        aria-label="Workspace sidebar"
        aria-hidden={!enabled || compact || undefined}
        style={{ width: collapsed ? RAIL : FULL }}
      >
        {enabled && !compact ? (
          <>
            <div className={styles.brand}>{brand}</div>
            {navigation(collapsed, onNavigate)}
          </>
        ) : null}
      </aside>
      <div className={styles.main}>
        <div className={styles.headerSlot}>{header(trigger)}</div>
        <div className={styles.contentSlot}>{children}</div>
      </div>
      <Drawer
        open={enabled && compact && mobileOpen}
        onOpenChange={setMobileOpen}
      >
        {enabled && compact ? (
          <DrawerContent
            id={drawerId}
            side="left"
            title="App navigation"
            closeLabel="Close navigation"
            className={styles.drawerPopup}
            finalFocus={focusToggle}
          >
            <div className={styles.drawerContent}>
              <div className={styles.drawerBrand}>{brand}</div>
              {navigation(false, onNavigate)}
            </div>
          </DrawerContent>
        ) : null}
      </Drawer>
    </div>
    </LazyMotion>
  );
}
