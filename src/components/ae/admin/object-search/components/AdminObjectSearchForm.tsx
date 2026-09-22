import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AdminObjectKind } from '@/lib/operator/admin-console/contracts'
import type { AdminObjectSearchInput, AdminObjectSearchState } from '../object-search.contracts'
import {
  ADMIN_OBJECT_KIND_OPTIONS,
  ADMIN_OBJECT_SEARCH_COPY,
  adminObjectKindSchema,
} from '../object-search.contracts'

export type AdminObjectSearchFormProps = Readonly<{
  initialKind?: AdminObjectKind
  initialRef?: string
  state: AdminObjectSearchState
  onSubmit: (input: AdminObjectSearchInput) => void
}>

export function AdminObjectSearchForm({
  initialKind = 'call',
  initialRef = '',
  state,
  onSubmit,
}: AdminObjectSearchFormProps) {
  const [kind, setKind] = useState<AdminObjectKind>(initialKind)
  const [ref, setRef] = useState(initialRef)
  const busy = state.kind === 'searching'
  const message = state.kind === 'message' ? state : undefined

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!busy) onSubmit({ kind, ref })
  }

  return (
    <form className="grid max-w-2xl gap-related" onSubmit={submit} aria-busy={busy}>
      <FieldGroup className="gap-related sm:grid sm:grid-cols-[12rem_minmax(0,1fr)]">
        <Field>
          <FieldLabel htmlFor="admin-object-kind">{ADMIN_OBJECT_SEARCH_COPY.kindLabel}</FieldLabel>
          <Select
            value={kind}
            onValueChange={(value) => {
              const parsed = adminObjectKindSchema.safeParse(value)
              if (parsed.success) setKind(parsed.data)
            }}
          >
            <SelectTrigger id="admin-object-kind" className="min-h-touch w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {ADMIN_OBJECT_KIND_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field data-invalid={message?.tone === 'error' ? 'true' : undefined}>
          <FieldLabel htmlFor="admin-object-ref">{ADMIN_OBJECT_SEARCH_COPY.referenceLabel}</FieldLabel>
          <Input
            id="admin-object-ref"
            type="search"
            autoComplete="off"
            spellCheck={false}
            value={ref}
            placeholder={ADMIN_OBJECT_SEARCH_COPY.referencePlaceholder}
            aria-invalid={message?.tone === 'error' ? true : undefined}
            aria-describedby={message === undefined ? undefined : 'admin-object-search-message'}
            onChange={(event) => setRef(event.currentTarget.value)}
          />
        </Field>
      </FieldGroup>
      <Button type="submit" className="min-h-touch w-fit" disabled={busy}>
        {busy ? ADMIN_OBJECT_SEARCH_COPY.searching : ADMIN_OBJECT_SEARCH_COPY.submit}
      </Button>
      {message === undefined ? null : (
        <p
          id="admin-object-search-message"
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={message.tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
        >
          {message.text}
        </p>
      )}
    </form>
  )
}
