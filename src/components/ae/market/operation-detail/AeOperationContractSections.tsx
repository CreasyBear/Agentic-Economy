import type { ReactNode } from 'react'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import { Separator } from '@/components/ui/separator'
import { formatUtcTimestamp, timestampIso } from '@/lib/ui/format-time'
import type {
  PublicOperationDescriptor,
  PublicOperationParameter,
} from '@/modules/capability-supply/public'

import type { OperationInspectorModel } from './operation-inspector-model'
import { operationLabel } from './operation-inspector-model'

export function AeOperationContractSections({
  operation,
  model,
  onOpenTechnicalContract,
}: Readonly<{
  operation: PublicOperationDescriptor
  model: OperationInspectorModel
  onOpenTechnicalContract: () => void
}>) {
  const requiredParameters = operation.parameters?.filter(({ required }) => required) ?? []
  const optionalParameters = operation.parameters?.filter(({ required }) => !required) ?? []

  return (
    <div className="grid min-w-0 gap-6">
      <AeSection
        id="parameters"
        title="Parameters"
        description="The fields your agent needs before it calls this Operation."
      >
        {operation.parameters === undefined ? (
          <p className="text-sm text-muted-foreground">
            No flat parameter list is published.{' '}
            <button
              type="button"
              onClick={onOpenTechnicalContract}
              className="font-medium text-foreground underline underline-offset-4"
            >
              Read the input JSON Schema
            </button>{' '}
            before calling.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <ParameterList
              title="Required parameters"
              parameters={requiredParameters}
              empty="No required parameters."
            />
            <ParameterList
              title="Optional parameters"
              parameters={optionalParameters}
              empty="No optional parameters."
            />
          </div>
        )}
      </AeSection>

      <AeSection
        title="Example input"
        description="Published input only. Missing examples are never inferred."
      >
        <Example
          value={model.inputExample?.input}
          empty="No example input is published. Open schemas to inspect the exact input contract."
        />
      </AeSection>

      <AeSection
        id="price-and-terms"
        title="Price and terms"
        description="The exact buyer authorization and published commercial terms for this capability."
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact
            label="Commercial relationship"
            value={`${operationLabel(operation.commercial.relationship.kind)}: ${operation.commercial.relationship.summary}`}
          />
          <Fact label="Provider" value={operation.business.name} />
        </dl>
        <TermList terms={operation.commercial.materialTerms} />
      </AeSection>

      <AeSection
        title="Readiness and reliability"
        description="Current readiness, named completion evidence, and recovery behavior. Publication alone is not usage evidence."
      >
        <ReadinessFacts operation={operation} model={model} />
        <EvidenceList operation={operation} />
      </AeSection>
    </div>
  )
}

/**
 * The compact inspector preserves the same contract truth but collapses it so
 * the primary decision and continuation remain in the first viewport.
 */
