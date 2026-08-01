import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

export function Clarification({ prompt, answer, setAnswer, submit }: { prompt: string; answer: string; setAnswer: (answer: string) => void; submit: () => void }) { return <form className="pt-5" onSubmit={(event) => { event.preventDefault(); submit() }}><Separator /><FieldGroup className="pt-5"><Field orientation="horizontal" className="flex flex-col gap-2 sm:flex-row"><FieldLabel htmlFor="clarification-answer" className="sr-only">{prompt}</FieldLabel><Input id="clarification-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Add a detail…" className="min-h-11 min-w-0 flex-1" /><Button type="submit" variant="default" disabled={!answer.trim()} className="min-h-11 shrink-0">Continue</Button></Field></FieldGroup></form> }
