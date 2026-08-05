import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { CUSTOMER_REQUEST_HUMAN_COMPREHENSION } from '@/modules/customer-request/public-comprehension'

export function StartRequestPanel({
  need,
  onNeedChange,
  onSubmit,
  editingRevision,
}: {
  need: string
  onNeedChange: (value: string) => void
  onSubmit: () => void
  editingRevision: number | undefined
}) {
  return (
    <>
      {/* The composer is the object on this surface, not a field beside a
          button. Controls live inside the field the way an answer-engine
          input does, so nothing competes with the one thing to do. */}
      <form
        onSubmit={(event) => { event.preventDefault(); onSubmit() }}
        className="grid min-w-0 gap-3 rounded-2xl border border-border bg-card p-4 shadow-low transition-[border-color,box-shadow] duration-150 focus-within:border-brand focus-within:shadow-medium"
      >
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel className="sr-only" htmlFor="customer-need">What are you looking for?</FieldLabel>
            <Textarea
              id="customer-need"
              value={need}
              onChange={(event) => onNeedChange(event.target.value)}
              rows={2}
              maxLength={2_000}
              required
              placeholder="A burst pipe in Parramatta, someone today, under $500"
              className="min-h-16 min-w-0 resize-none"
            />
          </Field>
          <Field orientation="horizontal" className="justify-end">
            <Button type="submit" variant="default" disabled={need.trim().length === 0} className="min-h-11 rounded-full px-6">
              Find options
            </Button>
          </Field>
        </FieldGroup>
      </form>
      {editingRevision === undefined ? null : (
        <p className="block text-sm text-muted-foreground">Editing revision {editingRevision} of this Request.</p>
      )}
      {/* The terms stay reachable and complete, one click away, instead of
          forming a wall of qualifiers between the promise and the input. The
          trigger hugs its label; a full-width row strands the chevron. */}
      <div className="mx-auto max-w-md">
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="text-sm font-semibold">How AE works</CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="grid gap-2 pt-3 text-start">
              {[
                CUSTOMER_REQUEST_HUMAN_COMPREHENSION.examples,
                CUSTOMER_REQUEST_HUMAN_COMPREHENSION.support,
                CUSTOMER_REQUEST_HUMAN_COMPREHENSION.authority,
                'AE asks for details only when the option needs them.',
              ].map((line) => <li key={line}>
                <p className="text-sm text-muted-foreground">{line}</p>
              </li>)}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </>
  )
}
