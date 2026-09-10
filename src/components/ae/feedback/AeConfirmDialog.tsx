import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRef, type RefObject } from "react";

type AeConfirmDialogProps = {
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
}: AeConfirmDialogProps) {
  const confirmationInFlightRef = useRef(false);

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
        onCloseAutoFocus={returnFocusRef === undefined && returnFocusFallbackRefs.length === 0
          ? undefined
          : (event) => {
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
            }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button" disabled={pending}>
            {cancelLabel}
          </AlertDialogCancel>
          {showConfirm ? (
            <AlertDialogAction
              type="button"
              variant={confirmVariant}
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirm();
              }}
            >
              {pending ? "Working…" : confirmLabel}
            </AlertDialogAction>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
