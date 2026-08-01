import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useRef } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeOwnerOfferingEditor, emptyOwnerOfferingEditorValue } from '@/components/ae/offerings/AeOwnerOfferings'
import type { OwnerOfferingEditorValue } from '@/components/ae/offerings/AeOwnerOfferings'
import { readOwnerOfferingSupplyServer, saveOwnerOfferingServer } from '@/components/ae/offerings/owner-offering.functions'
import type { OwnerOfferingSupplyReadResult } from '@/components/ae/offerings/owner-offering.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/offerings/new')({
  ...operatorRouteOptions,
  validateSearch: (search: Record<string, unknown>): Readonly<{ next?: 'supply' }> => search.next === 'supply' ? { next: 'supply' } : {},
  loader: () => readOwnerOfferingSupplyServer(),
  head: () => ({ meta: [{ title: 'Add an Offering | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: NewOwnerOfferingRoute,
})

function NewOwnerOfferingRoute() {
  const search = Route.useSearch()
  const result = Route.useLoaderData()
  const save = useServerFn(saveOwnerOfferingServer)
  const navigate = useNavigate()
  const requestKeyRef = useRef<string | undefined>(undefined)
  const seed = result.kind === 'available' ? readSeed(result) : undefined

  return (
    <AeOperatorShell operatorRole="owner" title="Add an Offering" description="Start with what you provide. A contact path can be added now or later." currentPath="/owner/offerings" breadcrumbs={[{ label: 'Offerings', href: '/owner/offerings' }, { label: 'Add' }]}>
      {result.kind !== 'available' ? <Alert variant="destructive"><AlertTitle>Offering editor unavailable</AlertTitle><AlertDescription>Claimed owner access is required before an Offering can be saved.</AlertDescription></Alert> : (
        <AeOwnerOfferingEditor
          initialValue={emptyOwnerOfferingEditorValue}
          draftKey={result.businessId}
          {...(seed === undefined ? {} : { seed })}
          onSave={async (value) => {
            requestKeyRef.current ??= crypto.randomUUID()
            const saved = await save({ data: { businessId: result.businessId, requestKey: requestKeyRef.current, value } })
            if (saved.kind === 'saved' && saved.value.offeringRef !== undefined) {
              void navigate(search.next === 'supply'
                ? { to: '/owner/supply/$offeringRef', params: { offeringRef: saved.value.offeringRef } }
                : { to: '/owner/offerings/$offeringRef', params: { offeringRef: saved.value.offeringRef } })
            }
            return saved
          }}
        />
      )}
    </AeOperatorShell>
  )
}

/**
 * The claim's service facts are not reachable from this read, so the quick
 * start seeds the category from the owner's most recent Offering instead.
 * Seeding from the claim would need new source plumbing; recorded as follow-up.
 */
function readSeed(
  result: Extract<OwnerOfferingSupplyReadResult, { kind: 'available' }>,
): Readonly<{ label: string; value: Partial<OwnerOfferingEditorValue> }> | undefined {
  const latest = result.offerings.toSorted((left, right) => right.updatedAt - left.updatedAt)[0]
  const category = latest?.revision?.category.trim()
  if (category === undefined || category.length === 0) return undefined
  return { label: category, value: { category } }
}
