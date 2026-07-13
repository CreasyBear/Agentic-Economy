import { useEffect, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'

/**
 * THROWAWAY PROTOTYPE — three Request-start structures on `/engine?variant=`.
 * It is local-only, uses no persistence, and must be deleted or absorbed after HITL review.
 */

export type CustomerRequestPrototypeVariant = 'A' | 'B' | 'C'
type Stage = 'start' | 'clarify' | 'ready' | 'finding' | 'unsupported' | 'no_options'
type Scenario = 'available' | 'unsupported' | 'no_options'

type PrototypeState = Readonly<{
  need: string
  location: string
  stage: Stage
  scenario: Scenario
}>

const variants: readonly CustomerRequestPrototypeVariant[] = ['A', 'B', 'C']
const variantNames: Readonly<Record<CustomerRequestPrototypeVariant, string>> = {
  A: 'Conversation',
  B: 'Editable brief',
  C: 'Guided path',
}

export function AeCustomerRequestPrototype({
  variant,
  onVariantChange,
}: Readonly<{
  variant: CustomerRequestPrototypeVariant
  onVariantChange: (variant: CustomerRequestPrototypeVariant) => void
}>) {
  const [state, setState] = useState<PrototypeState>({
    need: '',
    location: '',
    stage: 'start',
    scenario: 'available',
  })

  const actions = {
    setNeed: (need: string) => setState((current) => ({ ...current, need })),
    setLocation: (location: string) => setState((current) => ({ ...current, location })),
    interpret: () => setState((current) => ({ ...current, stage: current.scenario === 'unsupported' ? 'unsupported' : 'clarify' })),
    confirmLocation: () => setState((current) => ({ ...current, stage: 'ready' })),
    find: () => setState((current) => ({ ...current, stage: current.scenario === 'no_options' ? 'no_options' : 'finding' })),
    edit: () => setState((current) => ({ ...current, stage: 'start' })),
    restart: () => setState((current) => ({ ...current, need: '', location: '', stage: 'start' })),
    setScenario: (scenario: Scenario) => setState((current) => ({ ...current, scenario, stage: 'start' })),
  } as const

  return (
    <>
      {variant === 'A' ? <ConversationVariant state={state} actions={actions} /> : null}
      {variant === 'B' ? <BriefVariant state={state} actions={actions} /> : null}
      {variant === 'C' ? <GuidedVariant state={state} actions={actions} /> : null}
      <PrototypeStateReadback state={state} />
      <PrototypeSwitcher
        current={variant}
        scenario={state.scenario}
        onScenarioChange={actions.setScenario}
        onChange={onVariantChange}
      />
    </>
  )
}

type VariantProps = Readonly<{
  state: PrototypeState
  actions: Readonly<{
    setNeed: (value: string) => void
    setLocation: (value: string) => void
    interpret: () => void
    confirmLocation: () => void
    find: () => void
    edit: () => void
    restart: () => void
  }>
}>

function ConversationVariant({ state, actions }: VariantProps) {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-10 pb-40 sm:px-6 lg:py-16">
      <header className="grid gap-3 text-center">
        <Text className="text-sm font-semibold text-accent">Ask AE</Text>
        <Heading level={1} className="text-4xl font-semibold tracking-tight sm:text-5xl">What can we help you arrange?</Heading>
        <Text type="large" color="secondary">Start with the need. AE will ask only what changes the available options.</Text>
      </header>
      <section aria-label="Request conversation" className="grid gap-4">
        {state.stage !== 'start' ? <CustomerMessage>{state.need}</CustomerMessage> : null}
        {state.stage === 'start' ? (
          <Composer value={state.need} onChange={actions.setNeed} onSubmit={actions.interpret} label="Describe what you need" button="Continue" />
        ) : null}
        {state.stage === 'clarify' ? (
          <AssistantTurn title="Where should this happen?" detail="Location changes which connected businesses can respond.">
            <InlineAnswer value={state.location} onChange={actions.setLocation} onSubmit={actions.confirmLocation} />
          </AssistantTurn>
        ) : null}
        {state.stage === 'ready' ? <Understanding state={state} actions={actions} compact /> : null}
        {state.stage === 'finding' ? <FindingMessage /> : null}
        {state.stage === 'unsupported' ? <Unsupported actions={actions} /> : null}
        {state.stage === 'no_options' ? <NoOptions actions={actions} /> : null}
      </section>
    </main>
  )
}

