import Form from '@rjsf/shadcn'
import { Component, useId, useMemo, useState, type ReactNode } from 'react'
import { BracesIcon, FileJsonIcon } from 'lucide-react'

import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { CodeBlock, CodeBlockActions, CodeBlockCopyButton, CodeBlockHeader, CodeBlockTitle } from '@/components/ai-elements/code-block'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { parsePlaygroundJson, playgroundCallCommand, playgroundSchema, playgroundValidator, supportsPlaygroundForm } from './directory-tool-input'

export type DirectoryToolPlaygroundProps = Readonly<{
  entry: X402DirectoryEntry
  toolRef?: string
  /** Exact admitted Tool contract, never the Bazaar HTTP transport wrapper. */
  inputSchemaJson?: string
  inputExampleJson?: string
}>

/** Loading the admitted contract changes input meaning, so start a fresh editor. */
export function DirectoryToolPlayground(props: DirectoryToolPlaygroundProps) {
  return <PlaygroundEditor key={`${props.entry.resource}:${props.inputSchemaJson ?? 'provider'}`} {...props} />
}

function PlaygroundEditor({ entry, toolRef, inputSchemaJson, inputExampleJson }: DirectoryToolPlaygroundProps) {
  const id = useId()
  const canonical = inputSchemaJson !== undefined
  const schema = useMemo(() => playgroundSchema(inputSchemaJson ?? entry.input?.schemaJson), [inputSchemaJson, entry.input?.schemaJson])
  const example = canonical ? inputExampleJson : entry.input?.exampleJson
  const initialValue = parsePlaygroundJson(example)
  const initialText = initialValue === undefined ? '{}' : JSON.stringify(initialValue, null, 2)
  const [inputText, setInputText] = useState(initialText)
  const formAvailable = supportsPlaygroundForm(schema)
  const [mode, setMode] = useState(formAvailable ? 'form' : 'json')
  const value = useMemo(() => parsePlaygroundJson(inputText), [inputText])
  const validation = useMemo(() => value === undefined ? undefined : schema ? playgroundValidator.validateFormData(value, schema) : undefined, [value, schema])
  const command = canonical ? playgroundCallCommand(toolRef, schema, inputText) : undefined
  const outputExample = parsePlaygroundJson(entry.output?.exampleJson)
  const errors = value === undefined ? ['Enter valid JSON within the input size limit.'] : validation?.errors.map(error => error.stack) ?? []

  const jsonEditor = <FieldGroup>
    <Field data-invalid={errors.length > 0}>
      <FieldLabel htmlFor={id}>Request JSON</FieldLabel>
      <Textarea id={id} value={inputText} onChange={event => setInputText(event.target.value)} spellCheck={false} maxLength={131_072} aria-invalid={errors.length > 0} className="min-h-72 font-mono text-sm" />
      <FieldDescription>{canonical ? 'This is the exact input passed to the AE Call.' : 'The Provider’s HTTP request description. AE input becomes available after the Tool is prepared.'}</FieldDescription>
    </Field>
  </FieldGroup>

  return <div className="@container/playground grid min-w-0 gap-6">
    <div className="grid min-w-0 gap-6 @2xl/playground:grid-cols-2">
      <section className="grid min-w-0 content-start gap-4" aria-labelledby={`${id}-input`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id={`${id}-input`} className="text-lg font-semibold">Input</h3>
          {initialValue !== undefined ? <Button type="button" variant="outline" size="sm" onClick={() => setInputText(initialText)}>Load example</Button> : null}
        </div>
        <p className="text-sm text-muted-foreground">{canonical ? 'Prepare the request your agent will send.' : 'Explore the input published by this Provider.'}</p>
        <Tabs value={mode === 'form' && (!formAvailable || value === undefined) ? 'json' : mode} onValueChange={setMode}>
          <TabsList aria-label="Input format">
            <TabsTrigger value="form" disabled={!formAvailable || value === undefined}>Form</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
            {schema ? <TabsTrigger value="schema">Schema</TabsTrigger> : null}
          </TabsList>
          <TabsContent value="form" className="pt-4">
            {formAvailable && schema && value !== undefined ? <FormBoundary fallback={<div className="grid gap-4"><Alert><AlertDescription>This schema needs the JSON editor.</AlertDescription></Alert>{jsonEditor}</div>}>
              <Form idPrefix={`${id}-form`} schema={schema} validator={playgroundValidator} formData={value}
                onChange={event => setInputText(JSON.stringify(event.formData, null, 2) ?? '')}
                uiSchema={{ 'ui:submitButtonOptions': { norender: true } }}
                experimental_defaultFormStateBehavior={{ emptyObjectFields: 'skipDefaults', arrayMinItems: { populate: 'never' }, constAsDefaults: 'never' }}
                omitExtraData={false} liveOmit={false} showErrorList={false} />
            </FormBoundary> : jsonEditor}
          </TabsContent>
          <TabsContent value="json" className="pt-4">{jsonEditor}</TabsContent>
          {schema ? <TabsContent value="schema" className="pt-4"><JsonExample title={canonical ? 'Tool input schema' : 'Provider request schema'} code={JSON.stringify(schema, null, 2)} /></TabsContent> : null}
        </Tabs>
        {errors.length > 0 ? <Alert><AlertDescription><ul className="list-inside list-disc">{errors.slice(0, 4).map((error, index) => <li key={`${index}:${error}`}>{error}</li>)}</ul></AlertDescription></Alert> : null}
        {!formAvailable ? <p className="text-sm text-muted-foreground">{schema ? 'Use JSON for this schema’s input structure.' : entry.input?.schemaOmitted ? 'The full input schema is too large to display here.' : 'This Provider has not published an input schema.'}</p> : null}
      </section>
      <section className="grid min-w-0 content-start gap-4" aria-labelledby={`${id}-output`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 id={`${id}-output`} className="text-lg font-semibold">Output</h3><Badge variant="secondary">Provider example</Badge></div>
        <p className="text-sm text-muted-foreground">Published sample output. Editing the input does not generate a new result.</p>
        {outputExample !== undefined ? <JsonExample title="Example response" code={JSON.stringify(outputExample, null, 2)} />
          : <Empty className="min-h-72 border"><EmptyHeader><EmptyMedia variant="icon"><FileJsonIcon /></EmptyMedia><EmptyTitle>No output example</EmptyTitle><EmptyDescription>{entry.output?.exampleOmitted ? 'The published example is too large to display here.' : 'The Provider has not included a sample response.'}</EmptyDescription></EmptyHeader></Empty>}
        {entry.output?.schemaJson ? <details><summary className="cursor-pointer text-sm font-medium">View output schema</summary><div className="pt-3"><JsonExample title="Provider output schema" code={entry.output.schemaJson} /></div></details> : null}
      </section>
    </div>
    <section className="grid min-w-0 gap-3 rounded-xl border bg-muted/30 p-5" aria-labelledby={`${id}-agent`}>
      <h3 id={`${id}-agent`} className="flex items-center gap-2 font-semibold"><BracesIcon className="size-4" />Use with your agent</h3>
      {command ? <><p className="text-sm text-muted-foreground">Run this command with your connected AE account and spending policy.</p><AeCopyCommand label="prepared call command" code={command} /></>
        : <p role="status" className="text-sm text-muted-foreground">{!canonical || !toolRef ? 'Prepare this Tool to get its AE input contract and Call command.' : 'Complete the required input to prepare your Call command.'}</p>}
    </section>
  </div>
}

function JsonExample({ title, code }: Readonly<{ title: string; code: string }>) {
  return <CodeBlock code={code} language="json" className="max-h-[32rem] overflow-auto"><CodeBlockHeader><CodeBlockTitle>{title}</CodeBlockTitle><CodeBlockActions><CodeBlockCopyButton aria-label={`Copy ${title}`} /></CodeBlockActions></CodeBlockHeader></CodeBlock>
}

class FormBoundary extends Component<Readonly<{ children: ReactNode; fallback: ReactNode }>, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  override render() { return this.state.failed ? this.props.fallback : this.props.children }
}
