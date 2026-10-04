import { useState, type FormEvent } from 'react'

import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { Select } from '@/components/arc/select/select'
import type { AdminObjectKind } from '@/lib/operator/admin-console/contracts'
import type { AdminObjectSearchInput, AdminObjectSearchState } from '../object-search.contracts'
import {
  ADMIN_OBJECT_KIND_OPTIONS,
  ADMIN_OBJECT_SEARCH_COPY,
  adminObjectKindSchema,
} from '../object-search.contracts'
import './ObjectSearchComposition.css'

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
    <form className="arc-market arc-object-search" onSubmit={submit} aria-busy={busy}>
      <div className="arc-object-search-fields">
        <Select
          id="admin-object-kind"
          label={ADMIN_OBJECT_SEARCH_COPY.kindLabel}
          options={[...ADMIN_OBJECT_KIND_OPTIONS]}
          value={kind}
          onValueChange={(value) => {
            const parsed = adminObjectKindSchema.safeParse(value)
            if (parsed.success) setKind(parsed.data)
          }}
        />
        <Input
          id="admin-object-ref"
          label={ADMIN_OBJECT_SEARCH_COPY.referenceLabel}
          type="search"
          autoComplete="off"
          spellCheck={false}
          value={ref}
          placeholder={ADMIN_OBJECT_SEARCH_COPY.referencePlaceholder}
          aria-invalid={message?.tone === 'error' ? true : undefined}
          aria-describedby={message === undefined ? undefined : 'admin-object-search-message'}
          onChange={(event) => setRef(event.currentTarget.value)}
        />
      </div>
      <Button type="submit" size="md" className="arc-object-search-action" disabled={busy}>
        {busy ? ADMIN_OBJECT_SEARCH_COPY.searching : ADMIN_OBJECT_SEARCH_COPY.submit}
      </Button>
      {message === undefined ? null : (
        <p
          id="admin-object-search-message"
          role={message.tone === 'error' ? 'alert' : 'status'}
          className="arc-object-search-message"
        >
          {message.text}
        </p>
      )}
    </form>
  )
}
