import { defaultTitle } from '@/lib/errors'
import { formatDisplayAmount } from '@/modules/money/public'
import type { OpenApiDocument } from '@/modules/discovery/public'

import {
  DEVELOPERS_API_COPY,
  DEVELOPERS_API_OPERATION_GROUP_TAGS,
  DEVELOPERS_API_PRICE_EXAMPLE,
  DEVELOPERS_API_PROBLEM_NEXT_STEPS,
  type DevelopersApiOperation,
  type DevelopersApiOperationGroup,
  type DevelopersApiOperationGroupTag,
  type DevelopersApiProblemKind,
  type DevelopersApiViewModel,
} from './developers-api.contracts'

type JsonRecord = Record<string, unknown>
const HTTP_METHODS: Readonly<Record<string, true>> = {
  delete: true,
  head: true,
  get: true,
  patch: true,
  post: true,
  put: true,
}
const OPERATION_GROUP_TAG_SET: Readonly<Record<DevelopersApiOperationGroupTag, true>> = {
  'Call gateway': true,
  'Tool market': true,
  Funding: true,
  Businesses: true,
  Platform: true,
  Account: true,
  'Market demand': true,
  Provider: true,
}

export function createDevelopersApiViewModel(document: OpenApiDocument): DevelopersApiViewModel {
  const root = record(document, 'document')
  const serverUrl = stringAt(arrayAt(root, 'servers', 'document')[0], 'url', 'document.servers[0]')
  const info = recordAt(root, 'info', 'document')
  const documentVersion = stringAt(info, 'version', 'document.info')
  const components = recordAt(root, 'components', 'document')
  const securitySchemes = recordAt(components, 'securitySchemes', 'document.components')
  const agentAccessKey = recordAt(securitySchemes, 'agentAccessKey', 'document.components.securitySchemes')
  const authDescription = stringAt(agentAccessKey, 'description', 'document.components.securitySchemes.agentAccessKey')
  const paths = recordAt(root, 'paths', 'document')
  const buckets: Record<DevelopersApiOperationGroupTag, DevelopersApiOperation[]> = {
    'Call gateway': [],
    'Tool market': [],
    Funding: [],
    Businesses: [],
    Platform: [],
    Account: [],
    'Market demand': [],
    Provider: [],
  }
  for (const [path, pathValue] of Object.entries(paths)) {
    const methods = record(pathValue, `document.paths.${path}`)
    for (const [method, operationValue] of Object.entries(methods)) {
      if (HTTP_METHODS[method] !== true) continue
      const operation = record(operationValue, `document.paths.${path}.${method}`)
      const site = `document.paths.${path}.${method}`
      const operationId = stringAt(operation, 'operationId', site)
      const summary = stringAt(operation, 'summary', site)
      const tag = operationGroupTagAt(operation, site)
      const requestExample = readRequestExample(operation)
      const requestBody = optionalRecord(operation.requestBody)
      const authenticated = Array.isArray(operation.security) && operation.security.length > 0
      const parameters = Array.isArray(operation.parameters) ? operation.parameters.flatMap((value) => {
        const parameter = optionalRecord(value)
        return parameter === undefined ? [] : [parameter]
      }) : []
      const headerNames = parameters
        .filter((parameter) => parameter.in === 'header' && typeof parameter.name === 'string')
        .map((parameter) => parameter.name as string)
      const readOnly = operation['x-ae-read-only'] === true ||
        (operation['x-ae-read-only'] !== false && (method === 'get' || method === 'head'))
      const complete = !path.includes('{') && !parameters.some((parameter) => parameter.required === true && parameter.in === 'query')
        && (requestBody === undefined || requestExample !== undefined)
      buckets[tag].push({
        operationId,
        method: method.toUpperCase(),
        path,
        summary,
        ...(readOnly && complete
          ? { curl: curlFor({
              serverUrl, method: method.toUpperCase(), path, requestExample,
              authenticated, headerNames,
            }) }
          : {
              template: requestTemplate(requestBody, components, parameters),
              authority: authenticated
                ? `Agent access key${typeof operation.description === 'string' ? ` — ${operation.description}` : ''}`
                : 'Public; check the operation contract before sending.',
            }),
      })
    }
  }
  const operationGroups: DevelopersApiOperationGroup[] = DEVELOPERS_API_OPERATION_GROUP_TAGS
    .map((tag) => ({ tag, operations: buckets[tag] }))
    .filter((group) => group.operations.length > 0)
  const problemSchema = resolveProblemSchema(root, components, paths)
  const properties = recordAt(problemSchema, 'properties', 'Problem')
  const typeSchema = recordAt(properties, 'type', 'Problem.properties')
  const problemType = stringAt(typeSchema, 'const', 'Problem.properties.type')
  const titleSchema = recordAt(properties, 'title', 'Problem.properties')
  const allowedTitles = arrayAt(titleSchema, 'enum', 'Problem.properties.title')
  const kindSchema = recordAt(properties, 'kind', 'Problem.properties')
  const kinds = arrayAt(kindSchema, 'enum', 'Problem.properties.kind').map((value) => problemKind(value))
  const problems = kinds.map((kind) => {
    const title = defaultTitle(kind)
    if (!allowedTitles.includes(title)) {
      throw new Error(`developers_api_document_invalid:Problem.properties.title.enum:${title}`)
    }
    return {
      kind,
      type: problemType,
      title,
      nextStep: DEVELOPERS_API_PROBLEM_NEXT_STEPS[kind],
    }
  })
  const priceExample = DEVELOPERS_API_PRICE_EXAMPLE

  return {
    authDescription,
    documentVersion,
    versionPolicy: DEVELOPERS_API_COPY.versionPolicy(documentVersion),
    operationGroups,
    problems,
    priceExample: {
      shape: 'ExactAmount { currency, units, exponent }',
      json: JSON.stringify(priceExample),
      formatted: formatDisplayAmount(priceExample),
    },
  }
}

