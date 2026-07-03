import * as React from 'react'

import { cn } from '@/lib/utils'

type AeCollapsibleContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const AeCollapsibleContext = React.createContext<AeCollapsibleContextValue | null>(null)

export type AeCollapsibleProps = React.ComponentPropsWithoutRef<'div'> & {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export function AeCollapsible({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}: AeCollapsibleProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen)
  const open = controlledOpen ?? internalOpen

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setInternalOpen(nextOpen)
      }
      onOpenChange?.(nextOpen)
    },
    [controlledOpen, onOpenChange],
  )

  const value = React.useMemo(() => ({ open, setOpen }), [open, setOpen])

  return (
    <AeCollapsibleContext.Provider value={value}>
      <div data-state={open ? 'open' : 'closed'} {...props}>
        {children}
      </div>
    </AeCollapsibleContext.Provider>
  )
}

export type AeCollapsibleTriggerProps = React.ComponentPropsWithoutRef<'button'> & {
  asChild?: boolean
}

export function AeCollapsibleTrigger({
  asChild = false,
  children,
  className,
  onClick,
  type = 'button',
  ...props
}: AeCollapsibleTriggerProps) {
  const context = React.use(AeCollapsibleContext)

  const triggerProps = {
    ...props,
    type,
    'aria-expanded': context?.open,
    'data-state': context?.open ? 'open' : 'closed',
    className,
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event)
      if (!event.defaultPrevented && context !== null) {
        context.setOpen(!context.open)
      }
    },
  }

  if (asChild && React.isValidElement<{ className?: string; onClick?: React.MouseEventHandler<HTMLButtonElement> }>(children)) {
    return React.cloneElement(children, {
      ...triggerProps,
      className: cn(className, children.props.className),
    })
  }

  return <button {...triggerProps}>{children}</button>
}

export type AeCollapsibleContentProps = React.ComponentPropsWithoutRef<'div'>

export function AeCollapsibleContent({ className, ...props }: AeCollapsibleContentProps) {
  const context = React.use(AeCollapsibleContext)

  if (context?.open === false) {
    return null
  }

  return <div data-state="open" className={className} {...props} />
}
