import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { CheckIcon, CodeIcon } from 'lucide-react'

export type AeAgentJsonAffordanceProps = {
  agentJsonUrl: string
  query: string
}

export function AeAgentJsonAffordance({ agentJsonUrl, query }: AeAgentJsonAffordanceProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      const res = await fetch(agentJsonUrl)
      if (!res.ok) throw new Error('fetch failed')
      const text = await res.text()
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      window.open(agentJsonUrl, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? `Agent JSON for ${query} copied to clipboard` : ''}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        label={copied ? 'Copied to clipboard' : 'Get as agent JSON'}
        icon={copied ? <CheckIcon aria-hidden="true" /> : <CodeIcon aria-hidden="true" />}
        onClick={handleCopy}
      />
    </>
  )
}
