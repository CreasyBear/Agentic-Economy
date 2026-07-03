import { CopyIcon } from 'lucide-react'
import { useState } from 'react'
import { Button, type ButtonProps } from '@astryxdesign/core/Button'

import { emitFunnelEvent } from '@/lib/observability/funnel-client'

type AeCopyPublicUrlButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
type AeCopyPublicUrlButtonSize = 'default' | 'sm' | 'lg' | 'icon'

type AeCopyPublicUrlButtonProps = {
  slug: string
  businessId?: string
  variant?: AeCopyPublicUrlButtonVariant
  size?: AeCopyPublicUrlButtonSize
}

const buttonVariantMap = {
  default: 'primary',
  outline: 'secondary',
  secondary: 'secondary',
  ghost: 'ghost',
  destructive: 'destructive',
  link: 'ghost',
} satisfies Record<AeCopyPublicUrlButtonVariant, NonNullable<ButtonProps['variant']>>

const buttonSizeMap = {
  default: 'md',
  sm: 'sm',
  lg: 'lg',
  icon: 'md',
} satisfies Record<AeCopyPublicUrlButtonSize, NonNullable<ButtonProps['size']>>

export function AeCopyPublicUrlButton({
  slug,
  businessId,
  variant = 'outline',
  size = 'default',
}: AeCopyPublicUrlButtonProps) {
  const [copied, setCopied] = useState(false)
  const publicPath = `/${slug}`

  async function handleCopy() {
    const origin = typeof window === 'undefined' ? 'https://ae.example' : window.location.origin
    try {
      await navigator.clipboard.writeText(`${origin}${publicPath}`)
      setCopied(true)
      void emitFunnelEvent({
        eventType: 'share_url_copied',
        stage: 'published',
        correlationPrefix: 'share-url',
        ...(businessId === undefined ? {} : { businessId }),
        payload: { slug },
      })
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      window.prompt('Copy your public page URL:', `${origin}${publicPath}`)
    }
  }

  return (
    <Button
      type="button"
      label={copied ? 'Copied public URL' : 'Copy public URL'}
      variant={buttonVariantMap[variant]}
      size={buttonSizeMap[size]}
      icon={<CopyIcon aria-hidden="true" />}
      onClick={handleCopy}
    />
  )
}
