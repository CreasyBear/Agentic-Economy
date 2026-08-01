import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import type { AgentToolDescriptor } from '@/modules/actions'
import type { ServiceDto } from '@/modules/registry/public'

import { AeSupplyAgentProof } from './AeSupplyAgentProof'

export const SUPPLY_OFFER_SENTENCE = 'Publish what you do once. Set your price. Test it, go live, and earn when agents bring you work.'

export function AeSupplyLanding({
  tools,
  services,
}: Readonly<{
  tools: readonly AgentToolDescriptor[]
  services: readonly ServiceDto[]
}>) {
  return (
    <>
      <header className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-16 sm:px-6 md:py-24">
        <div className="grid max-w-4xl gap-5">
          <p className="block text-sm font-semibold text-muted-foreground">FOR BUSINESSES</p>
          <h1 className="text-5xl leading-none font-semibold tracking-tight text-foreground md:text-7xl">Let AI assistants bring your business more work.</h1>
          <p className="block max-w-3xl text-lg text-muted-foreground">
            Publish what you do once. Set your price. Test it, go live, and earn when agents bring you work.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="default" className="min-h-11">
              <a href="/claim?source=supply">Start publishing your service</a>
            </Button>
            <a href="/owner/supply" className="min-h-11 px-2 py-3 text-sm font-semibold underline underline-offset-4">Manage your service</a>
          </div>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 sm:px-6">
        <Card className="border-0 bg-brand text-on-brand">
          <CardContent className="grid gap-3 p-6">
            <p className="block text-sm font-semibold text-on-brand">YOUR PATH TO PAID WORK</p>
            <p className="block max-w-3xl text-on-brand/85">Publish once, then earn when agents bring paid work.</p>
            <p className="block max-w-3xl text-on-brand/85">Check your service before it goes live, then let assistants find it.</p>
          </CardContent>
        </Card>
        <section aria-labelledby="supply-payment-flow" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="supply-payment-flow" className="text-xl font-semibold text-foreground">Set a clear price</h2>
            <p className="block max-w-3xl text-muted-foreground">Choose what agents pay for each call. Review the fee and what your business receives before you publish.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <FlowCard label="Your price" detail="The amount you choose for each call." />
            <FlowCard label="AE fee" detail="Shown clearly before you publish." />
            <FlowCard label="Your share" detail="The amount your business receives." />
          </div>
        </section>
        <AeSupplyAgentProof tools={tools} services={services} />
      </main>
    </>
  )
}

function FlowCard({ label, detail }: Readonly<{ label: string; detail: string }>) {
  return (
    <Card className="border border-border bg-card">
      <CardHeader className="p-4 pb-0">
        <CardTitle><p className="font-semibold text-foreground">{label}</p></CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1">
        <CardDescription><p>{detail}</p></CardDescription>
      </CardContent>
    </Card>
  )
}
