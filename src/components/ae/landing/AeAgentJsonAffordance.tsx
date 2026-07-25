import { useId, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Dialog } from '@astryxdesign/core/Dialog'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { CheckIcon, CodeIcon } from 'lucide-react'

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
  const previewId = useId()
  const headingId = `${previewId}-heading`
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
      await navigator.clipboard.writeText(preview.text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        label="Get as agent JSON"
        icon={<CodeIcon aria-hidden="true" />}
        onClick={() => void openPreview()}
      />
      <Dialog
        id={previewId}
        isOpen={previewOpen}
        onOpenChange={setPreviewOpen}
        purpose="form"
        width="min(42rem, calc(100vw - 2rem))"
        maxHeight="calc(100dvh - 2rem)"
        role="dialog"
        aria-labelledby={headingId}
      >
        <div className="grid gap-4">
          <div className="grid gap-1">
            <Heading id={headingId} level={2} className="text-xl font-semibold">What gets copied</Heading>
            <Text color="secondary">Check the fields and values before you copy them.</Text>
          </div>
          {preview.status === 'loading' ? <Text role="status" color="secondary">Loading payload preview...</Text> : null}
          {preview.status === 'error' ? (
            <Text role="alert" color="secondary">The payload could not be loaded. Nothing was copied.</Text>
          ) : null}
          {preview.status === 'ready' ? (
            <>
              <Text type="supporting" color="secondary">Fields: {preview.fields.join(', ') || 'none'}</Text>
              <pre aria-label="Agent JSON payload" className="max-h-[50dvh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-body p-4 font-mono text-sm text-primary">{preview.text}</pre>
            </>
          ) : null}
          <div className="flex flex-col-reverse gap-2 min-[376px]:flex-row min-[376px]:justify-end">
            <Button label="Cancel" type="button" variant="ghost" className="min-h-11" onClick={() => setPreviewOpen(false)} />
            <Button
              label={copied ? 'Copied to clipboard' : 'Confirm and copy JSON'}
              type="button"
              variant="primary"
              className="min-h-11"
              icon={copied ? <CheckIcon aria-hidden="true" /> : <CodeIcon aria-hidden="true" />}
              isDisabled={preview.status !== 'ready' || copied}
              onClick={() => void confirmCopy()}
            />
          </div>
          <span className="sr-only" role="status" aria-live="polite">
            {copied ? `Agent JSON for ${query} copied to clipboard` : ''}
          </span>
        </div>
      </Dialog>
    </>
  )
}

function alignPayloadQuery(payload: unknown, query: string): unknown {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload) || !('query' in payload)) return payload
  return { ...payload, query }
}

function topLevelFields(payload: unknown): readonly string[] {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload) ? Object.keys(payload) : []
}
