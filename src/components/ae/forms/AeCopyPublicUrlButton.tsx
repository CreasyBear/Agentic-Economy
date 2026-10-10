import { cn } from '@/lib/utils'
import { CopyIcon } from 'lucide-react'
import { useState } from 'react'

import { Button, type ButtonSize, type ButtonVariant } from '@/components/arc/button/button'

import { emitFunnelEvent } from '@/lib/observability/funnel-client'
import { copyTextToClipboard } from '@/lib/ui/copy-text-to-clipboard'
import { captureRouteException } from '@/lib/observability/capture-route-exception'
type AeCopyPublicUrlButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
type AeCopyPublicUrlButtonSize = 'default' | 'sm' | 'lg' | 'icon'

type AeCopyPublicUrlButtonProps = {
  slug: string
  businessId?: string
  variant?: AeCopyPublicUrlButtonVariant
  size?: AeCopyPublicUrlButtonSize
  statusClassName?: string
}

// Keep existing caller options at this product boundary; all actions use Arc
// variants and a minimum 44px target without spreading legacy props into Arc.
const buttonVariantMap: Record<AeCopyPublicUrlButtonVariant, ButtonVariant> = {
  default: 'primary',
  outline: 'secondary',
  secondary: 'secondary',
  ghost: 'ghost',
  destructive: 'danger',
  link: 'ghost',
}

const buttonSizeMap: Record<AeCopyPublicUrlButtonSize, ButtonSize> = {
  default: 'md',
  sm: 'md',
  lg: 'lg',
  icon: 'md',
}

export function AeCopyPublicUrlButton({
  slug,
  businessId,
  variant = 'outline',
  size = 'default',
  statusClassName = 'text-foreground',
}: AeCopyPublicUrlButtonProps) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [publicUrl, setPublicUrl] = useState<string>()
  const [copyNotice, setCopyNotice] = useState<string>()
  const publicPath = `/${slug}`
  const label = copied ? 'Copied public URL' : 'Copy public URL'
  const copyStatusId = `${slug}-copy-status`

  async function handleCopy() {
    const actionPublicUrl = `${window.location.origin}${publicPath}`
    setPublicUrl(actionPublicUrl)
    try {
      await copyTextToClipboard(actionPublicUrl)
      setCopied(true)
      setCopyFailed(false)
      setCopyNotice('Public URL copied.')
      void emitFunnelEvent({
        eventType: 'share_url_copied',
        stage: 'published',
        correlationPrefix: 'share-url',
        ...(businessId === undefined ? {} : { businessId }),
        payload: { slug },
      })
      window.setTimeout(() => setCopied(false), 1600)
    } catch (cause) {
      captureRouteException(cause, { site: 'copyPublicUrl' }, 'warning')
      setCopied(false)
      setCopyFailed(true)
      setCopyNotice('Could not copy the public URL. Select it and copy it manually.')
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={buttonVariantMap[variant]}
        size={buttonSizeMap[size]}
        className={cn('arc-market', size === 'icon' && 'size-11 shrink-0 p-0')}
        aria-label={label}
        onClick={handleCopy}
      >
        <CopyIcon data-icon="inline-start" aria-hidden="true" />
        {size === 'icon' ? <span className="sr-only">{label}</span> : label}
      </Button>
      {copyNotice === undefined ? null : (
        <p id={copyStatusId} role="status" aria-live="polite" className={cn('basis-full text-sm', statusClassName)}>
          {copyNotice}
        </p>
      )}
      {copyFailed ? (
        <input
          aria-label="Public page URL"
          aria-describedby={copyNotice === undefined ? undefined : copyStatusId}
          value={publicUrl ?? publicPath}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => event.currentTarget.select()}
          className="h-11 basis-full min-w-0 rounded-sm border border-input bg-background px-3 text-sm text-foreground"
        />
      ) : null}
    </>
  )
}
