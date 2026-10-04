"use client";

/*
 * Adapted from https://uiarc.dev/r/checkbox.json; retrieved 2026-10-04.
 * Upstream TSX SHA-256: 4759251a0b2a83320cb4078e840f61481a23be0b38b9aa7c077c2e85e6dde00d
 * Upstream CSS SHA-256: 6cc8ae35edbd99dac2ea3768a6db0932429ecb06febab06e048a4b94974251b6
 * Local adaptations: Base UI engine, union-state bridge, merged descriptions,
 * caller-owned accessible names, and compact selection geometry.
 */

import { forwardRef, useId, useState } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import { motionTokens } from "../lib/motion-tokens";
import styles from "./checkbox.module.css";

type CheckedState = boolean | "indeterminate";
type BaseCheckboxProps = ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>;

export interface CheckboxProps extends Omit<BaseCheckboxProps, "checked" | "defaultChecked" | "onCheckedChange" | "indeterminate"> {
  checked?: CheckedState;
  defaultChecked?: CheckedState;
  onCheckedChange?: (checked: CheckedState) => void;
  label?: string;
  description?: string;
  compact?: boolean;
}

/** Both marks share three points, so the check morphs into the dash and back instead of swapping. */
const checkPath = "M4.25 9.25 L7.25 12.25 L13.75 5.75";
const dashPath = "M4.75 9 L9 9 L13.25 9";

export const Checkbox = forwardRef<HTMLElement, CheckboxProps>(function Checkbox(
  {
    label,
    description,
    id,
    className,
    compact = false,
    checked,
    defaultChecked,
    onCheckedChange,
    render,
    nativeButton = true,
    "aria-describedby": callerDescribedBy,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = `${controlId}-description`;
  const describedBy = [callerDescribedBy, description ? descriptionId : undefined].filter(Boolean).join(" ") || undefined;
  const reduced = useReducedMotion();
  const [internal, setInternal] = useState<CheckedState>(defaultChecked ?? false);
  const state = checked ?? internal;
  const on = state !== false;
  const change = (next: boolean) => {
    if (checked === undefined) setInternal(next);
    onCheckedChange?.(next);
  };
  const fade: Transition = { duration: on ? motionTokens.duration.instant : motionTokens.duration.fast, ease: [...motionTokens.ease.standard] };

  return <div className={styles.field}>
    <CheckboxPrimitive.Root
      {...props}
      data-slot="checkbox"
      id={controlId}
      ref={ref}
      checked={state === true}
      indeterminate={state === "indeterminate"}
      onCheckedChange={change}
      nativeButton={nativeButton}
      render={render ?? <button type="button" />}
      className={(rootState) => {
        const callerClassName = typeof className === "function" ? className(rootState) : className;
        return [styles.box, compact ? styles.compact : undefined, callerClassName].filter(Boolean).join(" ");
      }}
      aria-describedby={describedBy}
    >
      <span className={styles.visual} aria-hidden="true">
        <motion.span className={styles.fill} initial={false} animate={{ opacity: on ? 1 : 0, scale: on ? 1 : .6 }} transition={reduced ? { duration: 0 } : { scale: motionTokens.spring.snappy, opacity: fade }} />
        <svg className={styles.mark} viewBox="0 0 18 18" fill="none" focusable="false">
          <motion.path initial={false} animate={{ d: state === "indeterminate" ? dashPath : checkPath, pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }} transition={reduced ? { duration: 0 } : { d: motionTokens.spring.morph, pathLength: motionTokens.spring.snappy, opacity: fade }} stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </CheckboxPrimitive.Root>
    {label || description ? <div className={styles.copy}>
      {label ? <label htmlFor={controlId}>{label}</label> : null}
      {description ? <span id={descriptionId}>{description}</span> : null}
    </div> : null}
  </div>;
});

Checkbox.displayName = "Checkbox";
