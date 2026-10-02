/* Adapted from Arc UI drawer source SHA-256: ed9ec15831a21f46582a13f4839e2f22a1b9579822fddad69ab05d83015993ce; source retrieved 2026-10-01. */
"use client";

import { forwardRef } from "react";
import type { ComponentProps, ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import type { DialogPopupState } from "@base-ui/react/dialog";

import styles from "./Drawer.module.css";

export const Drawer = Dialog.Root;
export const DrawerTrigger = Dialog.Trigger;
export const DrawerClose = Dialog.Close;

type DrawerSide = "left" | "right" | "top" | "bottom";

export type DrawerContentProps = ComponentProps<typeof Dialog.Popup> & {
  title: string;
  description?: string;
  closeLabel?: string;
  children: ReactNode;
  side?: DrawerSide;
};

type PopupClassName = ComponentProps<typeof Dialog.Popup>["className"];

function composePopupClassName(className: PopupClassName): PopupClassName {
  const baseClasses = ["arc-market", styles.content, styles.keyframes];

  if (typeof className === "function") {
    return (state: DialogPopupState) =>
      [...baseClasses, className(state)].filter(Boolean).join(" ");
  }

  return [...baseClasses, className].filter(Boolean).join(" ");
}

export const DrawerContent = forwardRef<HTMLDivElement, DrawerContentProps>(
  function DrawerContent(
    { title, description, closeLabel = "Close", children, side = "right", className, ...props },
    ref,
  ) {
    return (
      <Dialog.Portal>
        <Dialog.Backdrop
          className={`arc-market ${styles.overlay} ${styles.keyframes}`}
        />
        <Dialog.Popup
          {...props}
          ref={ref}
          data-side={side}
          className={composePopupClassName(className)}
        >
          <header className={styles.header}>
            <div>
              <Dialog.Title className={styles.title}>{title}</Dialog.Title>
              {description === undefined ? null : (
                <Dialog.Description className={styles.description}>
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              type="button"
              className={styles.close}
              aria-label={closeLabel}
            >
              <X size={18} strokeWidth={1.8} aria-hidden="true" />
              <span className="sr-only">{closeLabel}</span>
            </Dialog.Close>
          </header>
          <div className={styles.body}>{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    );
  },
);

DrawerContent.displayName = "DrawerContent";
