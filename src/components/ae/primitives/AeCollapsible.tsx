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

export function AeCollapsibleContent({ className, style, ...props }: AeCollapsibleContentProps) {
  const context = React.use(AeCollapsibleContext)
  const open = context?.open ?? true
  const [present, setPresent] = React.useState(open)
  const [height, setHeight] = React.useState<number | 'auto'>(open ? 'auto' : 0)
  const contentRef = React.useRef<HTMLDivElement>(null)

  React.useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (reduceMotion) {
      setPresent(open)
      setHeight(open ? 'auto' : 0)
      return
    }

    let frame = 0
    let timer = 0

    if (open) {
      setPresent(true)
      setHeight(0)
      frame = window.requestAnimationFrame(() => {
        setHeight(contentRef.current?.scrollHeight ?? 'auto')
        timer = window.setTimeout(() => setHeight('auto'), 200)
      })
    } else {
      const measuredHeight = contentRef.current?.scrollHeight ?? 0
      setHeight(measuredHeight)
      frame = window.requestAnimationFrame(() => {
        setHeight(0)
        timer = window.setTimeout(() => setPresent(false), 180)
      })
    }

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [open])

  if (!present && !open) {
    return null
  }

  return (
    <div
      {...props}
      ref={contentRef}
      data-state={open ? 'open' : 'closed'}
      className={cn('overflow-hidden motion-safe:transition-[height,opacity] motion-safe:duration-200 motion-safe:ease-out', className)}
      style={{ ...style, height, opacity: open ? 1 : 0 }}
      aria-hidden={props['aria-hidden'] ?? (!open ? true : undefined)}
    />
  )
}
