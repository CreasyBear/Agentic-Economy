import { createFileRoute } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { ENGINE_LIFECYCLE } from '@/modules/product/engine-product'

export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'Agentic Economy | Routing infrastructure for agents' },
    { name: 'description', content: 'Route agent requests across registered capabilities with inspectable plans, bounded authority, and Root Run evidence.' },
  ] }),
  component: Home,
})

function Home() {
  return (
    <AePublicShell>
      <main>
        <section className="border-b border-border bg-primary text-on-accent">
          <div className="mx-auto grid min-h-[72vh] w-full max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,.95fr)] lg:py-24">
            <div className="grid gap-6">
              <Badge label="Neutral agent routing" variant="neutral" className="w-fit bg-card text-primary" />
              <Heading level={1} textWrap="balance" className="max-w-3xl text-5xl font-semibold leading-none tracking-tight text-on-accent sm:text-6xl lg:text-7xl">Give the job to the right endpoint.</Heading>
              <Text type="large" className="max-w-2xl text-on-accent">AE turns a natural-language request into an inspectable route plan across registered capabilities. Your agent approves the exact cost and data boundaries, then runs it once.</Text>
              <div className="flex flex-wrap gap-3">
                <Button label="Route a request" variant="primary" href="/engine" className="bg-card text-primary" />
                <Button label="Read the agent contract" variant="secondary" href="/SKILL.md" className="border-on-accent text-on-accent" />
              </div>
            </div>
            <RouteDocket />
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:py-20" aria-labelledby="lifecycle-heading">
          <div className="grid max-w-3xl gap-3">
            <Text className="font-mono text-xs uppercase tracking-widest text-accent">The routing lifecycle</Text>
            <Heading id="lifecycle-heading" level={2} className="text-3xl font-semibold sm:text-4xl">The plan is the product.</Heading>
            <Text type="large" color="secondary">A registry tells an agent what exists. AE decides how available capabilities can be composed for this request, under this authority, right now.</Text>
          </div>
          <ol className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-5">
            {ENGINE_LIFECYCLE.map((step, index) => <li key={step.id} className="bg-card p-5"><span className="font-mono text-xs text-accent">0{index + 1}</span><Heading level={3} className="mt-4 text-lg font-semibold">{step.label}</Heading><Text color="secondary" className="mt-2">{step.description}</Text></li>)}
          </ol>
        </section>

        <section className="border-y border-border bg-surface">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:py-20">
            <div className="grid content-start gap-4">
              <Heading level={2} className="text-3xl font-semibold">The network makes supply usable.</Heading>
              <Text type="large" color="secondary">Entities can bring an endpoint, use an adapter, or run a hosted capability. Registration makes them discoverable. Admission and conformance make a capability routeable.</Text>
              <Button label="Explore registered supply" variant="secondary" href="/registry?q=&limit=10" className="w-fit" />
            </div>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead className="bg-muted text-secondary"><tr><th className="px-4 py-3">Layer</th><th className="px-4 py-3">What it proves</th><th className="px-4 py-3">Routing effect</th></tr></thead>
                <tbody>
                  <LedgerRow layer="Entity" proof="A registered identity and public record" effect="Discoverable" />
                  <LedgerRow layer="Capability binding" proof="Contract + operation + endpoint" effect="Candidate supply" />
                  <LedgerRow layer="Admission" proof="Network evidence accepted" effect="Eligible" />
                  <LedgerRow layer="Conformance" proof="Adapter contract satisfied" effect="Routeable" />
                  <LedgerRow layer="Outcome evidence" proof="Runs and incidents over time" effect="Routing input" />
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </AePublicShell>
  )
}

function RouteDocket() {
  return <Card padding={5} className="bg-card text-primary shadow-high" aria-label="Example route quote">
    <div className="flex items-start justify-between gap-4"><div><Text className="font-mono text-xs uppercase tracking-widest text-accent">Route quote</Text><Heading level={2} className="mt-2 text-xl font-semibold">Purchase one parcel label</Heading></div><Badge label="Awaiting approval" variant="warning" /></div>
    <div className="mt-5 grid gap-3 border-y border-border py-5">
      <DocketRow label="Plan" value="Quote → purchase → return label" />
      <DocketRow label="Maximum cost" value="AUD 15.00" />
      <DocketRow label="Data" value="Recipient address → selected carrier" />
      <DocketRow label="Fallback" value="One alternate binding" />
    </div>
    <div className="mt-5 flex items-center justify-between gap-4"><span className="font-mono text-xs text-secondary">sha256:8d71…e42a</span><span className="text-sm font-semibold text-accent">Approve exact plan →</span></div>
  </Card>
}

function DocketRow({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-5 text-sm"><span className="text-secondary">{label}</span><span className="max-w-[65%] text-right font-medium">{value}</span></div> }
function LedgerRow({ layer, proof, effect }: { layer: string; proof: string; effect: string }) { return <tr className="border-t border-border"><th className="px-4 py-4 font-semibold">{layer}</th><td className="px-4 py-4 text-secondary">{proof}</td><td className="px-4 py-4 font-medium text-accent">{effect}</td></tr> }
