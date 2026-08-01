import { type ComponentProps, type ReactNode } from 'react'
import { AlertCircleIcon, CheckIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

export type AeActionButtonState = 'idle' | 'loading' | 'success' | 'error'
export type AeActionButtonVariant = 'primary' | 'secondary' | 'quiet'

export type AeActionButtonProps = Omit<ComponentProps<typeof Button>, 'children' | 'disabled' | 'variant'> & {
  state?: AeActionButtonState
  variant?: AeActionButtonVariant
  label?: string
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  children: ReactNode
  disabled?: boolean
}

const buttonVariantByActionVariant: Record<AeActionButtonVariant, 'default' | 'secondary' | 'ghost'> = {
  primary: 'default',
  secondary: 'secondary',
  quiet: 'ghost',
}

export function AeActionButton({
  state = 'idle',
  variant = 'primary',
  label,
  leadingIcon,
  trailingIcon,
  children,
  disabled,
  ...props
}: AeActionButtonProps) {
  const busy = state === 'loading'
  const accessibleLabel = label ?? (typeof children === 'string' ? children : 'Action')
  const icon = busy ? <Spinner data-icon="inline-start" aria-label="Loading" /> : stateIcon(state, leadingIcon)

  return (
    <Button
      variant={buttonVariantByActionVariant[variant]}
      aria-label={accessibleLabel}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      data-state={state}
      {...props}
    >
      {icon}
      {children}
      {trailingIcon}
    </Button>
  )
}

function stateIcon(state: AeActionButtonState, fallback: ReactNode) {
  switch (state) {
    case 'loading':
      return null
    case 'success':
      return <CheckIcon data-icon="inline-start" aria-hidden="true" />
    case 'error':
      return <AlertCircleIcon data-icon="inline-start" aria-hidden="true" />
    case 'idle':
      return fallback
  }
}
