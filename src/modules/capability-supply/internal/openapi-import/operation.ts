import type { JsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'

import type { SchemaDereferencer } from '../admit-provider-schema'
import type { CapabilityPublicationImportRefusal } from '../publication-importer-types'
import {
  openApiParameterExclusions,
  resolveOpenApiCredential,
  type OpenApiCredentialResolution,
  type OpenApiParameterExclusions,
} from './credentials'
import {
  jsonContentDocument,
  resolveOpenApiRecord,
  type OpenApiJsonContent,
} from './document'
import {
  openApiParameterMappings,
  type OpenApiParameterMappingsResult,
} from './parameters'

export type OpenApiOperationAnalysis = Readonly<{
  credential: Extract<OpenApiCredentialResolution, { kind: 'resolved' }>
  parameters: Extract<OpenApiParameterMappingsResult, { kind: 'mapped' }>
  inputSchema: Readonly<Record<string, JsonValue>>
  requestContent?: OpenApiJsonContent
  responseStatus: number
  outputContent: OpenApiJsonContent
}>

export type OpenApiOperationAnalysisResult =
  | Readonly<{ kind: 'analyzed'; analysis: OpenApiOperationAnalysis }>
  | Readonly<{ kind: 'refused'; reason: CapabilityPublicationImportRefusal }>

export async function analyzeOpenApiOperation(
  operation: Readonly<Record<string, unknown>>,
  inheritedParameters: unknown,
  path: string,
  method: string,
  excludedParameters: OpenApiParameterExclusions,
  root: unknown,
  derefSchema?: SchemaDereferencer,
): Promise<OpenApiOperationAnalysisResult> {
  if (method !== 'get' && method !== 'post') return refused('openapi_operation_unsupported')
  const credential = resolveOpenApiCredential(root, operation)
  if (credential.kind === 'refused') return refused('transport_unsupported')
  const parameters = await openApiParameterMappings(
    inheritedParameters,
    operation.parameters,
    path,
    excludedParameters,
    root,
    derefSchema,
  )
  if (parameters.kind === 'refused') return parameters
  const request = await analyzeRequest(operation, method, parameters, root, derefSchema)
  if (request.kind === 'refused') return request
  const response = await analyzeResponse(operation.responses, root, derefSchema)
  if (response.kind === 'refused') return response
  return {
    kind: 'analyzed',
    analysis: {
      credential,
      parameters,
      inputSchema: request.inputSchema,
      ...(request.content === undefined ? {} : { requestContent: request.content }),
      responseStatus: response.status,
      outputContent: response.content,
    },
  }
}

export function defaultOpenApiParameterExclusions(
  credential: Extract<OpenApiCredentialResolution, { kind: 'resolved' }>,
): OpenApiParameterExclusions {
  return openApiParameterExclusions(credential, new Set())
}

type RequestAnalysis =
  | Readonly<{ kind: 'analyzed'; inputSchema: Readonly<Record<string, JsonValue>>; content?: OpenApiJsonContent }>
  | Extract<OpenApiOperationAnalysisResult, { kind: 'refused' }>

async function analyzeRequest(
  operation: Readonly<Record<string, unknown>>,
  method: 'get' | 'post',
  parameters: Extract<OpenApiParameterMappingsResult, { kind: 'mapped' }>,
  root: unknown,
  derefSchema?: SchemaDereferencer,
): Promise<RequestAnalysis> {
  if (method === 'get') {
    return operation.requestBody === undefined
      ? { kind: 'analyzed', inputSchema: parameters.schema }
      : refused('openapi_operation_unsupported')
  }
  const contentResult = await resolveRequestContent(operation.requestBody, root, derefSchema)
  if (contentResult.kind === 'refused') return contentResult
  if (contentResult.content !== undefined && hasMappedParameters(parameters)) {
    return refused('openapi_request_body_parameter_mix_unsupported')
  }
  return {
    kind: 'analyzed',
    inputSchema: contentResult.content?.schema ?? parameters.schema,
    ...(contentResult.content === undefined ? {} : { content: contentResult.content }),
  }
}

async function resolveRequestContent(
  requestBodyValue: unknown,
  root: unknown,
  derefSchema?: SchemaDereferencer,
): Promise<
  | Readonly<{ kind: 'resolved'; content?: OpenApiJsonContent }>
  | Extract<OpenApiOperationAnalysisResult, { kind: 'refused' }>
> {
  const requestBody = await resolveOpenApiRecord(requestBodyValue, root, derefSchema)
  if (requestBody.kind === 'refused') return requestBody
  if (requestBody.value === undefined) return { kind: 'resolved' }
  const content = jsonContentDocument(requestBody.value.content)
  if (content === undefined) return refused('openapi_media_type_unsupported')
  if (requestBody.value.required !== undefined && typeof requestBody.value.required !== 'boolean') {
    return refused('schema_missing')
  }
  return { kind: 'resolved', content }
}

function hasMappedParameters(parameters: Extract<OpenApiParameterMappingsResult, { kind: 'mapped' }>): boolean {
  return parameters.query.length > 0 || parameters.path.length > 0 || parameters.headers.length > 0
}

async function analyzeResponse(
  responses: unknown,
  root: unknown,
  derefSchema?: SchemaDereferencer,
): Promise<
  | Readonly<{ kind: 'analyzed'; status: number; content: OpenApiJsonContent }>
  | Extract<OpenApiOperationAnalysisResult, { kind: 'refused' }>
> {
  const successful = isRecord(responses)
    ? Object.entries(responses).filter(([status]) => /^2\d\d$/.test(status))
    : []
  if (successful.length > 1) return refused('openapi_response_status_unsupported')
  const selected = successful[0]
  if (selected === undefined || !isRecord(selected[1])) return refused('schema_missing')
  const response = await resolveOpenApiRecord(selected[1], root, derefSchema)
  if (response.kind === 'refused') return response
  const content = response.value === undefined ? undefined : jsonContentDocument(response.value.content)
  return content === undefined
    ? refused('schema_missing')
    : { kind: 'analyzed', status: Number(selected[0]), content }
}

function refused(reason: CapabilityPublicationImportRefusal): Extract<OpenApiOperationAnalysisResult, { kind: 'refused' }> {
  return { kind: 'refused', reason }
}