function operationGroupTagAt(operation: JsonRecord, site: string): DevelopersApiOperationGroupTag {
  const tags = arrayAt(operation, 'tags', site)
  const tag = tags[0]
  if (tags.length !== 1 || typeof tag !== 'string' || OPERATION_GROUP_TAG_SET[tag as DevelopersApiOperationGroupTag] !== true) {
    throw new Error(`developers_api_document_invalid:${site}.tags`)
  }
  return tag as DevelopersApiOperationGroupTag
}

function readRequestExample(operation: JsonRecord): unknown {
  const requestBody = optionalRecord(operation.requestBody)
  const content = optionalRecord(requestBody?.content)
  const media = optionalRecord(content?.['application/json'])
  if (media === undefined) return undefined
  if (media.example !== undefined) return media.example
  const examples = optionalRecord(media.examples)
  if (examples === undefined) return undefined
  for (const candidate of Object.values(examples)) {
    const example = optionalRecord(candidate)
    if (example?.value !== undefined) return example.value
  }
  return undefined
}

function requestTemplate(requestBody: JsonRecord | undefined, components: JsonRecord, parameters: readonly JsonRecord[]): string {
  const media = optionalRecord(optionalRecord(requestBody?.content)?.['application/json'])
  const schema = optionalRecord(media?.schema)
  const schemas = optionalRecord(components.schemas) ?? {}
  const body = schema === undefined ? 'No JSON request body.' : JSON.stringify(requiredShape(schema, schemas), null, 2)
  const requiredParameters = parameters
    .filter((parameter) => parameter.required === true && typeof parameter.name === 'string' && typeof parameter.in === 'string')
    .map((parameter) => `${parameter.in}: ${parameter.name}`)
  return requiredParameters.length > 0 ? `${body}\nRequired parameters: ${requiredParameters.join(', ')}` : body
}

