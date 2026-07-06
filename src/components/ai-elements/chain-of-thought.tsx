import {
  createContext,
  memo,
  use,
  useCallback,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { ChevronDownIcon, DotIcon, type LucideIcon } from 'lucide-react'

import {
  AeCollapsible as Collapsible,
  AeCollapsibleContent as CollapsibleContent,
  AeCollapsibleTrigger as CollapsibleTrigger,
} from '@/components/ae/primitives/AeCollapsible'
import { cn } from '@/lib/utils'

/**
 * Chain-of-Thought primitives, adapted from ai-elements onto AE's Collapsible
 * and Astryx token bridge. Presentation only: it renders whatever sanitized
 * steps the caller feeds it. On AE surfaces this shows the public check trace
 * ("How AE checked this"), never hidden model reasoning.
 */

type ChainOfThoughtContextValue = {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(null)

function useChainOfThought(): ChainOfThoughtContextValue {
  const context = use(ChainOfThoughtContext)
  if (context === null) {
    throw new Error('ChainOfThought components must be used inside ChainOfThought')
  }
  return context
}

export type ChainOfThoughtProps = ComponentProps<'div'> & {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export const ChainOfThought = memo(function ChainOfThought({
  className,
  open,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}: ChainOfThoughtProps) {
  const controlled = open !== undefined
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isOpen = controlled ? open : uncontrolledOpen

  const setIsOpen = useCallback(
    (next: boolean) => {
      if (!controlled) {
        setUncontrolledOpen(next)
      }
      onOpenChange?.(next)
    },
    [controlled, onOpenChange],
  )

  const value = useMemo<ChainOfThoughtContextValue>(() => ({ isOpen, setIsOpen }), [isOpen, setIsOpen])

  return (
    <ChainOfThoughtContext.Provider value={value}>
      <div className={cn('not-prose w-full', className)} {...props}>
        {children}
      </div>
    </ChainOfThoughtContext.Provider>
  )
})

export type ChainOfThoughtHeaderProps = ComponentProps<typeof CollapsibleTrigger> & {
  icon?: LucideIcon | null
}

export const ChainOfThoughtHeader = memo(function ChainOfThoughtHeader({
  className,
  children,
  icon,
  ...props
}: ChainOfThoughtHeaderProps) {
  const { isOpen, setIsOpen } = useChainOfThought()
  const Icon = icon

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-2 text-left text-sm text-secondary transition-colors hover:text-primary',
          className,
        )}
        {...props}
      >
        {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
        <span className="min-w-0 flex-1">{children}</span>
        <ChevronDownIcon
          className={cn('size-4 shrink-0 transition-transform', isOpen ? 'rotate-180' : 'rotate-0')}
          aria-hidden="true"
        />
      </CollapsibleTrigger>
    </Collapsible>
  )
})

export type ChainOfThoughtStepProps = ComponentProps<'div'> & {
  icon?: LucideIcon
  label: ReactNode
  description?: ReactNode
  status?: 'complete' | 'active' | 'pending' | 'error'
  connector?: boolean
  spinning?: boolean
}

const stepStatusStyles: Record<NonNullable<ChainOfThoughtStepProps['status']>, string> = {
  active: 'text-primary',
  complete: 'text-secondary',
  pending: 'text-secondary/50',
  error: 'text-red-vivid',
}

export const ChainOfThoughtStep = memo(function ChainOfThoughtStep({
  className,
  icon: Icon = DotIcon,
  label,
  description,
  status = 'complete',
  connector = true,
  spinning = false,
  children,
  ...props
}: ChainOfThoughtStepProps) {
  return (
    <div
      data-status={status}
      className={cn(
        'flex gap-2 text-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-300',
        stepStatusStyles[status],
        className,
      )}
      {...props}
    >
      <div className="relative mt-0.5 shrink-0">
        <Icon className={cn('size-4', spinning && 'motion-safe:animate-spin')} aria-hidden="true" />
        {connector ? <div className="absolute top-6 bottom-[-0.75rem] left-1/2 -mx-px w-px bg-border" /> : null}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="leading-snug text-primary">{label}</div>
        {description ? <div className="text-xs leading-snug text-secondary">{description}</div> : null}
        {children}
      </div>
    </div>
  )
})

export type ChainOfThoughtContentProps = ComponentProps<typeof CollapsibleContent>

export const ChainOfThoughtContent = memo(function ChainOfThoughtContent({
  className,
  children,
  ...props
}: ChainOfThoughtContentProps) {
  const { isOpen } = useChainOfThought()

  return (
    <Collapsible open={isOpen}>
      <CollapsibleContent className={cn('mt-3 space-y-3', className)} {...props}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
})
