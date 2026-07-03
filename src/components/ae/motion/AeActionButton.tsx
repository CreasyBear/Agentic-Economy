import { type ReactNode } from 'react'
import { AlertCircleIcon, CheckIcon } from 'lucide-react'

import { Button, type ButtonProps } from '@astryxdesign/core/Button'

export type AeActionButtonState = 'idle' | 'loading' | 'success' | 'error'
export type AeActionButtonVariant = 'primary' | 'secondary' | 'quiet'

export type AeActionButtonProps = Omit<ButtonProps, 'children' | 'endContent' | 'icon' | 'isDisabled' | 'isLoading' | 'label' | 'variant'> & {
  state?: AeActionButtonState
  variant?: AeActionButtonVariant
  label?: string
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  children: ReactNode
  disabled?: boolean
}

const buttonVariantByActionVariant: Record<AeActionButtonVariant, NonNullable<ButtonProps['variant']>> = {
  primary: 'primary',
  secondary: 'secondary',
  quiet: 'ghost',
}

/** Thin motion/loading wrapper around Astryx `Button` — swaps the leading icon for a spinner/check/alert by state. */
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

  return (
    <Button
      variant={buttonVariantByActionVariant[variant]}
      label={accessibleLabel}
      icon={stateIcon(state, leadingIcon)}
      endContent={trailingIcon}
      isDisabled={disabled || busy}
      isLoading={busy}
      aria-busy={busy || undefined}
      data-state={state}
      {...props}
    >
      {children}
    </Button>
  )
}

function stateIcon(state: AeActionButtonState, fallback: ReactNode) {
  switch (state) {
    case 'loading':
      return undefined
    case 'success':
      return <CheckIcon />
    case 'error':
      return <AlertCircleIcon />
    case 'idle':
      return fallback
  }
}