function BriefVariant({ state, actions }: VariantProps) {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 pb-40 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)] lg:py-16">
      <section className="grid content-start gap-6">
        <header className="grid gap-3">
          <Text className="text-sm font-semibold text-accent">Your request</Text>
          <Heading level={1} className="text-4xl font-semibold tracking-tight sm:text-5xl">Tell AE what needs doing.</Heading>
          <Text type="large" color="secondary">AE turns your words into a brief you can correct before any business is contacted.</Text>
        </header>
        <Card padding={5}>
          <Composer value={state.need} onChange={actions.setNeed} onSubmit={actions.interpret} label="What do you need?" button={state.stage === 'start' ? 'Build my brief' : 'Update brief'} />
        </Card>
      </section>
      <aside aria-label="AE understanding" className="min-w-0">
        <Card padding={5} className="min-h-80">
          <div className="grid gap-5">
            <div className="flex items-start justify-between gap-4">
              <div><Text className="text-sm font-semibold text-accent">AE understanding</Text><Heading level={2} className="mt-1">Your brief</Heading></div>
              {state.stage !== 'start' ? <button className="min-h-11 text-sm font-semibold underline underline-offset-4" onClick={actions.edit}>Edit</button> : null}
            </div>
            {state.stage === 'start' ? <Text color="secondary">Your editable brief will appear here. Nothing is sent to a business yet.</Text> : null}
            {state.stage === 'clarify' ? (
              <div className="grid gap-5">
                <BriefRow label="Need" value={state.need} />
                <div className="border-t border-border pt-5"><InlineAnswer value={state.location} onChange={actions.setLocation} onSubmit={actions.confirmLocation} label="Where should this happen?" /></div>
              </div>
            ) : null}
            {state.stage === 'ready' ? <Understanding state={state} actions={actions} /> : null}
            {state.stage === 'finding' ? <FindingMessage /> : null}
            {state.stage === 'unsupported' ? <Unsupported actions={actions} /> : null}
            {state.stage === 'no_options' ? <NoOptions actions={actions} /> : null}
          </div>
        </Card>
      </aside>
    </main>
  )
}

function GuidedVariant({ state, actions }: VariantProps) {
  const step = state.stage === 'start' ? 1 : state.stage === 'clarify' ? 2 : 3
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 pb-40 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:py-16">
      <aside className="grid content-start gap-6 border-b border-border pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8" aria-label="Request progress">
        <div><Text className="text-sm font-semibold text-accent">Ask AE</Text><Heading level={1} className="mt-2 text-3xl">One clear step at a time.</Heading></div>
        <ol className="grid grid-cols-3 gap-2 text-sm lg:grid-cols-1 lg:gap-4">
          <ProgressStep number={1} label="Your need" active={step === 1} complete={step > 1} />
          <ProgressStep number={2} label="What matters" active={step === 2} complete={step > 2} />
          <ProgressStep number={3} label="Find options" active={step === 3} complete={false} />
        </ol>
        {state.stage !== 'start' ? <button className="min-h-11 text-left text-sm font-semibold underline underline-offset-4" onClick={actions.restart}>Start over</button> : null}
      </aside>
      <section className="grid min-w-0 content-start gap-6" aria-label="Current request step">
        {state.stage === 'start' ? <><Heading level={2} className="text-3xl">What needs doing?</Heading><Text color="secondary">Use your own words. You do not need to know which business or service to choose.</Text><Composer value={state.need} onChange={actions.setNeed} onSubmit={actions.interpret} label="Describe the result you want" button="Next" /></> : null}
        {state.stage === 'clarify' ? <><Heading level={2} className="text-3xl">One thing will change the options.</Heading><Text color="secondary">AE needs a location to know which connected businesses are eligible.</Text><InlineAnswer value={state.location} onChange={actions.setLocation} onSubmit={actions.confirmLocation} label="Where should this happen?" /></> : null}
        {state.stage === 'ready' ? <Understanding state={state} actions={actions} /> : null}
        {state.stage === 'finding' ? <FindingMessage /> : null}
        {state.stage === 'unsupported' ? <Unsupported actions={actions} /> : null}
        {state.stage === 'no_options' ? <NoOptions actions={actions} /> : null}
      </section>
    </main>
  )
}

