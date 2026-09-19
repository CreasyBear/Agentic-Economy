import { makeFunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
import { useRef } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

import {
  TaxProfileForm,
  type TaxProfileInitialData,
  type TaxProfileSubmitPayload,
} from '@/components/ae/settings/TaxProfileForm'

type CustomerTaxFactsRead =
  | Readonly<{ kind: 'missing'; accountRef: string; revision: 0 }>
  | Readonly<{
      kind: 'available'
      accountRef: string
      abn: string
      gstRegistered: boolean
      legalName: string
      addressLine1: string
      addressLine2?: string
      locality: string
      region?: string
      postalCode: string
      country: 'AU'
      legalCustomerRef: string
      effectiveAt: number
      updatedAt: number
      revision: number
    }>

const readCustomerTaxFactsRef = makeFunctionReference<
  'query',
  Record<string, never>,
  CustomerTaxFactsRead
>('moneyCustomerTaxFacts:readCustomerTaxFacts')

const upsertCustomerTaxFactsRef = makeFunctionReference<
  'mutation',
  Readonly<{
    abn: string
    legalName: string
    addressLine1: string
    addressLine2?: string
    locality: string
    region?: string
    postalCode: string
    country?: string
    gstRegistered?: boolean
    expectedRevision: number
    correlationRef: string
    idempotencyRef: string
  }>,
  unknown
>('moneyCustomerTaxFacts:upsertCustomerTaxFacts')

function toInitialData(facts: CustomerTaxFactsRead): TaxProfileInitialData {
  if (facts.kind === 'missing') {
    return { kind: 'missing', revision: 0 }
  }

  return {
    kind: 'available',
    abn: facts.abn,
    legalName: facts.legalName,
    addressLine1: facts.addressLine1,
    ...(facts.addressLine2 !== undefined ? { addressLine2: facts.addressLine2 } : {}),
    locality: facts.locality,
    ...(facts.region !== undefined ? { region: facts.region } : {}),
    postalCode: facts.postalCode,
    country: 'AU',
    revision: facts.revision,
  }
}

export function TaxProfileFormSection() {
  const facts = useQuery(readCustomerTaxFactsRef)
  const upsertCustomerTaxFacts = useMutation(upsertCustomerTaxFactsRef)
  const saveIdempotencyRef = useRef(`idem:tax-profile:${crypto.randomUUID()}`)

  if (facts === undefined) {
    return <Skeleton className="min-h-[28rem] w-full max-w-lg" aria-busy="true" />
  }

  const handleSubmit = async (payload: TaxProfileSubmitPayload) => {
    await upsertCustomerTaxFacts({
      abn: payload.abn,
      legalName: payload.legalName,
      addressLine1: payload.addressLine1,
      ...(payload.addressLine2 !== undefined ? { addressLine2: payload.addressLine2 } : {}),
      locality: payload.locality,
      ...(payload.region !== undefined ? { region: payload.region } : {}),
      postalCode: payload.postalCode,
      country: payload.country,
      expectedRevision: payload.expectedRevision,
      correlationRef: 'ui:tax-profile:save',
      idempotencyRef: saveIdempotencyRef.current,
    })
    saveIdempotencyRef.current = `idem:tax-profile:${crypto.randomUUID()}`
  }

  return <TaxProfileForm initialData={toInitialData(facts)} onSubmit={handleSubmit} />
}
