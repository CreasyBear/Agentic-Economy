import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CheckIcon, CodeIcon } from 'lucide-react'
import { copyTextToClipboard } from '@/lib/ui/copy-text-to-clipboard'
import { isRecord } from '@/modules/common/is-record'

export type AeAgentJsonAffordanceProps = {
  agentJsonUrl: string
  query: string
}

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; text: string; fields: readonly string[] }
  | { status: 'error' }

export function AeAgentJsonAffordance({ agentJsonUrl, query }: AeAgentJsonAffordanceProps) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle' })
  const [copied, setCopied] = useState(false)

  async function openPreview() {
    setPreviewOpen(true)
    setCopied(false)
    setPreview({ status: 'loading' })
    try {
      const response = await fetch(agentJsonUrl)
      if (!response.ok) throw new Error('fetch failed')
      const payload: unknown = await response.json()
      const disclosedPayload = alignPayloadQuery(payload, query)
      setPreview({
        status: 'ready',
        text: JSON.stringify(disclosedPayload, null, 2),
        fields: topLevelFields(disclosedPayload),
      })
    } catch {
      setPreview({ status: 'error' })
    }
  }

  async function confirmCopy() {
    if (preview.status !== 'ready') return
    try {
      await copyTextToClipboard(preview.text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogTrigger asChild>
      <Button type="button" variant="secondary" size="sm" onClick={() => void openPreview()}>
        <CodeIcon aria-hidden="true" />
        Data for AI assistants
      </Button>
        </DialogTrigger>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] max-w-[min(42rem,calc(100vw-2rem))] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Data for AI assistants</DialogTitle>
            <DialogDescription>Check the fields and values before you copy them.</DialogDescription>
          </DialogHeader>
          {preview.status === 'loading' ? <p role="status" className="text-muted-foreground">Loading data preview...</p> : null}
          {preview.status === 'error' ? (
            <p role="alert" className="text-muted-foreground">The data could not be loaded. Nothing was copied.</p>
          ) : null}
          {preview.status === 'ready' ? (
            <>
              <p className="text-sm text-muted-foreground">Fields: {preview.fields.join(', ') || 'none'}</p>
              <pre aria-label="Assistant data" className="max-h-[50dvh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-4 font-mono text-sm text-foreground">{preview.text}</pre>
            </>
          ) : null}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              className="min-h-11"
              disabled={preview.status !== 'ready' || copied}
              onClick={() => void confirmCopy()}
            >
              {copied ? <CheckIcon aria-hidden="true" /> : <CodeIcon aria-hidden="true" />}
              {copied ? 'Copied to clipboard' : 'Confirm and copy data'}
            </Button>
          </DialogFooter>
          <span className="sr-only" role="status" aria-live="polite">
            {copied ? `Assistant data for ${query} copied to clipboard` : ''}
          </span>
        </DialogContent>
      </Dialog>
  )
}

function alignPayloadQuery(payload: unknown, query: string): unknown {
  if (!isRecord(payload) || !('query' in payload)) return payload
  return { ...payload, query }
}

function topLevelFields(payload: unknown): readonly string[] {
  return isRecord(payload) ? Object.keys(payload) : []
}
