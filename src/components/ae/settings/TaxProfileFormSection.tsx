import { makeFunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
import { useRef } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

import { TaxProfileForm } from '@/components/ae/settings/TaxProfileForm'
import {
  toTaxProfileInitialData,
  type CustomerTaxFactsRead,
  type CustomerTaxFactsUpsertInput,
  type TaxProfileSubmitPayload,
} from '@/modules/money/tax-profile.view-model'

const readCustomerTaxFactsRef = makeFunctionReference<
  'query',
  Record<string, never>,
  CustomerTaxFactsRead
>('moneyCustomerTaxFacts:readCustomerTaxFacts')

const upsertCustomerTaxFactsRef = makeFunctionReference<
  'mutation',
  CustomerTaxFactsUpsertInput,
  unknown
>('moneyCustomerTaxFacts:upsertCustomerTaxFacts')

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

  return <TaxProfileForm initialData={toTaxProfileInitialData(facts)} onSubmit={handleSubmit} />
}
