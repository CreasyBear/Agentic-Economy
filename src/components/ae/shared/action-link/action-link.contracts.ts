import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  MouseEventHandler,
  ReactElement,
  ReactNode,
} from 'react'

export type AeActionLinkVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type AeActionLinkSize = 'sm' | 'md' | 'lg'

type AeActionLinkBaseProps = Readonly<{
  variant?: AeActionLinkVariant
  size?: AeActionLinkSize
  className?: string
}>

type AeNativeLinkProps = Readonly<{
  href: string
  children: ReactNode
  asChild?: false
  onAction?: never
}> & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children' | 'className'>

export type AeActionLinkComposedChildProps = {
  className?: unknown
  children?: ReactNode
  href?: unknown
  to?: unknown
}

type AeComposedLinkProps = Readonly<{
  asChild: true
  children: ReactElement
  href?: never
  onAction?: never
}>

type AeActionProps = Readonly<{
  onAction: MouseEventHandler<HTMLButtonElement>
  children: ReactNode
  pending?: boolean
  labelLayout?: 'start' | 'between' | 'wrap'
  href?: never
  asChild?: never
}> & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'onClick'>

export type AeActionLinkProps = AeActionLinkBaseProps & (
  | AeNativeLinkProps
  | AeComposedLinkProps
  | AeActionProps
)
