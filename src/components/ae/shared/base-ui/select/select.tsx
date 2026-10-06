/* Actual Arc registry source retrieved 2026-10-02; upstream file SHA-256: ce979731b099e9c7b4a5e40f051c4048f61c794b1ab6c4c57376a77d9801a99a. */
"use client";

import { forwardRef, useId, useState } from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Variants } from "motion/react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { motionTokens } from "@/components/arc/lib/motion-tokens";
import styles from "./select.module.css";

export interface SelectProps extends Omit<SelectPrimitive.Root.Props<string, false>, "children" | "items"> {
  label: string;
  description?: string;
  placeholder?: string;
  id?: string;
  className?: string;
  options: { value: string; label: string; disabled?: boolean }[];
}

/** The shown value rolls in the direction of the list: a later option rises from below, an earlier one drops from above. */
const valueRoll: Variants = {
  enter: (direction: number) => ({ opacity: 0, y: `${direction * 0.35}em`, filter: `blur(${motionTokens.blur.soft}px)` }),
  center: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] } },
  exit: (direction: number) => ({ opacity: 0, y: `${direction * -0.3}em`, filter: `blur(${motionTokens.blur.subtle}px)`, transition: { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard] } }),
};
/** Reduced motion keeps a short crossfade; the resting state matches valueRoll so server and client markup agree. */
const valueFade: Variants = { enter: { opacity: 0 }, center: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: motionTokens.duration.instant } }, exit: { opacity: 0, transition: { duration: motionTokens.duration.instant } } };

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  { label, description, placeholder = "Select an option", options, id, className, disabled, onValueChange, ...rootProps },
  ref,
) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = description ? `${controlId}-description` : undefined;
  const reduceMotion = useReducedMotion();
  const [uncontrolledValue, setUncontrolledValue] = useState(rootProps.defaultValue ?? "");
  const currentValue = rootProps.value ?? uncontrolledValue;
  const index = options.findIndex((option) => option.value === currentValue);
  const shown = currentValue ? options[index]?.label ?? "" : placeholder;
  const [previousIndex, setPreviousIndex] = useState(index);
  const [direction, setDirection] = useState(1);
  if (previousIndex !== index) { setPreviousIndex(index); setDirection(index > previousIndex ? 1 : -1); }

  return (
    <div className={styles.field}>
      <label htmlFor={controlId}>{label}</label>
      <SelectPrimitive.Root {...rootProps} items={options} disabled={disabled} onValueChange={(next, details) => { setUncontrolledValue(next ?? ""); onValueChange?.(next, details); }}>
        <SelectPrimitive.Trigger
          ref={ref}
          id={controlId}
          aria-describedby={hintId}
          className={[styles.trigger, className].filter(Boolean).join(" ")}
        >
          {/* Base UI retains the accessible value while Arc animates its visible copy. */}
          <span className={styles.srOnly}><SelectPrimitive.Value placeholder={placeholder} /></span>
          <span className={styles.valueText} aria-hidden="true">
            <AnimatePresence initial={false} custom={direction}>
              <motion.span key={currentValue ? `value-${currentValue}` : "placeholder"} data-placeholder={currentValue ? undefined : ""} custom={direction} variants={reduceMotion ? valueFade : valueRoll} initial="enter" animate="center" exit="exit">{shown}</motion.span>
            </AnimatePresence>
          </span>
          <span className={styles.chevron}>
            <ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" />
          </span>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Positioner className="arc-market" sideOffset={4} collisionPadding={12} alignItemWithTrigger={false}><SelectPrimitive.Popup className={styles.content}>
            <SelectPrimitive.ScrollUpArrow className={styles.scrollButton}>
              <ChevronUp size={15} strokeWidth={1.8} aria-hidden="true" />
            </SelectPrimitive.ScrollUpArrow>
            <SelectPrimitive.List className={styles.viewport}>
              {options.map((option) => (
                <SelectPrimitive.Item key={option.value} value={option.value} disabled={option.disabled ?? false} className={styles.item}>
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className={styles.indicator}>
                    <Check size={16} strokeWidth={2} aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
            <SelectPrimitive.ScrollDownArrow className={styles.scrollButton}>
              <ChevronDown size={15} strokeWidth={1.8} aria-hidden="true" />
            </SelectPrimitive.ScrollDownArrow>
          </SelectPrimitive.Popup></SelectPrimitive.Positioner>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {description && <span id={hintId} className={styles.hint}>{description}</span>}
    </div>
  );
});