function Understanding({ state, actions, compact = false }: VariantProps & Readonly<{ compact?: boolean }>) {
  return (
    <div className="grid gap-5">
      <div><Text className="text-sm font-semibold text-accent">Ready to look</Text><Heading level={2} className={compact ? 'mt-1 text-2xl' : 'mt-1 text-3xl'}>Here’s what AE understood.</Heading></div>
      <div className="grid gap-3 rounded-md border border-border bg-card p-4"><BriefRow label="Need" value={state.need} /><BriefRow label="Where" value={state.location} /></div>
      <Text color="secondary">Next, AE will check connected businesses that can respond. Nothing will be booked or purchased.</Text>
      <div className="flex flex-wrap gap-3"><Button label="Find available options" variant="primary" clickAction={actions.find} /><Button label="Change my request" variant="secondary" clickAction={actions.edit} /></div>
    </div>
  )
}

function Composer({ value, onChange, onSubmit, label, button }: Readonly<{ value: string; onChange: (value: string) => void; onSubmit: () => void; label: string; button: string }>) {
  return <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (value.trim()) onSubmit() }}><label className="grid gap-2 text-sm font-semibold">{label}<textarea rows={5} maxLength={2_000} value={value} onChange={(event) => onChange(event.target.value)} placeholder="For example: I need 200 business cards printed by Friday." className="min-h-36 rounded-md border border-border bg-card px-4 py-3 text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent" /></label><button type="submit" disabled={!value.trim()} className="min-h-11 rounded-md border border-accent bg-accent px-4 font-semibold text-on-accent outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">{button}</button></form>
}

function InlineAnswer({ value, onChange, onSubmit, label = 'Your answer' }: Readonly<{ value: string; onChange: (value: string) => void; onSubmit: () => void; label?: string }>) {
  return <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (value.trim()) onSubmit() }}><label className="grid gap-2 text-sm font-semibold">{label}<input autoFocus value={value} onChange={(event) => onChange(event.target.value)} placeholder="Suburb, city, or online" className="min-h-11 rounded-md border border-border bg-card px-3 text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent" /></label><button type="submit" disabled={!value.trim()} className="min-h-11 rounded-md border border-accent bg-accent px-4 font-semibold text-on-accent disabled:opacity-50">Use this answer</button></form>
}

