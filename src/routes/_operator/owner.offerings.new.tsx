import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useRef } from 'react'
import { Banner } from '@astryxdesign/core/Banner'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeOwnerOfferingEditor, emptyOwnerOfferingEditorValue } from '@/components/ae/offerings/AeOwnerOfferings'
import type { OwnerOfferingEditorValue } from '@/components/ae/offerings/AeOwnerOfferings'
import { readOwnerOfferingSupplyServer, saveOwnerOfferingServer } from '@/components/ae/offerings/owner-offering.functions'
import type { OwnerOfferingSupplyReadResult } from '@/components/ae/offerings/owner-offering.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/offerings/new')({
  ...operatorRouteOptions,
  loader: () => readOwnerOfferingSupplyServer(),
  head: () => ({ meta: [{ title: 'Add an Offering | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: NewOwnerOfferingRoute,
})

function NewOwnerOfferingRoute() {
  const result = Route.useLoaderData()
  const save = useServerFn(saveOwnerOfferingServer)
  const navigate = useNavigate()
  const requestKeyRef = useRef<string | undefined>(undefined)
  const seed = result.kind === 'available' ? readSeed(result) : undefined

  return (
    <AeOperatorShell operatorRole="owner" title="Add an Offering" description="Start with what you provide. A contact path can be added now or later." currentPath="/owner/offerings" breadcrumbs={[{ label: 'Offerings', href: '/owner/offerings' }, { label: 'Add' }]}>
      {result.kind !== 'available' ? <Banner status="error" title="Offering editor unavailable" description="Claimed owner access is required before an Offering can be saved." /> : (
        <AeOwnerOfferingEditor
          initialValue={emptyOwnerOfferingEditorValue}
          draftKey={result.businessId}
          {...(seed === undefined ? {} : { seed })}
          onSave={async (value) => {
            requestKeyRef.current ??= crypto.randomUUID()
            const saved = await save({ data: { businessId: result.businessId, requestKey: requestKeyRef.current, value } })
            if (saved.kind === 'saved' && saved.value.offeringRef !== undefined) {
              requestKeyRef.current = undefined
              void navigate({ to: '/owner/offerings/$offeringRef', params: { offeringRef: saved.value.offeringRef } })
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
  const latest = [...result.offerings].sort((left, right) => right.updatedAt - left.updatedAt)[0]
  const category = latest?.revision?.category.trim()
  if (category === undefined || category.length === 0) return undefined
  return { label: category, value: { category } }
}
