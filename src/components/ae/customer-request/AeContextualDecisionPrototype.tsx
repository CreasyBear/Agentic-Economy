import { useEffect, useMemo, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'

/** THROWAWAY PROTOTYPE — contextual search-to-decision interaction, no real supply or mutations. */
export type ContextualEntryAnchor = 'place' | 'category' | 'need' | 'detailed'
type Stage = 'entry' | 'clarify_kind' | 'clarify_place' | 'results' | 'unsupported' | 'no_options'
type Outcome = 'results' | 'unsupported' | 'no_options'

const entryExamples: Readonly<Record<ContextualEntryAnchor, string>> = {
  place: 'Fremantle',
  category: 'Electrician',
  need: 'Somewhere quiet for dinner with my parents',
  detailed: 'Dog-friendly two-bedroom stay near the beach next weekend under $450',
}
const anchorLabels: Readonly<Record<ContextualEntryAnchor, string>> = {
  place: 'Place', category: 'Business type', need: 'Messy need', detailed: 'Detailed request',
}

export function AeContextualDecisionPrototype({ anchor, onAnchorChange }: Readonly<{
  anchor: ContextualEntryAnchor
  onAnchorChange: (anchor: ContextualEntryAnchor) => void
}>) {
  const [query, setQuery] = useState(entryExamples[anchor])
  const [place, setPlace] = useState(anchor === 'place' ? entryExamples.place : '')
  const [kind, setKind] = useState(anchor === 'category' ? entryExamples.category : '')
  const [stage, setStage] = useState<Stage>('entry')
  const [outcome, setOutcome] = useState<Outcome>('results')
  const [refinement, setRefinement] = useState('')
  const understood = useMemo(() => understoodFacts({ anchor, query, place, kind }), [anchor, query, place, kind])

  useEffect(() => {
    setQuery(entryExamples[anchor])
    setPlace(anchor === 'place' ? entryExamples.place : '')
    setKind(anchor === 'category' ? entryExamples.category : '')
    setStage('entry')
    setRefinement('')
  }, [anchor])

  function begin() {
    if (!query.trim()) return
    if (outcome === 'unsupported') return setStage('unsupported')
    if (anchor === 'place') return setStage('clarify_kind')
    if (anchor === 'category' || anchor === 'need') return setStage('clarify_place')
    setPlace('Near the beach')
    setKind('Stay')
    setStage(outcome === 'no_options' ? 'no_options' : 'results')
  }
  function chooseKind(nextKind: string) {
    setKind(nextKind)
    setStage(outcome === 'no_options' ? 'no_options' : 'results')
  }
  function confirmPlace() {
    if (!place.trim()) return
    if (!kind) setKind(anchor === 'need' ? 'Restaurant' : query)
    setStage(outcome === 'no_options' ? 'no_options' : 'results')
  }
  function submitRefinement() {
    if (!refinement.trim()) return
    setRefinement('')
  }

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 pb-40 sm:px-6 lg:py-14">
      <PrototypeBoundary />
      <header className="mx-auto grid max-w-3xl gap-3 text-center">
        <Text className="text-sm font-semibold text-accent">Ask AE</Text>
        <Heading level={1} className="text-4xl font-semibold tracking-tight sm:text-5xl">Start with whatever you know.</Heading>
        <Text type="large" color="secondary">A place, a business type, or the situation itself. AE helps you turn it into a decision.</Text>
      </header>

      <section className="mx-auto grid w-full max-w-3xl gap-3" aria-label="Start a contextual request">
        <form onSubmit={(event) => { event.preventDefault(); begin() }} className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-card p-3 shadow-sm sm:flex-row">
          <label className="sr-only" htmlFor="contextual-query">What are you looking for?</label>
          <textarea id="contextual-query" rows={2} value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-16 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-lg text-primary outline-none" placeholder="Try a place, business type, or need" />
          <button type="submit" disabled={!query.trim()} className="min-h-11 self-end rounded-md bg-accent px-5 font-semibold text-on-accent disabled:opacity-50">Explore</button>
        </form>
        <Text type="supporting" color="secondary" className="text-center">No budget or full specification required to start.</Text>
      </section>

      {stage !== 'entry' ? <ConversationSeed query={query} /> : <EntryPrompt />}
      {stage === 'clarify_kind' ? <KindClarification place={place || query} onChoose={chooseKind} /> : null}
      {stage === 'clarify_place' ? <PlaceClarification query={query} understood={understood} place={place} onPlaceChange={setPlace} onSubmit={confirmPlace} /> : null}
      {stage === 'results' ? <DecisionCanvas query={query} understood={understoodFacts({ anchor, query, place, kind })} refinement={refinement} onRefinementChange={setRefinement} onRefine={submitRefinement} /> : null}
      {stage === 'unsupported' ? <Unsupported query={query} onRestart={() => setStage('entry')} /> : null}
      {stage === 'no_options' ? <NoOptions query={query} understood={understood} onRestart={() => setStage('entry')} /> : null}

      <PrototypeControls anchor={anchor} outcome={outcome} onAnchorChange={onAnchorChange} onOutcomeChange={(next) => { setOutcome(next); setStage('entry') }} />
    </main>
  )
}