function AssistantTurn({ title, detail, children }: Readonly<{ title: string; detail: string; children: React.ReactNode }>) {
  return <Card padding={5}><div className="grid gap-4"><div><Text className="text-sm font-semibold text-accent">AE</Text><Heading level={2} className="mt-1">{title}</Heading><Text color="secondary" className="mt-2">{detail}</Text></div>{children}</div></Card>
}
function CustomerMessage({ children }: Readonly<{ children: React.ReactNode }>) { return <div className="ml-auto max-w-[85%] rounded-md bg-accent px-4 py-3 text-on-accent"><p>{children}</p></div> }
function BriefRow({ label, value }: Readonly<{ label: string; value: string }>) { return <div className="grid gap-1 sm:grid-cols-[7rem_1fr]"><Text className="text-sm font-semibold">{label}</Text><Text color="secondary">{value}</Text></div> }
function FindingMessage() { return <Card padding={5} aria-live="polite"><div className="grid gap-3"><Text className="text-sm font-semibold text-accent">Checking connected businesses</Text><Heading level={2}>Finding options that match your brief…</Heading><Text color="secondary">This can take a moment. You can leave and return to this request. Nothing has been booked or purchased.</Text></div></Card> }
function Unsupported({ actions }: Pick<VariantProps, 'actions'>) { return <Card padding={5}><div className="grid gap-4"><Text className="text-sm font-semibold text-accent">Not supported yet</Text><Heading level={2}>AE cannot find a connected capability for this request.</Heading><Text color="secondary">Try changing the result you need. A business listing alone does not mean the business can respond through AE.</Text><Button label="Change my request" variant="primary" clickAction={actions.edit} /></div></Card> }
function NoOptions({ actions }: Pick<VariantProps, 'actions'>) { return <Card padding={5}><div className="grid gap-4"><Text className="text-sm font-semibold text-accent">No connected options</Text><Heading level={2}>No eligible business returned an option this time.</Heading><Text color="secondary">Nothing failed silently and nothing was booked. Change the request or try again later.</Text><Button label="Change my request" variant="primary" clickAction={actions.edit} /></div></Card> }
function ProgressStep({ number, label, active, complete }: Readonly<{ number: number; label: string; active: boolean; complete: boolean }>) { return <li className={`flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 ${active ? 'border-accent bg-card' : 'border-transparent'}`} aria-current={active ? 'step' : undefined}><span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold">{complete ? '✓' : number}</span><span className="truncate font-medium">{label}</span></li> }

function PrototypeStateReadback({ state }: Readonly<{ state: PrototypeState }>) {
  return <details className="fixed bottom-24 right-4 z-30 max-w-xs rounded-md border border-border bg-card p-3 text-xs shadow-lg"><summary className="cursor-pointer font-semibold">Prototype state</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap">{JSON.stringify({ ...state, nextAction: nextAction(state.stage) }, null, 2)}</pre></details>
}

function PrototypeSwitcher({ current, scenario, onScenarioChange, onChange }: Readonly<{ current: CustomerRequestPrototypeVariant; scenario: Scenario; onScenarioChange: (scenario: Scenario) => void; onChange: (variant: CustomerRequestPrototypeVariant) => void }>) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return
      if (event.key === 'ArrowLeft') cycle(-1)
      if (event.key === 'ArrowRight') cycle(1)
    }
    const cycle = (direction: number) => {
      const index = variants.indexOf(current)
      onChange(variants[(index + direction + variants.length) % variants.length] ?? 'A')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [current, onChange])
  const cycle = (direction: number) => {
    const index = variants.indexOf(current)
    onChange(variants[(index + direction + variants.length) % variants.length] ?? 'A')
  }
  return <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center justify-center gap-2 rounded-full bg-primary px-3 py-2 text-on-accent shadow-xl" aria-label="Prototype controls"><button className="min-h-11 min-w-11 rounded-full font-semibold outline-none focus-visible:ring-2 focus-visible:ring-white" onClick={() => cycle(-1)} aria-label="Previous variant">←</button><span className="min-w-36 text-center text-sm font-semibold">{current} — {variantNames[current]}</span><button className="min-h-11 min-w-11 rounded-full font-semibold outline-none focus-visible:ring-2 focus-visible:ring-white" onClick={() => cycle(1)} aria-label="Next variant">→</button><label className="flex items-center gap-2 border-l border-white/30 pl-3 text-xs">Scenario<select value={scenario} onChange={(event) => onScenarioChange(event.target.value as Scenario)} className="min-h-9 rounded-md bg-card px-2 text-primary"><option value="available">Available</option><option value="unsupported">Unsupported</option><option value="no_options">No options</option></select></label></div>
}

function nextAction(stage: Stage): string {
  if (stage === 'start') return 'describe_need'
  if (stage === 'clarify') return 'provide_decision_changing_information'
  if (stage === 'ready') return 'find_options'
  if (stage === 'finding') return 'wait_or_return_later'
  return 'revise_request'
}
