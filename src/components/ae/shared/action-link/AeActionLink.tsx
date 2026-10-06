import { cloneElement } from 'react'
import type { MouseEvent, ReactElement } from 'react'

import { Button } from '@/components/arc/button/button'

import { cn } from '@/lib/utils'

import type { AeActionLinkComposedChildProps, AeActionLinkProps } from './action-link.contracts'
import styles from './action-link.module.css'

export function AeActionLink(props: AeActionLinkProps) {
  if (props.onAction !== undefined) {
    const {
      onAction,
      pending = false,
      labelLayout,
      children,
      variant = 'primary',
      size = 'md',
      type = 'button',
      disabled,
      className,
      'aria-busy': ariaBusy,
      'aria-disabled': ariaDisabled,
      ...buttonProps
    } = props
    const inert = pending || disabled === true || ariaDisabled === true || ariaDisabled === 'true'
    const handleAction = (event: MouseEvent<HTMLButtonElement>) => {
      if (inert) {
        event.preventDefault()
        return
      }
      onAction(event)
    }

    if (labelLayout === undefined) {
      return (
        <Button
          {...buttonProps}
          type={type}
          variant={variant}
          size={size}
          loading={pending}
          disabled={disabled}
          aria-busy={pending || ariaBusy || undefined}
          aria-disabled={pending || ariaDisabled || undefined}
          className={cn(styles.arcAction, className)}
          onClick={handleAction}
        >
          {children}
        </Button>
      )
    }

    return (
      <button
        {...buttonProps}
        type={type}
        disabled={disabled}
        aria-busy={pending || ariaBusy || undefined}
        aria-disabled={pending || ariaDisabled || undefined}
        className={cn(styles.action, styles[variant], styles[size], styles[labelLayout], className)}
        onClick={handleAction}
      >
        <span className={styles.label}>
          {pending ? <span className={styles.spinner} aria-hidden="true" /> : null}
          {children}
        </span>
      </button>
    )
  }

  if (props.asChild) {
    const child = props.children as ReactElement<AeActionLinkComposedChildProps>
    if (child.type !== 'a' && child.props.href === undefined && child.props.to === undefined) {
      throw new Error('AeActionLink asChild requires an anchor or router Link child.')
    }
    const variant = props.variant ?? 'primary'
    const size = props.size ?? 'md'
    const linkClassName = cn(styles.link, styles[variant], styles[size], props.className)
    const childClassName = child.props.className
    const className = typeof childClassName === 'function'
      ? (state: unknown) => cn(linkClassName, (childClassName as (state: unknown) => string)(state))
      : cn(linkClassName, typeof childClassName === 'string' ? childClassName : undefined)
    return cloneElement(child, { className })
  }

  const {
    href,
    children,
    className,
    variant = 'primary',
    size = 'md',
    asChild: _asChild,
    onAction: _onAction,
    ...anchorProps
  } = props
  void _asChild
  void _onAction
  const linkClassName = cn(styles.link, styles[variant], styles[size], className)
  return (
    <a {...anchorProps} href={href} className={linkClassName}>
      {children}
    </a>
  )
}