function requiredShape(value: unknown, schemas: JsonRecord, visited: ReadonlySet<string> = new Set()): unknown {
  const schema = optionalRecord(value)
  if (schema === undefined) return '<required value>'
  if (typeof schema.$ref === 'string' && schema.$ref.startsWith('#/components/schemas/')) {
    const name = schema.$ref.slice('#/components/schemas/'.length)
    if (visited.has(name)) return '<recursive schema>'
    return requiredShape(schemas[name], schemas, new Set([...visited, name]))
  }
  const alternatives = Array.isArray(schema.oneOf) ? schema.oneOf : Array.isArray(schema.anyOf) ? schema.anyOf : undefined
  if (alternatives !== undefined) return { alternatives: alternatives.map((option) => requiredShape(option, schemas, visited)) }
  const properties = optionalRecord(schema.properties)
  if (properties !== undefined) {
    const required = Array.isArray(schema.required) ? schema.required : []
    return Object.fromEntries(required
      .filter((name): name is string => typeof name === 'string')
      .map((name) => [name, requiredShape(properties[name], schemas, visited)]))
  }
  if (schema.type === 'array') return [requiredShape(schema.items, schemas, visited)]
  if (Array.isArray(schema.enum)) return `<${schema.enum.join(' | ')}>`
  return `<${typeof schema.type === 'string' ? schema.type : 'required value'}>`
}

function curlFor(input: Readonly<{
  serverUrl: string
  method: string
  path: string
  requestExample: unknown
  authenticated: boolean
  headerNames: readonly string[]
}>): string {
  const lines = [
    `curl --request ${input.method}`,
    `'${input.serverUrl.replace(/\/+$/u, '')}${input.path}'`,
    ...(input.authenticated ? [`--header 'Authorization: Bearer <your key>'`] : []),
    ...input.headerNames.map((name) => `--header '${name}: <stable-key>'`),
  ]
  if (input.requestExample !== undefined) {
    const body = JSON.stringify(input.requestExample)
    lines.push(`--header 'Content-Type: application/json'`, `--data '${body.replaceAll("'", `'"'"'`)}'`)
  }
  return lines.join(' \\\n  ')
}

function resolveProblemSchema(root: JsonRecord, components: JsonRecord, paths: JsonRecord): JsonRecord {
  const schemas = optionalRecord(components.schemas)
  const componentProblem = optionalRecord(schemas?.Problem)
  if (componentProblem !== undefined) return componentProblem
  for (const pathValue of Object.values(paths)) {
    for (const operationValue of Object.values(record(pathValue, 'document.paths'))) {
      const operation = record(operationValue, 'document.paths operation')
      const responses = optionalRecord(operation.responses)
      if (responses === undefined) continue
      for (const responseValue of Object.values(responses)) {
        const response = optionalRecord(responseValue)
        const content = optionalRecord(response?.content)
        const problemMedia = optionalRecord(content?.['application/problem+json'])
        const schema = optionalRecord(problemMedia?.schema)
        if (schema === undefined) continue
        const ref = typeof schema.$ref === 'string' ? schema.$ref : undefined
        if (ref === undefined) return schema
        const name = ref.startsWith('#/components/schemas/') ? ref.slice('#/components/schemas/'.length) : undefined
        const resolved = name === undefined ? undefined : optionalRecord(schemas?.[name])
        if (resolved !== undefined) return resolved
      }
    }
  }
  throw new Error(`developers_api_document_invalid:Problem:${Object.keys(root).join(',')}`)
}

function problemKind(value: unknown): DevelopersApiProblemKind {
  if (typeof value === 'string' && value in DEVELOPERS_API_PROBLEM_NEXT_STEPS) {
    return value as DevelopersApiProblemKind
  }
  throw new Error('developers_api_document_invalid:Problem.properties.kind.enum')
}

function optionalRecord(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined
}

function record(value: unknown, site: string): JsonRecord {
  const parsed = optionalRecord(value)
  if (parsed === undefined) throw new Error(`developers_api_document_invalid:${site}`)
  return parsed
}

function recordAt(parent: JsonRecord, key: string, site: string): JsonRecord {
  return record(parent[key], `${site}.${key}`)
}

function arrayAt(parent: JsonRecord, key: string, site: string): readonly unknown[] {
  const value = parent[key]
  if (!Array.isArray(value)) throw new Error(`developers_api_document_invalid:${site}.${key}`)
  return value
}

function stringAt(value: unknown, key: string, site: string): string {
  const container = record(value, site)
  const result = container[key]
  if (typeof result !== 'string') throw new Error(`developers_api_document_invalid:${site}.${key}`)
  return result
}
