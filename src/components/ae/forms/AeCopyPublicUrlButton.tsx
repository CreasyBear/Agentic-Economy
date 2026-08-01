import { CopyIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

import { emitFunnelEvent } from '@/lib/observability/funnel-client'

type AeCopyPublicUrlButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
type AeCopyPublicUrlButtonSize = 'default' | 'sm' | 'lg' | 'icon'

type AeCopyPublicUrlButtonProps = {
  slug: string
  businessId?: string
  variant?: AeCopyPublicUrlButtonVariant
  size?: AeCopyPublicUrlButtonSize
}

const buttonVariantMap: Record<AeCopyPublicUrlButtonVariant, 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'> = {
  default: 'default',
  outline: 'outline',
  secondary: 'secondary',
  ghost: 'ghost',
  destructive: 'destructive',
  link: 'link',
}

const buttonSizeMap: Record<AeCopyPublicUrlButtonSize, 'default' | 'sm' | 'lg' | 'icon'> = {
  default: 'default',
  sm: 'sm',
  lg: 'lg',
  icon: 'icon',
}

export function AeCopyPublicUrlButton({
  slug,
  businessId,
  variant = 'outline',
  size = 'default',
}: AeCopyPublicUrlButtonProps) {
  const [copied, setCopied] = useState(false)
  const publicPath = `/${slug}`
  const label = copied ? 'Copied public URL' : 'Copy public URL'

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
      variant={buttonVariantMap[variant]}
      size={buttonSizeMap[size]}
      aria-label={label}
      onClick={handleCopy}
    >
      <CopyIcon data-icon="inline-start" aria-hidden="true" />
      {size === 'icon' ? <span className="sr-only">{label}</span> : label}
    </Button>
  )
}
