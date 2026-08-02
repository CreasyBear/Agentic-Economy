import { cn } from '@/lib/utils'
import { CopyIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { emitFunnelEvent } from '@/lib/observability/funnel-client'
import { copyTextToClipboard } from '@/lib/ui/copy-text-to-clipboard'
type AeCopyPublicUrlButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
type AeCopyPublicUrlButtonSize = 'default' | 'sm' | 'lg' | 'icon'

type AeCopyPublicUrlButtonProps = {
  slug: string
  businessId?: string
  variant?: AeCopyPublicUrlButtonVariant
  size?: AeCopyPublicUrlButtonSize
  statusClassName?: string
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
    } catch {
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
        <Input
          aria-label="Public page URL"
          aria-describedby={copyNotice === undefined ? undefined : copyStatusId}
          value={publicUrl ?? publicPath}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => event.currentTarget.select()}
          className="basis-full min-w-0 bg-background text-foreground"
        />
      ) : null}
    </>
  )
}
