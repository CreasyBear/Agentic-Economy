import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'

const operationInvokeMedia = {
  request: 'application/json',
  response: 'application/json',
  problem: 'application/problem+json',
} as const

const operationInvokeHeaders = {
  authorization: 'Authorization',
  contentType: 'Content-Type',
  accept: 'Accept',
} as const

export const OPERATION_INVOKE_ROUTE_CONTRACT = {
  scope: MARKET_OPERATIONS_INVOKE_SCOPE,
  media: operationInvokeMedia,
  headers: operationInvokeHeaders,
  invoke: {
    actionId: 'operation.invoke',
    contractVersion: 'operation.invoke:v1',
    method: 'POST',
    path: '/api/v1/operations/call',
    routerPath: '/api/v1/operations/call',
    legacyPath: '/api/v1/operations/execute',
    legacyRouterPath: '/api/v1/operations/execute',
    requiredHeaders: ['Authorization', 'Content-Type'] as const,
  },
  status: {
    actionId: 'operation.status',
    contractVersion: 'operation.status:v1',
    method: 'GET',
    path: '/api/v1/operations/{invocationRef}',
    routerPath: '/api/v1/operations/$invocationRef',
    requiredHeaders: ['Authorization'] as const,
  },
  cancel: {
    actionId: 'operation.cancel',
    contractVersion: 'operation.cancel:v1',
    method: 'POST',
    path: '/api/v1/operations/{invocationRef}/cancel',
    routerPath: '/api/v1/operations/$invocationRef/cancel',
    requiredHeaders: ['Authorization', 'Content-Type'] as const,
  },
  reconcile: {
    actionId: 'operation.reconcile',
    contractVersion: 'operation.reconcile:v1',
    method: 'POST',
    path: '/api/v1/operations/{invocationRef}/reconcile',
    routerPath: '/api/v1/operations/$invocationRef/reconcile',
    requiredHeaders: ['Authorization', 'Content-Type'] as const,
  },
} as const

export const OPERATION_INVOKE_HTTP_PATH = OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path
export const OPERATION_INVOKE_ACTION_ID = OPERATION_INVOKE_ROUTE_CONTRACT.invoke.actionId
export const OPERATION_INVOKE_SCOPE = OPERATION_INVOKE_ROUTE_CONTRACT.scope
