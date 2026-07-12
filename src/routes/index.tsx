import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import { ArrowRightIcon, CheckIcon } from 'lucide-react'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'

export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'Agentic Economy | Your agent knows who to call' },
    { name: 'description', content: 'Ask for what you need. Agentic Economy helps your AI find and work with the right real businesses.' },
  ] }),
  component: Home,
})

function Home() {
  return (
    <AePublicShell>
      <main>
        <section className="border-b border-border bg-primary text-on-accent">
          <div className="mx-auto grid min-h-[76vh] w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,.92fr)] lg:py-24">
            <div className="grid gap-6">
              <Text className="text-sm font-medium text-on-accent">Agentic Economy</Text>
              <Heading level={1} textWrap="balance" className="max-w-3xl text-5xl font-semibold leading-none tracking-tight text-on-accent sm:text-6xl lg:text-7xl">Your agent knows who to call.</Heading>
              <Text type="large" className="max-w-2xl text-on-accent">Ask for what you need. AE helps your AI find the right real businesses, compare the choices, and carry the work forward.</Text>
              <div className="flex flex-wrap gap-3">
                <Button label="Tell us what you need" variant="primary" href="/engine" className="bg-card text-primary" icon={<ArrowRightIcon aria-hidden="true" />} />
                <Button label="Use AE with your agent" variant="secondary" href="/SKILL.md" className="border-on-accent text-on-accent" />
              </div>
            </div>
            <NeedObject />
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[.75fr_1.25fr] lg:py-24" aria-labelledby="less-work-heading">
          <div className="grid content-start gap-4">
            <Heading id="less-work-heading" level={2} className="text-3xl font-semibold sm:text-4xl">Less searching. Less chasing.</Heading>
            <Text type="large" color="secondary">Your agent can move from “who might help?” to a clear next step with a real business.</Text>
          </div>
          <ol className="divide-y divide-border border-y border-border">
            <JourneyRow number="01" title="Ask normally" body="Describe the job, purchase, booking, or question in your own words." />
            <JourneyRow number="02" title="See the best way forward" body="Get a recommendation with the price, timing, alternatives, and reasons that matter." />
            <JourneyRow number="03" title="Confirm what matters" body="Approve the spend and information sharing before your agent acts." />
            <JourneyRow number="04" title="Keep the thread" body="Follow progress, respond when something changes, and keep the record." />
          </ol>
        </section>

        <section className="border-y border-border bg-surface">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
            <div className="grid content-start gap-4">
              <Heading level={2} className="text-3xl font-semibold">Real businesses. One useful conversation.</Heading>
              <Text type="large" color="secondary">Businesses publish what they offer and the ways an agent can reach them. Your agent gets one place to discover the useful details.</Text>
              <Button label="Browse businesses" variant="secondary" href="/registry?q=&limit=10" className="w-fit" />
            </div>
            <div className="grid gap-5 rounded-lg border border-border bg-card p-6 sm:p-8">
              <Text className="text-sm font-medium text-secondary">What AE keeps clear</Text>
              <PlainPromise>Who your agent is working with</PlainPromise>
              <PlainPromise>What it will cost before you confirm</PlainPromise>
              <PlainPromise>What information will be shared</PlainPromise>
              <PlainPromise>What happened and what needs attention</PlainPromise>
            </div>
          </div>
        </section>
      </main>
    </AePublicShell>
  )
}

function NeedObject() {
  return <Card padding={5} className="bg-card text-primary shadow-high" aria-label="Example request">
    <Text className="text-sm font-medium text-secondary">You ask</Text>
    <Heading level={2} className="mt-3 text-2xl font-semibold">“Compare local printers for 200 cards by Friday. Show me the total cost and turnaround before I choose.”</Heading>
    <div className="mt-6 border-t border-border pt-5">
      <Text display="block" className="text-sm font-medium text-accent">Your agent can take it from here</Text>
      <Text display="block" color="secondary" className="mt-2">AE helps it compare connected businesses, bring back the important choices, and continue after you confirm.</Text>
    </div>
  </Card>
}

function JourneyRow({ number, title, body }: { number: string; title: string; body: string }) {
  return <li className="grid gap-3 py-6 sm:grid-cols-[3rem_12rem_1fr] sm:items-start"><span className="text-sm font-medium text-accent">{number}</span><Heading level={3} className="text-lg font-semibold">{title}</Heading><Text color="secondary">{body}</Text></li>
}

function PlainPromise({ children }: { children: React.ReactNode }) {
  return <div className="flex items-start gap-3"><span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-accent"><CheckIcon size={15} aria-hidden="true" /></span><Text>{children}</Text></div>
}
