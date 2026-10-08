import { useWorkspacePresentationVisible } from "@/lib/client/workspace-presentation"
import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import type { DialogRoot } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type DialogLegacyDismissHandlers = {
  onPointerDownOutside?: (event: Event) => void
  onEscapeKeyDown?: (event: Event) => void
}

const DialogLegacyDismissRegistrationContext = React.createContext<
  ((handlers: DialogLegacyDismissHandlers | null) => void) | null
>(null)

function legacyDismissEvent(cancel: () => void): Event {
  return {
    preventDefault() {
      cancel()
    },
  } as Event
}

function runLegacyDismissHandlers(
  handlers: DialogLegacyDismissHandlers,
  open: boolean,
  eventDetails: DialogRoot.ChangeEventDetails,
) {
  if (open) {
    return
  }
  const { onPointerDownOutside, onEscapeKeyDown } = handlers
  if (eventDetails.reason === "outside-press" && onPointerDownOutside !== undefined) {
    onPointerDownOutside(legacyDismissEvent(() => eventDetails.cancel()))
  }
  if (eventDetails.reason === "escape-key" && onEscapeKeyDown !== undefined) {
    onEscapeKeyDown(legacyDismissEvent(() => eventDetails.cancel()))
  }
}

function DialogLegacyDismissRegistration({
  onPointerDownOutside,
  onEscapeKeyDown,
}: DialogLegacyDismissHandlers) {
  const register = React.useContext(DialogLegacyDismissRegistrationContext)

  React.useLayoutEffect(() => {
    register?.({
      ...(onPointerDownOutside !== undefined ? { onPointerDownOutside } : {}),
      ...(onEscapeKeyDown !== undefined ? { onEscapeKeyDown } : {}),
    })
    return () => {
      register?.(null)
    }
  }, [register, onPointerDownOutside, onEscapeKeyDown])

  return null
}

function finalFocusFromCloseAutoFocus(
  onCloseAutoFocus?: (event: Event) => void,
): DialogPrimitive.Popup.Props["finalFocus"] {
  if (onCloseAutoFocus === undefined) {
    return undefined
  }
  return () => {
    let defaultPrevented = false
    const event = {
      preventDefault() {
        defaultPrevented = true
      },
    } as Event
    onCloseAutoFocus(event)
    if (defaultPrevented) {
      return false
    }
    return true
  }
}

function Dialog({
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const legacyHandlersRef = React.useRef<DialogLegacyDismissHandlers>({})
  const registerLegacyHandlers = React.useCallback(
    (handlers: DialogLegacyDismissHandlers | null) => {
      legacyHandlersRef.current = handlers ?? {}
    },
    [],
  )
  const handleOpenChange = React.useCallback<NonNullable<DialogRoot.Props["onOpenChange"]>>(
    (open, eventDetails) => {
      runLegacyDismissHandlers(legacyHandlersRef.current, open, eventDetails)
      onOpenChange?.(open, eventDetails)
    },
    [onOpenChange],
  )

  return (
    <DialogLegacyDismissRegistrationContext.Provider value={registerLegacyHandlers}>
      <DialogPrimitive.Root data-slot="dialog" onOpenChange={handleOpenChange} {...props} />
    </DialogLegacyDismissRegistrationContext.Provider>
  )
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  const visible = useWorkspacePresentationVisible()
  if (!visible) return null
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogBackdrop({
  className,
  instant = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Backdrop> & {
  instant?: boolean
}) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-backdrop"
      data-dialog-overlay="true"
      className={cn(
        "fixed inset-0 z-50 bg-[var(--ae-overlay-scrim)] backdrop-blur-sm ease-standard data-closed:pointer-events-none motion-reduce:animate-none",
        className,
        !instant &&
          "duration-base data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0",
        instant && "animate-none duration-0",
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  instant = false,
  onCloseAutoFocus,
  onPointerDownOutside,
  onEscapeKeyDown,
  finalFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Popup> & {
  showCloseButton?: boolean
  instant?: boolean
  onCloseAutoFocus?: (event: Event) => void
  onPointerDownOutside?: (event: Event) => void
  onEscapeKeyDown?: (event: Event) => void
}) {
  const resolvedFinalFocus =
    finalFocus ?? finalFocusFromCloseAutoFocus(onCloseAutoFocus)

  return (
    <DialogPortal data-slot="dialog-portal">
      {(onPointerDownOutside !== undefined || onEscapeKeyDown !== undefined) ? (
        <DialogLegacyDismissRegistration
          {...(onPointerDownOutside !== undefined
            ? { onPointerDownOutside }
            : {})}
          {...(onEscapeKeyDown !== undefined ? { onEscapeKeyDown } : {})}
        />
      ) : null}
      <DialogBackdrop instant={instant} />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        finalFocus={resolvedFinalFocus}
        className={cn(
          "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overscroll-contain rounded-xl bg-popover p-6 text-popover-foreground shadow-overlay ease-emphasized outline-none data-closed:pointer-events-none motion-reduce:animate-none sm:max-w-lg",
          className,
          !instant &&
            "duration-base data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
          instant && "animate-none duration-0",
        )}
        {...props}
        aria-modal="true"
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-md opacity-70 transition-[color,background-color,opacity,transform] duration-fast ease-standard outline-none hover:opacity-100 active:scale-[0.96] disabled:active:scale-100 motion-reduce:active:scale-100 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none data-open:bg-accent data-open:text-muted-foreground max-sm:min-h-touch max-sm:min-w-touch [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon aria-hidden="true" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <DialogClose render={<Button variant="outline">Close</Button>} />
      ) : null}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-medium", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
