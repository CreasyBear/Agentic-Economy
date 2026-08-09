import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

export type SupplySourceKind = 'openapi_http' | 'mcp' | 'agent_plugin_mcp'
export type SupplyEndpointConfigValue = Readonly<{
  sourceKind: SupplySourceKind
  descriptor: string
  selector: string
  endpointUrl: string
  method: 'GET' | 'POST'
  queryMapping: string
  protocolVersion: string
  toolName: string
  requestTimeoutMs: number
}>

export function AeSupplyEndpointConfigStep({
  initialValue,
  disabled,
  onSubmit,
}: Readonly<{
  initialValue?: Partial<SupplyEndpointConfigValue>
  disabled?: boolean
  onSubmit: (value: SupplyEndpointConfigValue) => Promise<void>
}>) {
  const [value, setValue] = useState<SupplyEndpointConfigValue>(() => ({
    sourceKind: initialValue?.sourceKind ?? 'openapi_http',
    descriptor: initialValue?.descriptor ?? '',
    selector: initialValue?.selector ?? '',
    endpointUrl: initialValue?.endpointUrl ?? '',
    method: initialValue?.method ?? 'POST',
    queryMapping: initialValue?.queryMapping ?? '',
    protocolVersion: initialValue?.protocolVersion ?? '',
    toolName: initialValue?.toolName ?? '',
    requestTimeoutMs: initialValue?.requestTimeoutMs ?? 10_000,
  }))
  const [pending, setPending] = useState(false)
  const formDisabled = disabled || pending

  function update(patch: Partial<SupplyEndpointConfigValue>) {
    setValue((current) => ({ ...current, ...patch }))
  }

  async function submit() {
    setPending(true)
    try {
      await onSubmit(value)
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader className="p-5 pb-0">
        <CardTitle>
          <p className="block text-sm font-semibold text-muted-foreground">2 · CONNECT YOUR SERVICE</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">Tell AE where your service runs</h2>
        </CardTitle>
        <p className="text-sm text-muted-foreground">Add the connection details so AE can check your service before you publish it.</p>
      </CardHeader>
      <CardContent className="grid gap-5 p-5">
        <details className="rounded-md border border-border p-4">
          <summary className="cursor-pointer font-semibold text-foreground">Advanced connection details</summary>
          <p className="mt-3 text-sm text-muted-foreground">These settings are for the technical setup behind your service.</p>
          <FieldGroup className="mt-4 gap-4">
            <Field {...(formDisabled ? { 'data-disabled': true } : {})}>
              <FieldLabel htmlFor="supply-source-kind">Connection type</FieldLabel>
              <Select value={value.sourceKind} disabled={formDisabled} onValueChange={(next) => update({ sourceKind: sourceKindFromValue(next) })}>
                <SelectTrigger id="supply-source-kind" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="openapi_http">OpenAPI HTTP</SelectItem>
                    <SelectItem value="mcp">MCP</SelectItem>
                    <SelectItem value="agent_plugin_mcp">Agent Plugin MCP</SelectItem>

                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field {...(formDisabled ? { 'data-disabled': true } : {})}>
              <FieldLabel htmlFor="supply-descriptor">Service description (JSON)</FieldLabel>
              <Textarea id="supply-descriptor" value={value.descriptor} disabled={formDisabled} onChange={(event) => update({ descriptor: event.currentTarget.value })} rows={6} className="font-mono text-sm" />
            </Field>
            <Field {...(formDisabled ? { 'data-disabled': true } : {})}>
              <FieldLabel htmlFor="supply-selector">Operation, tool, or resource selector</FieldLabel>
              <Input id="supply-selector" value={value.selector} disabled={formDisabled} onChange={(event) => update({ selector: event.currentTarget.value })} className="min-h-11" />
            </Field>
            <Field {...(formDisabled ? { 'data-disabled': true } : {})}>
              <FieldLabel htmlFor="supply-endpoint-url">Service or server URL</FieldLabel>
              <Input id="supply-endpoint-url" type="url" value={value.endpointUrl} disabled={formDisabled} onChange={(event) => update({ endpointUrl: event.currentTarget.value })} className="min-h-11" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field {...(formDisabled ? { 'data-disabled': true } : {})}>
                <FieldLabel htmlFor="supply-method">HTTP method</FieldLabel>
                <Select value={value.method} disabled={formDisabled} onValueChange={(next) => update({ method: next === 'GET' ? 'GET' : 'POST' })}>
                  <SelectTrigger id="supply-method" className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field {...(formDisabled ? { 'data-disabled': true } : {})}>
                <FieldLabel htmlFor="supply-timeout">Request timeout (milliseconds)</FieldLabel>
                <Input id="supply-timeout" type="number" min={100} max={120000} value={value.requestTimeoutMs} disabled={formDisabled} onChange={(event) => update({ requestTimeoutMs: Number(event.currentTarget.value) })} className="min-h-11" />
              </Field>
            </div>
            <Field {...(formDisabled ? { 'data-disabled': true } : {})}>
              <FieldLabel htmlFor="supply-query-mapping">Query mapping (JSON, when required)</FieldLabel>
              <Textarea id="supply-query-mapping" value={value.queryMapping} disabled={formDisabled} onChange={(event) => update({ queryMapping: event.currentTarget.value })} rows={3} className="font-mono text-sm" />
            </Field>
            {(value.sourceKind === 'mcp' || value.sourceKind === 'agent_plugin_mcp') ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field {...(formDisabled ? { 'data-disabled': true } : {})}>
                  <FieldLabel htmlFor="supply-protocol-version">Protocol version</FieldLabel>
                  <Input id="supply-protocol-version" value={value.protocolVersion} disabled={formDisabled} onChange={(event) => update({ protocolVersion: event.currentTarget.value })} className="min-h-11" />
                </Field>
                <Field {...(formDisabled ? { 'data-disabled': true } : {})}>
                  <FieldLabel htmlFor="supply-tool-name">Tool name</FieldLabel>
                  <Input id="supply-tool-name" value={value.toolName} disabled={formDisabled} onChange={(event) => update({ toolName: event.currentTarget.value })} className="min-h-11" />
                </Field>
              </div>
            ) : null}
            <p className="text-sm text-muted-foreground">Access is selected and resolved by AE on the server after publication admission.</p>
          </FieldGroup>
        </details>
      </CardContent>
      <CardFooter className="p-5 pt-0">
        <Button type="button" variant="default" disabled={formDisabled} aria-busy={pending || undefined} onClick={() => void submit()} className="min-h-11">
          {pending ? 'Checking your service' : 'Check and continue'}
        </Button>
      </CardFooter>
    </Card>
  )
}

function sourceKindFromValue(value: string): SupplySourceKind {
  if (value === 'mcp' || value === 'agent_plugin_mcp') return value
  return 'openapi_http'
}