function EntryPrompt() {
  return <section className="mx-auto grid w-full max-w-5xl gap-4 border-t border-border pt-8" aria-label="Ways to begin"><div className="grid gap-2 sm:grid-cols-4"><StartExample title="Place" text="Fremantle" /><StartExample title="Business type" text="Electrician" /><StartExample title="Situation" text="Quiet dinner with my parents" /><StartExample title="Detailed" text="Two bedrooms, beach, next weekend" /></div></section>
}
function StartExample({ title, text }: Readonly<{ title: string; text: string }>) { return <div className="rounded-md bg-surface p-4"><Text type="supporting" weight="semibold">{title}</Text><Text color="secondary" className="mt-1">{text}</Text></div> }
function ConversationSeed({ query }: Readonly<{ query: string }>) { return <section className="mx-auto grid w-full max-w-4xl gap-3" aria-label="Conversation"><div className="ml-auto max-w-[85%] rounded-md bg-accent px-4 py-3 text-on-accent"><p>{query}</p></div></section> }

function KindClarification({ place, onChoose }: Readonly<{ place: string; onChoose: (kind: string) => void }>) {
  return <section className="mx-auto grid w-full max-w-4xl gap-4 border-l-2 border-accent pl-4"><div><Text className="text-sm font-semibold text-accent">AE</Text><Heading level={2} className="mt-1">What are you looking for around {place}?</Heading><Text color="secondary" className="mt-2">Choose a direction or describe it in your own words. These are illustrative capability types, not live coverage.</Text></div><div className="flex flex-wrap gap-2">{['Eat & drink', 'Stay', 'Local services', 'Things to do'].map((item) => <button key={item} onClick={() => onChoose(item)} className="min-h-11 rounded-full border border-border bg-card px-4 font-medium hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">{item}</button>)}</div></section>
}

function PlaceClarification({ query, understood, place, onPlaceChange, onSubmit }: Readonly<{ query: string; understood: readonly Fact[]; place: string; onPlaceChange: (place: string) => void; onSubmit: () => void }>) {
  return <section className="mx-auto grid w-full max-w-4xl gap-5"><WorkingUnderstanding facts={understood} missing="Where should AE look?" /><div className="border-l-2 border-accent pl-4"><Text className="text-sm font-semibold text-accent">AE</Text><Heading level={2} className="mt-1">Where should this happen?</Heading><Text color="secondary" className="mt-2">Location changes which connected businesses could be relevant to “{query}”.</Text><form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); onSubmit() }}><label className="sr-only" htmlFor="place-answer">Location</label><input id="place-answer" autoFocus value={place} onChange={(event) => onPlaceChange(event.target.value)} placeholder="Suburb, city, or near me" className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-card px-3 outline-none focus:ring-2 focus:ring-accent" /><button type="submit" disabled={!place.trim()} className="min-h-11 rounded-md bg-accent px-4 font-semibold text-on-accent disabled:opacity-50">Use this location</button></form></div></section>
}

