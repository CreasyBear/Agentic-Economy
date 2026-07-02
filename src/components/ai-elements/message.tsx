import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type MessageRole = 'user' | 'assistant' | 'system'

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: MessageRole
}

export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      data-slot="ai-message"
      data-from={from}
      className={cn(
        'ae-ai-message group/ai-message flex w-full flex-col gap-2',
        `ae-ai-message--${from}`,
        from === 'user' ? 'ml-auto items-end' : 'items-start',
        className,
      )}
      {...props}
    />
  )
}

export type MessageContentProps = HTMLAttributes<HTMLDivElement>

export function MessageContent({ className, ...props }: MessageContentProps) {
  return (
    <div
      data-slot="ai-message-content"
      className={cn(
        'ae-ai-message__content flex max-w-full min-w-0 flex-col gap-2 text-sm leading-relaxed wrap-break-word',
        className,
      )}
      {...props}
    />
  )
}

export type MessageActionsProps = ComponentProps<'div'>

export function MessageActions({ className, ...props }: MessageActionsProps) {
  return (
    <div
      data-slot="ai-message-actions"
      className={cn('flex items-center gap-1', className)}
      {...props}
    />
  )
}

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string
  label?: string
}

export function MessageAction({
  tooltip,
  label,
  children,
  variant = 'ghost',
  size = 'icon-sm',
  ...props
}: MessageActionProps) {
  const button = (
    <Button type="button" variant={variant} size={size} {...props}>
      {children}
      <span className="sr-only">{label ?? tooltip}</span>
    </Button>
  )

  if (tooltip === undefined) {
    return button
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

type MessageBranchContextValue = {
  currentBranch: number
  totalBranches: number
  branches: ReactElement[]
  setBranches: (branches: ReactElement[]) => void
  goToPrevious: () => void
  goToNext: () => void
}

const MessageBranchContext = createContext<MessageBranchContextValue | null>(null)

function useMessageBranch() {
  const context = useContext(MessageBranchContext)
  if (context === null) {
    throw new Error('MessageBranch components must be used inside MessageBranch')
  }
  return context
}

export type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
  defaultBranch?: number
  onBranchChange?: (branchIndex: number) => void
}

export function MessageBranch({
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: MessageBranchProps) {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch)
  const [branches, setBranches] = useState<ReactElement[]>([])

  const changeBranch = useCallback(
    (next: number) => {
      setCurrentBranch(next)
      onBranchChange?.(next)
    },
    [onBranchChange],
  )

  const goToPrevious = useCallback(() => {
    changeBranch(currentBranch > 0 ? currentBranch - 1 : branches.length - 1)
  }, [branches.length, changeBranch, currentBranch])

  const goToNext = useCallback(() => {
    changeBranch(currentBranch < branches.length - 1 ? currentBranch + 1 : 0)
  }, [branches.length, changeBranch, currentBranch])

  const value = useMemo<MessageBranchContextValue>(
    () => ({
      branches,
      currentBranch,
      goToNext,
      goToPrevious,
      setBranches,
      totalBranches: branches.length,
    }),
    [branches, currentBranch, goToNext, goToPrevious],
  )

  return (
    <MessageBranchContext.Provider value={value}>
      <div className={cn('grid w-full gap-2', className)} {...props} />
    </MessageBranchContext.Provider>
  )
}

export type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>

export function MessageBranchContent({ children, ...props }: MessageBranchContentProps) {
  const { branches, currentBranch, setBranches } = useMessageBranch()
  const childrenArray = useMemo(
    () => (Array.isArray(children) ? children : [children]).filter(Boolean) as ReactElement[],
    [children],
  )

  useEffect(() => {
    if (branches.length !== childrenArray.length) {
      setBranches(childrenArray)
    }
  }, [branches.length, childrenArray, setBranches])

  return childrenArray.map((branch, index) => (
    <div
      key={branch.key ?? index}
      className={cn('grid gap-2 overflow-hidden', index === currentBranch ? 'block' : 'hidden')}
      {...props}
    >
      {branch}
    </div>
  ))
}

export type MessageBranchSelectorProps = HTMLAttributes<HTMLDivElement>

export function MessageBranchSelector({ className, ...props }: MessageBranchSelectorProps) {
  const { totalBranches } = useMessageBranch()
  if (totalBranches <= 1) {
    return null
  }

  return (
    <div
      data-slot="ai-message-branch-selector"
      className={cn('flex items-center gap-1', className)}
      {...props}
    />
  )
}

export type MessageBranchPreviousProps = ComponentProps<typeof Button>

export function MessageBranchPrevious({ children, ...props }: MessageBranchPreviousProps) {
  const { goToPrevious, totalBranches } = useMessageBranch()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Previous response"
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      {...props}
    >
      {children ?? <ChevronLeftIcon data-icon="only" />}
    </Button>
  )
}

export type MessageBranchNextProps = ComponentProps<typeof Button>

export function MessageBranchNext({ children, ...props }: MessageBranchNextProps) {
  const { goToNext, totalBranches } = useMessageBranch()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Next response"
      disabled={totalBranches <= 1}
      onClick={goToNext}
      {...props}
    >
      {children ?? <ChevronRightIcon data-icon="only" />}
    </Button>
  )
}

export type MessageBranchPageProps = HTMLAttributes<HTMLSpanElement>

export function MessageBranchPage({ className, ...props }: MessageBranchPageProps) {
  const { currentBranch, totalBranches } = useMessageBranch()

  return (
    <span className={cn('px-2 text-xs text-muted-foreground', className)} {...props}>
      {currentBranch + 1} of {totalBranches}
    </span>
  )
}

export type MessageResponseProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
}

export const MessageResponse = memo(function MessageResponse({
  className,
  children,
  ...props
}: MessageResponseProps) {
  return (
    <div
      className={cn(
        'ae-ai-message__response',
        'size-full text-pretty whitespace-pre-wrap [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
})

export type MessageToolbarProps = ComponentProps<'div'>

export function MessageToolbar({ className, ...props }: MessageToolbarProps) {
  return (
    <div
      data-slot="ai-message-toolbar"
      className={cn('mt-3 flex w-full items-center justify-between gap-4', className)}
      {...props}
    />
  )
}
