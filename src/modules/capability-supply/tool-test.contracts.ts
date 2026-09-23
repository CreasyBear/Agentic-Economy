export type ToolTestResponse = Readonly<{
  status: number
  latencyMs: number
  data?: unknown
  error?: string
}>

export type JsonSchemaProperty = Readonly<{
  default?: unknown
  example?: unknown
  examples?: readonly unknown[]
  enum?: readonly unknown[]
  type?: string
  format?: string
  minimum?: number
  properties?: Record<string, JsonSchemaProperty>
}>