type Fact = Readonly<{ label: string; value: string; basis: 'said' | 'inferred' }>
function WorkingUnderstanding({ facts, missing }: Readonly<{ facts: readonly Fact[]; missing?: string }>) { return <Card padding={4}><div className="grid gap-3"><div className="flex flex-wrap items-center justify-between gap-2"><Text className="text-sm font-semibold text-accent">AE’s working understanding</Text><button className="min-h-11 text-sm font-semibold underline underline-offset-4">Correct</button></div><div className="flex flex-wrap gap-2">{facts.map((fact) => <span key={fact.label} className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm"><strong>{fact.label}:</strong> {fact.value} <span className="text-secondary">· {fact.basis}</span></span>)}{missing ? <span className="rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-secondary">Still needed: {missing}</span> : null}</div></div></Card> }

function DecisionCanvas({ query, understood, refinement, onRefinementChange, onRefine }: Readonly<{ query: string; understood: readonly Fact[]; refinement: string; onRefinementChange: (value: string) => void; onRefine: () => void }>) {
  return <section className="grid min-w-0 gap-6" aria-label="Illustrative decision canvas"><WorkingUnderstanding facts={understood} /><div className="grid gap-3"><Text className="text-sm font-semibold text-accent">Illustrative generative result</Text><Heading level={2} className="text-3xl">Three plausible directions for “{query}”</Heading><Text color="secondary">This prototype demonstrates decision UI only. These are not registered businesses, live availability, prices, or recommendations.</Text></div><div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,.9fr)]"><IllustrativeMap /><div className="grid gap-3">{illustrativeOptions.map((option, index) => <OptionCard key={option.name} option={option} index={index + 1} />)}</div></div><div className="grid gap-3 border-t border-border pt-5"><Heading level={3}>Refine this decision</Heading><div className="flex flex-wrap gap-2">{['Closer', 'Lower cost', 'Quieter', 'More flexible'].map((chip) => <button key={chip} onClick={() => onRefinementChange(chip)} className="min-h-10 rounded-full border border-border bg-card px-4 text-sm font-medium">{chip}</button>)}</div><form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); onRefine() }}><label htmlFor="refine-request" className="sr-only">Ask a follow-up</label><input id="refine-request" value={refinement} onChange={(event) => onRefinementChange(event.target.value)} placeholder="Ask a follow-up, such as ‘which is easiest to get to?’" className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-card px-3 outline-none focus:ring-2 focus:ring-accent" /><button type="submit" disabled={!refinement.trim()} className="min-h-11 rounded-md bg-accent px-4 font-semibold text-on-accent disabled:opacity-50">Refine</button></form></div></section>
}

const illustrativeOptions = [
  { name: 'Illustrative option A', fit: 'Closest to the stated place', detail: '8 min away · moderate price · evidence would appear here' },
  { name: 'Illustrative option B', fit: 'Best fit for the stated context', detail: '14 min away · quieter setting · evidence would appear here' },
  { name: 'Illustrative option C', fit: 'Most flexible alternative', detail: '18 min away · flexible terms · evidence would appear here' },
] as const
function OptionCard({ option, index }: Readonly<{ option: typeof illustrativeOptions[number]; index: number }>) { return <Card padding={4}><article className="grid gap-2"><div className="flex items-center justify-between gap-3"><Heading level={3}>{option.name}</Heading><span className="flex size-7 items-center justify-center rounded-full bg-accent text-sm font-semibold text-on-accent">{index}</span></div><Text weight="semibold">{option.fit}</Text><Text color="secondary">{option.detail}</Text><button className="min-h-11 justify-self-start font-semibold underline underline-offset-4">Compare this option</button></article></Card> }
function IllustrativeMap() { return <div className="relative min-h-80 overflow-hidden rounded-md border border-border bg-surface" aria-label="Illustrative map"><div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'linear-gradient(var(--ae-public-grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--ae-public-grid-line) 1px, transparent 1px)', backgroundSize: '42px 42px' }} />{[{x:'24%',y:'30%',n:1},{x:'62%',y:'42%',n:2},{x:'45%',y:'72%',n:3}].map((pin) => <span key={pin.n} className="absolute flex size-9 items-center justify-center rounded-full bg-accent font-semibold text-on-accent shadow-lg" style={{ left: pin.x, top: pin.y }}>{pin.n}</span>)}<span className="absolute bottom-3 left-3 rounded-md bg-card px-3 py-2 text-xs text-secondary shadow">Illustrative map · no live places</span></div> }