export function AeOperationCompactContract({
  operation,
  model,
}: Readonly<{
  operation: PublicOperationDescriptor
  model: OperationInspectorModel
}>) {
  const requiredParameters = operation.parameters?.filter(({ required }) => required) ?? []
  const optionalParameters = operation.parameters?.filter(({ required }) => !required) ?? []

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="contract" className="rounded-card border bg-card px-related">
        <AccordionTrigger className="min-h-touch hover:no-underline">
          Inputs, terms, risks, and evidence
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid gap-related">
            <ContractGroup title="Inputs">
              {operation.parameters === undefined ? (
                <p className="text-sm text-muted-foreground">
                  No flat parameter list is published. Open full details to inspect the exact input schema.
                </p>
              ) : (
                <div className="grid gap-related sm:grid-cols-2">
                  <ParameterList title="Required" parameters={requiredParameters} empty="None" />
                  <ParameterList title="Optional" parameters={optionalParameters} empty="None" />
                </div>
              )}
              <Example
                title="Published example input"
                value={model.inputExample?.input}
                empty="No example input is published."
              />
            </ContractGroup>

            <Separator />
            <ContractGroup title="Readiness and recovery">
              <ReadinessFacts operation={operation} model={model} />
            </ContractGroup>

            <Separator />
            <ContractGroup title="Evidence">
              <EvidenceList operation={operation} />
            </ContractGroup>

            <Separator />
            <ContractGroup title="Data use and effects">
              <DataUseList operation={operation} />
              <EffectsList operation={operation} />
            </ContractGroup>

            <p className="text-xs text-muted-foreground">
              Open full details for complete schemas, provenance, transport, and price evidence references.
            </p>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

export function AeOperationTechnicalContract({
  operation,
}: Readonly<{ operation: PublicOperationDescriptor }>) {
  return (
    <div className="grid gap-6">
      <dl className="grid gap-3 sm:grid-cols-2">
        <Fact label="Operation reference">
          <AeCopyReference label="reference" value={operation.operationRef} />
        </Fact>
        <Fact label="Operation ID" value={operation.operationId} />
        <Fact
          label="Capability"
          value={`${operation.contract.capabilityId} · version ${operation.contract.version}`}
        />
        <Fact label="Publisher" value={operationLabel(operation.provenance.publisher)} />
        <Fact label="Source kind" value={operationLabel(operation.provenance.sourceKind)} />
        <Fact
          label="Transport"
          value={`${operation.transport.method}${operation.transport.pathTemplate === undefined ? '' : ` ${operation.transport.pathTemplate}`}`}
        />
        <Fact label="Request timeout" value={`${operation.transport.requestTimeoutMs} ms`} />
        {operation.payment === undefined ? null : (
          <Fact label="Payment network" value={`${operation.payment.network} · ${operation.payment.asset}`} />
        )}
        <Fact
          label="Price digest"
          value={operation.commercial.priceEvidence?.priceDigest ?? 'Not published'}
        />
        <Fact
          label="Price source"
          value={operation.commercial.priceEvidence?.sourceRef ?? 'Not published'}
        />
        <Fact
          label="Price evidence"
          value={operation.commercial.priceEvidence?.evidenceRefs.join(', ') || 'Not published'}
        />
      </dl>
      <ContractGroup title="Data use">
        <DataUseList operation={operation} />
      </ContractGroup>
      <ContractGroup title="Effects and authority">
        <EffectsList operation={operation} />
      </ContractGroup>
      <Schema title="Input JSON Schema" value={operation.contract.inputJsonSchema} />
      <Schema title="Output JSON Schema" value={operation.contract.outputJsonSchema} />
    </div>
  )
}

function ContractGroup({
  title,
  children,
}: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="grid min-w-0 gap-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  )
}

function ReadinessFacts({
  operation,
  model,
}: Readonly<{
  operation: PublicOperationDescriptor
  model: OperationInspectorModel
}>) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <Fact label="Status" value={model.readinessLabel} />
      <TimeFact label="Readiness verified" value={operation.availability.observedAt} />
      <TimeFact label="Readiness valid until" value={operation.availability.validUntil} />
      <Fact label="Idempotency" value={operationLabel(operation.recovery.idempotency)} />
      <Fact label="Recovery" value={operationLabel(operation.recovery.recovery)} />
      <Fact label="Cancellation" value={operationLabel(operation.cancellation.kind)} />
      <Fact label="Observed calls" value="Not available on this descriptor" />
    </dl>
  )
}

