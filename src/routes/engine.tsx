import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import { CheckIcon, CopyIcon } from 'lucide-react'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { routeRequestJson } from '@/modules/product/engine-product'

export const Route = createFileRoute('/engine')({
  head: () => ({ meta: [
    { title: 'What do you need? | Agentic Economy' },
    { name: 'description', content: 'Turn what you need into a clear brief your agent can carry forward with real businesses.' },
  ] }),
  component: AskRoute,
})

function AskRoute() {
  const [need, setNeed] = useState('')
  const [location, setLocation] = useState('Perth, WA')
  const [budget, setBudget] = useState('40.00')
  const [copied, setCopied] = useState(false)
  const maximumSpendMinor = Math.max(0, Math.round((Number.parseFloat(budget) || 0) * 100))
  const technicalRequest = useMemo(() => routeRequestJson([need.trim(), location.trim() === '' ? '' : `Location: ${location.trim()}.`].filter(Boolean).join(' '), 'network:au-first', 'AUD', maximumSpendMinor), [need, location, maximumSpendMinor])
  const agentBrief = `Use Agentic Economy to help with this:\n\n${need.trim()}\nLocation: ${location.trim() || 'Not specified'}\nMaximum spend: ${budget.trim() === '' ? 'Not specified' : `AUD ${budget.trim()}`}\n\nBefore acting, show me the recommended option, important alternatives, total cost, and what information will be shared.`

  async function copyBrief() {
    await navigator.clipboard.writeText(agentBrief)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2_000)
  }

  return (
    <AePublicShell>
      <main className="mx-auto grid min-w-0 w-full max-w-5xl gap-10 overflow-hidden px-4 py-10 sm:px-6 lg:py-16">
        <header className="grid max-w-3xl gap-3">
          <Heading level={1} className="text-4xl font-semibold tracking-tight sm:text-5xl">What do you need?</Heading>
          <Text type="large" color="secondary">Give your agent a clear starting point. Use ordinary language. Add only the limits that matter.</Text>
        </header>

        <section aria-labelledby="brief-heading" className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
          <Card padding={5} className="min-w-0">
            <div className="grid gap-5">
              <Heading id="brief-heading" level={2} className="text-xl font-semibold">Your request</Heading>
              <label className="grid gap-2 text-sm font-medium">Tell your agent what needs doing
                <textarea value={need} onChange={(event) => setNeed(event.target.value)} rows={6} maxLength={1000} placeholder="For example: compare local printers for 200 cards by Friday, or find an available bookkeeper within my budget." className="min-h-36 rounded-md border border-border bg-card px-3 py-3 text-primary shadow-low outline-none focus:border-accent focus:ring-2 focus:ring-accent" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Where" value={location} onChange={setLocation} placeholder="Suburb, city, or online" />
                <Field label="Maximum spend (AUD)" value={budget} onChange={setBudget} inputMode="decimal" placeholder="Optional" />
              </div>
              <Text color="secondary">Your agent should confirm the choice, total cost, and information sharing before it acts.</Text>
            </div>
          </Card>

          <Card padding={5} className="min-w-0 bg-surface" aria-label="Request ready for your agent">
            <div className="grid gap-5">
              <div>
                <Text className="text-sm font-medium text-accent">Ready for your agent</Text>
                <Heading level={2} className="mt-2 text-xl font-semibold">Continue where you already use AI.</Heading>
                <Text color="secondary" className="mt-2">Copy this brief into your supported agent. It tells the agent what to ask AE and what it must show you before acting.</Text>
              </div>
              <div className="rounded-md border border-border bg-card p-4 text-sm leading-6 text-primary whitespace-pre-line">{agentBrief}</div>
              <Button label={copied ? 'Copied' : 'Copy for my agent'} variant="primary" clickAction={() => void copyBrief()} icon={copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />} />
              <Button label="Show my agent how to use AE" variant="secondary" href="/SKILL.md" />
            </div>
          </Card>
        </section>

        <details className="rounded-lg border border-border bg-card p-5">
          <summary className="cursor-pointer font-medium text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">Technical details for agents and builders</summary>
          <div className="mt-5 grid gap-4">
            <Text color="secondary">This is the signed request envelope an integrated agent sends to AE. Customers do not need it to make a decision.</Text>
            <pre className="max-h-[32rem] max-w-full overflow-auto rounded-md bg-primary p-4 text-xs leading-6 text-on-accent"><code>{technicalRequest}</code></pre>
          </div>
        </details>
      </main>
    </AePublicShell>
  )
}

function Field({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; inputMode?: 'decimal' }) {
  return <label className="grid gap-2 text-sm font-medium">{label}<input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} className="min-h-11 rounded-md border border-border bg-card px-3 text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent" /></label>
}