function Unsupported({ query, onRestart }: Readonly<{ query: string; onRestart: () => void }>) { return <Card padding={5} className="mx-auto w-full max-w-4xl"><div className="grid gap-4"><Text className="text-sm font-semibold text-accent">Not supported yet</Text><Heading level={2}>AE has no registered capability for “{query}”.</Heading><Text color="secondary">AE will not turn a listing or a plausible-sounding answer into an option. Change the need or explore a different direction.</Text><Button label="Change the request" variant="primary" clickAction={onRestart} /></div></Card> }
function NoOptions({ query, understood, onRestart }: Readonly<{ query: string; understood: readonly Fact[]; onRestart: () => void }>) { return <section className="mx-auto grid w-full max-w-4xl gap-4"><WorkingUnderstanding facts={understood} /><Card padding={5}><div className="grid gap-4"><Text className="text-sm font-semibold text-accent">No connected options</Text><Heading level={2}>Nothing eligible responded for “{query}”.</Heading><Text color="secondary">The request and criteria are preserved. Refine a constraint, try again later, or stop; AE will not invent availability.</Text><Button label="Refine the request" variant="primary" clickAction={onRestart} /></div></Card></section> }

function PrototypeBoundary() { return <div role="note" className="rounded-md border border-dashed border-border bg-surface px-4 py-3 text-center text-sm text-secondary"><strong>Prototype:</strong> interaction and generative layout only. All options and map data below are illustrative, not connected supply.</div> }
function PrototypeControls({ anchor, outcome, onAnchorChange, onOutcomeChange }: Readonly<{ anchor: ContextualEntryAnchor; outcome: Outcome; onAnchorChange: (anchor: ContextualEntryAnchor) => void; onOutcomeChange: (outcome: Outcome) => void }>) { return <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center justify-center gap-3 rounded-full bg-primary px-4 py-3 text-on-accent shadow-xl"><label className="flex items-center gap-2 text-xs">Entry<select aria-label="Entry anchor" value={anchor} onChange={(event) => onAnchorChange(event.target.value as ContextualEntryAnchor)} className="min-h-9 rounded-md bg-card px-2 text-primary">{(Object.keys(anchorLabels) as ContextualEntryAnchor[]).map((item) => <option key={item} value={item}>{anchorLabels[item]}</option>)}</select></label><label className="flex items-center gap-2 border-l border-white/30 pl-3 text-xs">Result<select aria-label="Result scenario" value={outcome} onChange={(event) => onOutcomeChange(event.target.value as Outcome)} className="min-h-9 rounded-md bg-card px-2 text-primary"><option value="results">Illustrative options</option><option value="unsupported">Unsupported</option><option value="no_options">No connected options</option></select></label></div> }

function understoodFacts(input: Readonly<{ anchor: ContextualEntryAnchor; query: string; place: string; kind: string }>): readonly Fact[] {
  const facts: Fact[] = []
  if (input.anchor === 'place' || input.place) facts.push({ label: 'Where', value: input.place || input.query, basis: 'said' })
  if (input.kind) facts.push({ label: 'Looking for', value: input.kind, basis: 'said' })
  if (input.anchor === 'need') facts.push({ label: 'Setting', value: 'quiet', basis: 'inferred' }, { label: 'For', value: 'dinner with parents', basis: 'inferred' })
  if (input.anchor === 'detailed') facts.push({ label: 'Stay', value: 'two bedrooms, dog-friendly', basis: 'said' }, { label: 'When', value: 'next weekend', basis: 'said' }, { label: 'Maximum', value: '$450', basis: 'said' })
  if (facts.length === 0) facts.push({ label: 'Need', value: input.query, basis: 'said' })
  return facts
}
