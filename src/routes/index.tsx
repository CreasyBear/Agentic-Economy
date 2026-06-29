import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  FileCheck2Icon,
  LockKeyholeIcon,
  SearchIcon,
  ShieldCheckIcon,
  WrenchIcon,
} from 'lucide-react'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { aeCopy } from '@/lib/ui/copy'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Agentic Economy | Source-owned service pages' },
      {
        name: 'description',
        content: 'Claim and publish source-owned local-service facts without booking, payment, or automated-action claims.',
      },
    ],
  }),
  component: Home,
})

type ProofRail = {
  title: string
  description: string
  Icon: typeof ShieldCheckIcon
  surface: string
}

const proofRails = [
  {
    title: 'Truthful public objects',
    description: 'Owners publish service facts, areas, hours, first-request posture, and unavailable capability states from source input.',
    Icon: FileCheck2Icon,
    surface: 'bg-card md:col-span-2',
  },
  {
    title: 'Assistant-readable registry',
    description: 'Registry pages and JSON routes share the same catalog DTO, so humans and agents see the same facts.',
    Icon: SearchIcon,
    surface: 'bg-[color:var(--ae-surface-raised)]',
  },
  {
    title: 'Phase-gated commerce',
    description: 'Bookings, payments, and automated actions stay visibly unavailable until runtime evidence exists.',
    Icon: LockKeyholeIcon,
    surface: 'bg-card',
  },
  {
    title: 'Repair before trust',
    description: 'Suppression, disputes, stale projections, and owner corrections stay first-class instead of hidden behind a live badge.',
    Icon: WrenchIcon,
    surface: 'bg-[color:var(--ae-surface-raised)] md:col-span-2',
  },
] satisfies readonly ProofRail[]

function Home() {
  return (
    <AePublicShell>
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 md:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] lg:items-start lg:py-20">
        <div className="flex flex-col gap-6">
          <p className="max-w-xl text-sm font-medium leading-6 text-muted-foreground">Agentic commerce starts with source truth.</p>
          <div className="grid gap-5">
            <h1 className="max-w-4xl text-balance font-heading text-5xl font-semibold leading-[1.02] tracking-normal text-foreground lg:text-5xl xl:text-6xl">
              Service truth for agentic commerce.
            </h1>
            <p className="max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">
              Publish local-service facts assistants can read without pretending bookings, payments, or actions are live.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild>
              <Link to="/claim">
                <ArrowRightIcon data-icon="inline-start" />
                Claim page
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/registry" search={{ q: '', limit: 10 }}>Open registry</Link>
            </Button>
          </div>
        </div>

        <aside aria-label="Example source readback" className="dark ae-command-panel rounded-xl p-4 md:p-5">
          <div className="grid gap-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Source readback</p>
                <p className="ae-command-muted mt-1 text-sm leading-6">/parramatta-emergency-plumbing</p>
              </div>
              <span className="rounded-full bg-[color:var(--ae-command-fg)] px-3 py-1 text-xs font-medium text-[color:var(--ae-surface-command)]">
                public
              </span>
            </div>

            <div className="ae-command-tile rounded-lg p-4">
              <div className="grid gap-3">
                <div>
                  <p className="text-lg font-semibold leading-6">Parramatta Emergency Plumbing</p>
                  <p className="ae-command-muted mt-1 text-sm leading-6">Emergency plumbing in NSW</p>
                </div>
                <div className="grid gap-3">
                  <CommandStatus label="Published" description="The public page state is visible." tone="success" />
                  <CommandStatus label="Queued" description="Registry projection is waiting to run." tone="info" />
                  <CommandStatus label="Not live" description="Commerce actions stay unavailable." tone="neutral" />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="ae-command-tile rounded-lg p-4">
                <p className="ae-command-muted text-sm">Owner facts</p>
                <p className="mt-2 font-medium">Service area, hours, public note</p>
              </div>
              <div className="ae-command-tile rounded-lg p-4">
                <p className="ae-command-muted text-sm">Unavailable rails</p>
                <p className="mt-2 font-medium">Bookings, payments, automated actions</p>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {proofRails.map(({ title, description, Icon, surface }) => (
            <article
              key={title}
              className={`${surface} ae-surface-panel grid min-h-48 gap-4 rounded-xl p-5 text-card-foreground`}
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon aria-hidden="true" className="size-5" />
              </div>
              <div className="grid gap-2 self-end">
                <h2 className="font-heading text-xl font-semibold leading-7 tracking-normal text-foreground">{title}</h2>
                <p className="text-pretty text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            </article>
          ))}
        </div>

        <Alert className="mt-6">
          <AlertTitle>Capability truth stays visible</AlertTitle>
          <AlertDescription>{aeCopy.notLiveNotice} Source-owned readback names the boundary before users or assistants act on it.</AlertDescription>
        </Alert>
      </section>
    </AePublicShell>
  )
}

function CommandStatus({
  label,
  description,
  tone,
}: {
  label: string
  description: string
  tone: 'neutral' | 'info' | 'success'
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="ae-status-badge inline-flex h-5 items-center rounded-full px-2 text-xs font-medium" data-tone={tone}>
        {label}
      </span>
      <span className="ae-command-muted min-w-0 text-pretty text-sm leading-6">{description}</span>
    </div>
  )
}