function EvidenceList({
  operation,
}: Readonly<{ operation: PublicOperationDescriptor }>) {
  if (operation.evidence.length === 0) {
    return <p className="text-sm text-muted-foreground">No output evidence pointers are declared.</p>
  }
  return (
    <ItemGroup aria-label="Output evidence">
      {operation.evidence.map((evidence) => (
        <Item key={evidence.evidenceId} size="sm">
          <ItemContent>
            <ItemTitle>{operationLabel(evidence.purpose)}</ItemTitle>
            <ItemDescription className="line-clamp-none break-all">
              {evidence.evidenceId} · {evidence.outputPointer}
            </ItemDescription>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  )
}

function DataUseList({
  operation,
}: Readonly<{ operation: PublicOperationDescriptor }>) {
  if (operation.dataUse.length === 0) {
    return <p className="text-sm text-muted-foreground">No data-use effects are declared.</p>
  }
  return (
    <ItemGroup aria-label="Data use">
      {operation.dataUse.map((effect) => (
        <Item
          key={`${effect.effectId}:${effect.inputPointer}:${effect.phase}`}
          size="sm"
        >
          <ItemContent>
            <ItemTitle>
              {operationLabel(effect.classification)} · {effect.inputPointer}
            </ItemTitle>
            <ItemDescription className="line-clamp-none break-all">
              {effect.effectId} · {operationLabel(effect.phase)} ·{' '}
              {operationLabel(effect.recipient)} · {effect.purposes.join(', ')}
            </ItemDescription>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  )
}

function EffectsList({
  operation,
}: Readonly<{ operation: PublicOperationDescriptor }>) {
  if (operation.effects.length === 0) {
    return <p className="text-sm text-muted-foreground">No consequential effects are declared.</p>
  }
  return (
    <ItemGroup aria-label="Effects and authority">
      {operation.effects.map((effect) => (
        <Item
          key={`${effect.effectId}:${effect.class}:${effect.authority}:${effect.reversibility}`}
          size="sm"
        >
          <ItemContent>
            <ItemTitle>{operationLabel(effect.class)}</ItemTitle>
            <ItemDescription className="line-clamp-none break-all">
              {effect.effectId} · {operationLabel(effect.authority)} ·{' '}
              {operationLabel(effect.reversibility)}
            </ItemDescription>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  )
}

function ParameterList({
  title,
  parameters,
  empty,
}: Readonly<{
  title: string
  parameters: readonly PublicOperationParameter[]
  empty: string
}>) {
  return (
    <section className="grid content-start gap-3">
      <h3 className="font-semibold text-foreground">{title}</h3>
      {parameters.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ItemGroup>
          {parameters.map((parameter) => (
            <Item key={`${parameter.group}:${parameter.name}`} size="sm">
              <ItemContent>
                <ItemTitle>
                  <code className="font-mono text-sm">{parameter.name}</code>
                </ItemTitle>
                <ItemDescription className="line-clamp-none">
                  {parameter.type} · {parameter.group}
                  {parameter.description === undefined ? null : ` · ${parameter.description}`}
                  {parameter.enumValues === undefined
                    ? null
                    : ` · Allowed: ${parameter.enumValues.join(', ')}`}
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}
    </section>
  )
}

function TermList({
  terms,
}: Readonly<{ terms: PublicOperationDescriptor['commercial']['materialTerms'] }>) {
  if (terms.length === 0) {
    return <p className="text-sm text-muted-foreground">No additional material terms are published.</p>
  }
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {terms.map((term) => (
        <Fact key={`${term.label}:${term.value}`} label={term.label} value={term.value} />
      ))}
    </dl>
  )
}

function Example({
  title,
  value,
  empty,
}: Readonly<{ title?: string; value?: unknown; empty: string }>) {
  return (
    <section className="grid min-w-0 gap-2">
      {title === undefined ? null : (
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      )}
      {value === undefined ? (
        <p className="text-sm leading-6 text-muted-foreground">{empty}</p>
      ) : (
        <pre className="max-h-80 overflow-auto bg-muted px-gutter py-3 text-xs text-foreground">
          <code>{JSON.stringify(value, null, 2)}</code>
        </pre>
      )}
    </section>
  )
}

function Schema({
  title,
  value,
}: Readonly<{ title: string; value: Readonly<Record<string, unknown>> }>) {
  return (
    <section className="grid min-w-0 gap-2">
      <h3 className="font-semibold text-foreground">{title}</h3>
      <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs text-foreground">
        <code>{JSON.stringify(value, null, 2)}</code>
      </pre>
    </section>
  )
}

function Fact({
  label,
  value,
  children,
}: Readonly<{ label: string; value?: string; children?: ReactNode }>) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm text-foreground">{children ?? value}</dd>
    </div>
  )
}

function TimeFact({
  label,
  value,
}: Readonly<{ label: string; value: number | undefined }>) {
  return value === undefined ? (
    <Fact label={label} value="Not published" />
  ) : (
    <Fact label={label}>
      <time dateTime={timestampIso(value)}>{formatUtcTimestamp(value)} UTC</time>
    </Fact>
  )
}
