import { useState } from 'react'

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
    <div className="ae-agent-json">
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? 'Agent JSON copied to clipboard' : ''}
      </span>
      <button
        type="button"
        className="ae-agent-json__button"
        onClick={handleCopy}
        aria-label={`Get the agent JSON answer for ${query}`}
      >
        <span className="ae-agent-json__label">{copied ? 'Copied to clipboard' : 'Get as agent JSON'}</span>
        <code className="ae-agent-json__url sr-only">{agentJsonUrl}</code>
      </button>
    </div>
  )
}
