/* Arc dialog panel/header/body composition over the existing Base UI alert
 * primitive. Requires caller-owned decision facts and outcomes; ensures the
 * same duplicate guard, pending dismissal guard and connected focus return. */
import { useWorkspacePresentationVisible } from "@/lib/client/workspace-presentation";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@/components/arc/button/button";
import type { Rule4Diagnostic } from "@/lib/ui/diagnostic";
import { useRef, type ReactNode, type RefObject } from "react";
import "./ConfirmComposition.css";

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
  const visible = useWorkspacePresentationVisible();
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

  if (!visible) return null;
  return (
    <AlertDialog.Root open={open} onOpenChange={handleOpenChange}>
      <AlertDialog.Portal>
      <AlertDialog.Backdrop className="arc-market arc-confirm-backdrop" />
      <AlertDialog.Popup
        className="arc-market arc-confirm-dialog"
        data-slot="alert-dialog-content"
        {...(returnFocusRef !== undefined || returnFocusFallbackRefs.length > 0
          ? {
              finalFocus: () => {
                const targets = [returnFocusRef, ...returnFocusFallbackRefs];
                const target = targets
                  .map((ref) => ref?.current)
                  .find((element) => element !== null
                    && element !== undefined
                    && element.isConnected
                    && element !== document.body
                    && !(element instanceof HTMLButtonElement && element.disabled));
                target?.focus();
                return false;
              },
            }
          : {})}
      >
        <header className="arc-confirm-header">
          <AlertDialog.Title className="arc-confirm-title">{title}</AlertDialog.Title>
          <AlertDialog.Description className="arc-confirm-description">{description}</AlertDialog.Description>
        </header>
          {extendedBody ? (
            <div className="arc-confirm-body">
              {children !== undefined ? (
                <div className="arc-confirm-context">{children}</div>
              ) : null}
              {financialImpact !== undefined ? (
                <div className="arc-confirm-impact">
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
            </div>
          ) : null}
        <footer className="arc-confirm-actions">
          <AlertDialog.Close type="button" disabled={pending} render={<Button variant="secondary" />}>
            {cancelLabel}
          </AlertDialog.Close>
          {showConfirm ? (
            <Button
              type="button"
              variant={confirmVariant === "destructive" ? "danger" : "primary"}
              disabled={pending}
              aria-busy={pending || undefined}
              onClick={() => {
                void handleConfirm();
              }}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          ) : null}
        </footer>
      </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
