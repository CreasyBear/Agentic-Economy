import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { ENGINE_LIFECYCLE, ROUTING_OPERATIONS, routeRequestJson } from '@/modules/product/engine-product'

export const Route = createFileRoute('/engine')({
  head: () => ({ meta: [
    { title: 'Routing engine | Agentic Economy' },
    { name: 'description', content: 'Compose an agent route request and inspect the signed quote-to-run lifecycle.' },
  ] }),
  component: EngineRoute,
})

function EngineRoute() {
  const [query, setQuery] = useState('Purchase one parcel label and return the label URL.')
  const [networkId, setNetworkId] = useState('network:au-first')
  const [currency, setCurrency] = useState('AUD')
  const [maximumSpend, setMaximumSpend] = useState('15.00')
  const maximumSpendMinor = Math.max(0, Math.round((Number.parseFloat(maximumSpend) || 0) * 100))
  const request = useMemo(() => routeRequestJson(query.trim(), networkId.trim(), currency.trim().toUpperCase(), maximumSpendMinor), [query, networkId, currency, maximumSpendMinor])

  return (
    <AePublicShell>
      <main className="mx-auto grid min-w-0 w-full max-w-6xl gap-8 overflow-hidden px-4 py-10 sm:px-6 lg:py-14">
        <header className="grid max-w-3xl gap-3">
          <Badge label="Routing workbench" variant="info" className="w-fit" />
          <Heading level={1} className="text-4xl font-semibold tracking-tight sm:text-5xl">Turn an intent into an approvable plan.</Heading>
          <Text type="large" color="secondary">Compose the request here. Your agent signs and sends it through HTTP or MCP, then returns the exact route quote for approval.</Text>
        </header>

        <section aria-labelledby="compose-heading" className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,.9fr)]">
          <Card padding={5} className="min-w-0">
            <div className="grid gap-5">
              <div>
                <Heading id="compose-heading" level={2} className="text-xl font-semibold">1. Compose the request</Heading>
                <Text color="secondary">The kernel stays neutral. The request supplies the domain.</Text>
              </div>
              <label className="grid gap-2 text-sm font-medium">What outcome do you want?
                <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={5} maxLength={1000} className="min-h-28 rounded-md border border-border bg-card px-3 py-3 text-primary shadow-low outline-none focus:border-accent focus:ring-2 focus:ring-accent" />
              </label>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Network" value={networkId} onChange={setNetworkId} />
                <Field label="Currency" value={currency} onChange={setCurrency} maxLength={3} />
                <Field label="Maximum spend" value={maximumSpend} onChange={setMaximumSpend} inputMode="decimal" />
              </div>
              <div className="rounded-md border border-border bg-muted p-4 text-sm text-secondary">
                This creates a request envelope, not a quote. A quote exists only after the signed kernel call evaluates the live network graph.
              </div>
            </div>
          </Card>

          <Card padding={5} aria-label="Signed routing request" className="min-w-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Heading level={2} className="text-xl font-semibold">Signed request envelope</Heading>
                <Text color="secondary">POST /v1/route · Web Bot Auth</Text>
              </div>
              <Button label="Copy JSON" variant="secondary" size="sm" clickAction={() => void navigator.clipboard.writeText(request)} />
            </div>
            <pre className="mt-5 max-h-[32rem] max-w-full overflow-auto rounded-md bg-primary p-4 text-xs leading-6 text-on-accent"><code>{request}</code></pre>
          </Card>
        </section>

        <section aria-labelledby="lifecycle-heading" className="grid gap-5">
          <div>
            <Heading id="lifecycle-heading" level={2} className="text-2xl font-semibold">2. Quote, approve, run, inspect</Heading>
            <Text color="secondary">One lifecycle, whether the route takes one call or many.</Text>
          </div>
          <ol className="grid gap-3 lg:grid-cols-5">
            {ENGINE_LIFECYCLE.map((step, index) => <li key={step.id}><Card padding={4} className="h-full"><span className="font-mono text-xs text-accent">0{index + 1}</span><Heading level={3} className="mt-3 text-lg font-semibold">{step.label}</Heading><Text color="secondary" className="mt-2">{step.description}</Text></Card></li>)}
          </ol>
        </section>

        <section aria-labelledby="operations-heading" className="grid gap-5">
          <div>
            <Heading id="operations-heading" level={2} className="text-2xl font-semibold">Six operations. One routing contract.</Heading>
            <Text color="secondary">HTTP and MCP project the same kernel operations.</Text>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead className="bg-muted text-secondary"><tr><th className="px-4 py-3 font-medium">Operation</th><th className="px-4 py-3 font-medium">HTTP</th><th className="px-4 py-3 font-medium">Contract</th></tr></thead>
              <tbody>{ROUTING_OPERATIONS.map((operation) => <tr key={operation.id} className="border-t border-border"><td className="px-4 py-4 font-mono font-semibold text-primary">{operation.id}</td><td className="px-4 py-4 font-mono text-secondary">{operation.method} {operation.path}</td><td className="px-4 py-4 text-secondary">{operation.purpose}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </main>
    </AePublicShell>
  )
}

function Field({ label, value, onChange, maxLength, inputMode }: { label: string; value: string; onChange: (value: string) => void; maxLength?: number; inputMode?: 'decimal' }) {
  return <label className="grid gap-2 text-sm font-medium">{label}<input value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} inputMode={inputMode} className="min-h-11 rounded-md border border-border bg-card px-3 text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent" /></label>
}
