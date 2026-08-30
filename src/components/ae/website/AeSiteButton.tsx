import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { AeSiteButtonShape } from './AeSiteButtonShape'

const BUTTON_HEIGHT_PX = 44

export type AeSiteButtonVariant = 'filled' | 'outlined'

type AeSiteButtonProps = {
  variant?: AeSiteButtonVariant
  asChild?: boolean
  className?: string
  children: ReactNode
}

type SiteButtonChildProps = {
  className?: string
  children?: ReactNode
}

export function AeSiteButton({
  variant = 'filled',
  asChild = false,
  className,
  children,
}: AeSiteButtonProps) {
  const outlined = variant === 'outlined'
  const label = asChild && isValidElement<SiteButtonChildProps>(children)
    ? children.props.children
    : children
  const inner = (
    <>
      <AeSiteButtonShape heightPx={BUTTON_HEIGHT_PX} outlined={outlined} />
      <span aria-hidden="true" data-slot="hover-layer" className="ae-site-button-hover">
        <span>
          <AeSiteButtonShape heightPx={BUTTON_HEIGHT_PX} />
        </span>
      </span>
      <span data-slot="content" className="relative z-1 inline-flex items-center">
        {label}
      </span>
    </>
  )

  const classes = cn('ae-site-button inline-flex min-h-touch', className)

  if (asChild) {
    const child = Children.only(children)
    if (!isValidElement<SiteButtonChildProps>(child)) {
      throw new Error('AeSiteButton asChild requires a single element child.')
    }
    return cloneElement(child as ReactElement<SiteButtonChildProps>, {
      className: cn(classes, child.props.className),
      children: inner,
      ...siteButtonAttrs(variant),
    })
  }

  return (
    <button type="button" className={classes} {...siteButtonAttrs(variant)}>
      {inner}
    </button>
  )
}

function siteButtonAttrs(variant: AeSiteButtonVariant) {
  return {
    'data-ae-site-button': '',
    'data-variant': variant,
  } as const
}
