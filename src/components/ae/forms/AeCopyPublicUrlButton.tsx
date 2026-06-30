import { CopyIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { emitFunnelEvent } from '@/lib/observability/funnel-client'

type AeCopyPublicUrlButtonProps = {
  slug: string
  businessId?: string
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

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
    <Button type="button" variant={variant} size={size} onClick={handleCopy}>
      <CopyIcon data-icon="inline-start" aria-hidden="true" />
      {copied ? 'Copied public URL' : 'Copy public URL'}
    </Button>
  )
}

export function buildPublicPageUrl(slug: string): string {
  const origin = typeof window === 'undefined' ? 'https://ae.example' : window.location.origin
  return `${origin}/${slug}`
}
