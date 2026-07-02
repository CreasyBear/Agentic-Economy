import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { ChevronDownIcon, RouteIcon } from 'lucide-react'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { Shimmer } from './shimmer'

type ReasoningContextValue = {
  isStreaming: boolean
  isOpen: boolean
  duration?: number
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null)

function useReasoning() {
  const context = useContext(ReasoningContext)
  if (context === null) {
    throw new Error('Reasoning components must be used inside Reasoning')
  }
  return context
}

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean
  open?: boolean
  defaultOpen?: boolean
  duration?: number
}

const AUTO_CLOSE_DELAY_MS = 1000

export const Reasoning = memo(function Reasoning({
  className,
  isStreaming = false,
  open,
  defaultOpen,
  duration,
  onOpenChange,
  children,
  ...props
}: ReasoningProps) {
  const controlled = open !== undefined
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen ?? isStreaming)
  const [measuredDuration, setMeasuredDuration] = useState<number | undefined>(duration)
  const startTimeRef = useRef<number | null>(isStreaming ? Date.now() : null)
  const isOpen = controlled ? open : uncontrolledOpen

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) {
        setUncontrolledOpen(next)
      }
      onOpenChange?.(next)
    },
    [controlled, onOpenChange],
  )

  useEffect(() => {
    if (duration !== undefined) {
      setMeasuredDuration(duration)
    }
  }, [duration])

  useEffect(() => {
    if (isStreaming) {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now()
      }
      if (!isOpen && defaultOpen !== false) {
        setOpen(true)
      }
      return undefined
    }

    if (startTimeRef.current !== null) {
      setMeasuredDuration(Math.max(1, Math.ceil((Date.now() - startTimeRef.current) / 1000)))
      startTimeRef.current = null
    }

    if (!controlled && isOpen) {
      const timer = window.setTimeout(() => setOpen(false), AUTO_CLOSE_DELAY_MS)
      return () => window.clearTimeout(timer)
    }

    return undefined
  }, [controlled, defaultOpen, isOpen, isStreaming, setOpen])

  const value = useMemo<ReasoningContextValue>(
    () => ({
      isOpen,
      isStreaming,
      ...(measuredDuration === undefined ? {} : { duration: measuredDuration }),
    }),
    [isOpen, isStreaming, measuredDuration],
  )

  return (
    <ReasoningContext.Provider value={value}>
      <Collapsible
        className={cn('not-prose', className)}
        open={isOpen}
        onOpenChange={setOpen}
        {...props}
      >
        {children}
      </Collapsible>
    </ReasoningContext.Provider>
  )
})

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  getLabel?: (isStreaming: boolean, duration?: number) => ReactNode
}

function defaultLabel(isStreaming: boolean, duration?: number) {
  if (isStreaming) {
    return <Shimmer as="span">Checking published details</Shimmer>
  }
  return duration === undefined ? 'Checked published details' : `Checked for ${duration}s`
}

export const ReasoningTrigger = memo(function ReasoningTrigger({
  className,
  children,
  getLabel = defaultLabel,
  ...props
}: ReasoningTriggerProps) {
  const { duration, isOpen, isStreaming } = useReasoning()

  return (
    <CollapsibleTrigger
        className={cn(
        'ae-ai-reasoning-trigger flex w-full items-center gap-2 text-sm',
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <RouteIcon data-icon="inline-start" aria-hidden="true" />
          <span>{getLabel(isStreaming, duration)}</span>
          <ChevronDownIcon
            data-icon="inline-end"
            className={cn('transition-transform', isOpen ? 'rotate-180' : 'rotate-0')}
            aria-hidden="true"
          />
        </>
      )}
    </CollapsibleTrigger>
  )
})

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent>

export const ReasoningContent = memo(function ReasoningContent({
  className,
  ...props
}: ReasoningContentProps) {
  return (
    <CollapsibleContent
      className={cn(
        'ae-ai-collapsible-content ae-ai-reasoning-content mt-3 text-sm outline-none',
        className,
      )}
      {...props}
    />
  )
})
