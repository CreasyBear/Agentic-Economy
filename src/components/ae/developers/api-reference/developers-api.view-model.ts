import { defaultTitle } from '@/lib/errors'
import { formatDisplayAmount } from '@/modules/money/public'
import type { OpenApiDocument } from '@/modules/discovery/public'

import {
  DEVELOPERS_API_COPY,
  DEVELOPERS_API_PRICE_EXAMPLE,
  DEVELOPERS_API_PROBLEM_NEXT_STEPS,
  type DevelopersApiProblemKind,
  type DevelopersApiViewModel,
} from './developers-api.contracts'

type JsonRecord = Record<string, unknown>
const HTTP_METHODS: Readonly<Record<string, true>> = {
  delete: true,
  get: true,
  patch: true,
  post: true,
  put: true,
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
  const operations = Object.entries(paths).flatMap(([path, pathValue]) => {
    const methods = record(pathValue, `document.paths.${path}`)
    return Object.entries(methods)
      .filter(([method]) => HTTP_METHODS[method] === true)
      .map(([method, operationValue]) => {
        const operation = record(operationValue, `document.paths.${path}.${method}`)
        const operationId = stringAt(operation, 'operationId', `document.paths.${path}.${method}`)
        const summary = stringAt(operation, 'summary', `document.paths.${path}.${method}`)
        const requestExample = readRequestExample(operation)
        const hasRequestBody = operation.requestBody !== undefined
        return {
          operationId,
          method: method.toUpperCase(),
          path,
          summary,
          curl: curlFor({ serverUrl, method: method.toUpperCase(), path, hasRequestBody, requestExample }),
        }
      })
  })
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
    operations,
    problems,
    priceExample: {
      shape: 'ExactAmount { currency, units, exponent }',
      json: JSON.stringify(priceExample),
      formatted: formatDisplayAmount(priceExample),
    },
  }
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

function curlFor(input: Readonly<{
  serverUrl: string
  method: string
  path: string
  hasRequestBody: boolean
  requestExample: unknown
}>): string {
  const lines = [
    `curl --request ${input.method} \\`,
    `  '${input.serverUrl.replace(/\/+$/u, '')}${input.path}' \\`,
    `  --header 'Authorization: Bearer <your key>'`,
  ]
  if (!input.hasRequestBody) return lines.join('\n')
  const body = JSON.stringify(input.requestExample === undefined ? {} : input.requestExample) ?? '{}'
  lines[2] = `${lines[2]} \\`
  lines.push(`  --header 'Content-Type: application/json' \\`)
  lines.push(`  --data '${body.replaceAll("'", `'"'"'`)}'`)
  return lines.join('\n')
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
