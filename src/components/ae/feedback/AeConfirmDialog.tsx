import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { Rule4Diagnostic } from "@/lib/ui/diagnostic";
import { cn } from "@/lib/utils";
import { useRef, type ReactNode, type RefObject } from "react";

export const TACTILE =
  "enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100";

export type AeConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: "default" | "destructive";
  showConfirm?: boolean;
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  returnFocusFallbackRefs?: readonly RefObject<HTMLElement | null>[];
  children?: ReactNode;
  financialImpact?: ReactNode;
  diagnostic?: Rule4Diagnostic | null;
};

export function AeConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmVariant = "default",
  showConfirm = true,
  pending = false,
  onConfirm,
  returnFocusRef,
  returnFocusFallbackRefs = [],
  children,
  financialImpact,
  diagnostic = null,
}: AeConfirmDialogProps) {
  const confirmationInFlightRef = useRef(false);
  const extendedBody =
    children != null || financialImpact != null || diagnostic != null;

  function handleOpenChange(nextOpen: boolean) {
    if (pending && !nextOpen) {
      return;
    }

    onOpenChange(nextOpen);
  }

  async function handleConfirm() {
    if (pending || confirmationInFlightRef.current) {
      return;
    }
    confirmationInFlightRef.current = true;
    try {
      await onConfirm();
    } finally {
      confirmationInFlightRef.current = false;
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        {...(returnFocusRef !== undefined || returnFocusFallbackRefs.length > 0
          ? {
              onCloseAutoFocus: (event) => {
                event.preventDefault();
                const targets = [returnFocusRef, ...returnFocusFallbackRefs];
                const target = targets
                  .map((ref) => ref?.current)
                  .find((element) => element !== null
                    && element !== undefined
                    && element.isConnected
                    && element !== document.body
                    && !(element instanceof HTMLButtonElement && element.disabled));
                target?.focus();
              },
            }
          : {})}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
          {extendedBody ? (
            <>
              {children !== undefined ? (
                <div className="grid gap-2">{children}</div>
              ) : null}
              {financialImpact !== undefined ? (
                <div className="rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
                  {financialImpact}
                </div>
              ) : null}
              {diagnostic ? (
                <div role="status" aria-live="polite">
                  <div className="grid gap-1 text-sm text-muted-foreground">
                    <p>
                      <strong>What happened:</strong> {diagnostic.whatHappened}
                    </p>
                    <p className="font-mono text-xs tabular-nums">
                      <strong>Financial impact:</strong> {diagnostic.financialImpact}
                    </p>
                    <p>
                      <strong>Next step:</strong> {diagnostic.nextStep}
                    </p>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button" disabled={pending} className={TACTILE}>
            {cancelLabel}
          </AlertDialogCancel>
          {showConfirm ? (
            <Button
              type="button"
              variant={confirmVariant}
              disabled={pending}
              className={cn("min-w-[11rem]", TACTILE)}
              onClick={() => {
                void handleConfirm();
              }}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
