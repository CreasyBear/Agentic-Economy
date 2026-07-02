import {
  Children,
  useCallback,
  useState,
  type ComponentProps,
  type FormEvent,
  type HTMLAttributes,
  type KeyboardEventHandler,
  type ReactNode,
} from 'react'
import { CornerDownLeftIcon, SquareIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type PromptInputStatus = 'ready' | 'submitted' | 'streaming' | 'error'

export type PromptInputMessage = {
  text: string
}

export type PromptInputProps = Omit<
  ComponentProps<'form'>,
  'onSubmit'
> & {
  onSubmit: (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => void
}

export function PromptInput({
  className,
  children,
  onSubmit,
  ...props
}: PromptInputProps) {
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const formData = new FormData(event.currentTarget)
      const text =
        String(formData.get('message') ?? formData.get('q') ?? '').trim()
      onSubmit({ text }, event)
    },
    [onSubmit],
  )

  return (
    <form
      data-slot="prompt-input"
      className={cn('w-full', className)}
      onSubmit={handleSubmit}
      {...props}
    >
      <InputGroup className="ae-answer-prompt-input__group overflow-hidden">{children}</InputGroup>
    </form>
  )
}

export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>

export function PromptInputBody({ className, ...props }: PromptInputBodyProps) {
  return <div className={cn('contents', className)} {...props} />
}

export type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>

export function PromptInputTextarea({
  className,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  placeholder = 'What would you like to know?',
  ...props
}: PromptInputTextareaProps) {
  const [isComposing, setIsComposing] = useState(false)

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      onKeyDown?.(event)
      if (event.defaultPrevented) {
        return
      }

      if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !isComposing &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault()
        event.currentTarget.form?.requestSubmit()
      }
    },
    [isComposing, onKeyDown],
  )

  return (
    <InputGroupTextarea
      className={cn('field-sizing-content max-h-48 min-h-10', className)}
      name="message"
      placeholder={placeholder}
      onCompositionStart={(event) => {
        setIsComposing(true)
        onCompositionStart?.(event)
      }}
      onCompositionEnd={(event) => {
        setIsComposing(false)
        onCompositionEnd?.(event)
      }}
      onKeyDown={handleKeyDown}
      {...props}
    />
  )
}

export type PromptInputHeaderProps = Omit<
  ComponentProps<typeof InputGroupAddon>,
  'align'
>

export function PromptInputHeader({ className, ...props }: PromptInputHeaderProps) {
  return (
    <InputGroupAddon
      align="block-start"
      className={cn('flex-wrap justify-between gap-2', className)}
      {...props}
    />
  )
}

export type PromptInputFooterProps = Omit<
  ComponentProps<typeof InputGroupAddon>,
  'align'
>

export function PromptInputFooter({ className, ...props }: PromptInputFooterProps) {
  return (
    <InputGroupAddon
      align="block-end"
      className={cn('justify-between gap-2', className)}
      {...props}
    />
  )
}

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>

export function PromptInputTools({ className, ...props }: PromptInputToolsProps) {
  return (
    <div
      data-slot="prompt-input-tools"
      className={cn('flex min-w-0 items-center gap-1', className)}
      {...props}
    />
  )
}

export type PromptInputButtonTooltip =
  | string
  | {
      content: ReactNode
      shortcut?: string
      side?: ComponentProps<typeof TooltipContent>['side']
    }

export type PromptInputButtonProps = ComponentProps<typeof InputGroupButton> & {
  tooltip?: PromptInputButtonTooltip
}

export function PromptInputButton({
  variant = 'ghost',
  size,
  tooltip,
  className,
  ...props
}: PromptInputButtonProps) {
  const resolvedSize =
    size ?? (Children.count(props.children) > 1 ? 'sm' : 'icon-sm')
  const button = (
    <InputGroupButton
      type="button"
      variant={variant}
      size={resolvedSize}
      className={cn(className)}
      {...props}
    />
  )

  if (tooltip === undefined) {
    return button
  }

  const content = typeof tooltip === 'string' ? tooltip : tooltip.content
  const shortcut = typeof tooltip === 'string' ? undefined : tooltip.shortcut
  const side = typeof tooltip === 'string' ? 'top' : (tooltip.side ?? 'top')

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side={side}>
          {content}
          {shortcut === undefined ? null : (
            <span className="ml-2 text-muted-foreground">{shortcut}</span>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  status?: PromptInputStatus
  onStop?: () => void
}

export function PromptInputSubmit({
  className,
  variant = 'default',
  size = 'icon-sm',
  status = 'ready',
  onStop,
  onClick,
  children,
  ...props
}: PromptInputSubmitProps) {
  const generating = status === 'submitted' || status === 'streaming'
  const icon =
    status === 'submitted' ? (
      <Spinner />
    ) : status === 'streaming' ? (
      <SquareIcon data-icon="only" />
    ) : status === 'error' ? (
      <XIcon data-icon="only" />
    ) : (
      <CornerDownLeftIcon data-icon="only" />
    )

  return (
    <InputGroupButton
      aria-label={generating ? 'Stop' : 'Submit'}
      type={generating && onStop !== undefined ? 'button' : 'submit'}
      variant={variant}
      size={size}
      className={cn(className)}
      onClick={(event) => {
        if (generating && onStop !== undefined) {
          event.preventDefault()
          onStop()
          return
        }
        onClick?.(event)
      }}
      {...props}
    >
      {children ?? icon}
    </InputGroupButton>
  )
}

export type PromptInputActionProps = ComponentProps<typeof Button>

export function PromptInputAction({
  variant = 'ghost',
  size = 'sm',
  className,
  ...props
}: PromptInputActionProps) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(className)}
      {...props}
    />
  )
}
