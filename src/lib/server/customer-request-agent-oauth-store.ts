import {
  createPublicSourceTransport,
  sourceMutation,
  sourceQuery,
} from './convex-source'
import type {
  CustomerRequestAgentOAuthClient,
  CustomerRequestAgentOAuthGrant,
  CustomerRequestAgentOAuthGrantStatus,
  CustomerRequestAgentOAuthStore,
} from '@/modules/customer-request/oauth-state'

type GrantArgs = {
  grant: {
    grantRef: string
    flow: 'device_code' | 'authorization_code'
    clientId: string
    requestedScopes: string[]
    status: CustomerRequestAgentOAuthGrantStatus
    createdAt: number
    expiresAt: number
    displayName: string
    redirectUri?: string
    codeChallenge?: string
    codeChallengeMethod?: 'S256'
    deviceCodeHash?: string
    userCodeHash?: string
    authorizationCodeHash?: string
    ownerId?: string
    keyId?: string
    approvedAt?: number
    consumedAt?: number
    nextPollAt?: number
    deliveryClaimToken?: string
    denialReason?: 'access_denied'
  }
}

type GrantReadArgs = { kind: 'device' | 'user' | 'authorization'; hash: string }
type GrantRefArgs = { grantRef: string }
type GrantUpdateArgs = {
  grantRef: string
  expectedStatus: CustomerRequestAgentOAuthGrantStatus
  patch: {
    status?: CustomerRequestAgentOAuthGrantStatus
    redirectUri?: string
    requestedScopes?: string[]
    codeChallenge?: string
    codeChallengeMethod?: 'S256'
    deviceCodeHash?: string
    userCodeHash?: string
    authorizationCodeHash?: string
    ownerId?: string
    keyId?: string
    createdAt?: number
    expiresAt?: number
    approvedAt?: number
    consumedAt?: number
    nextPollAt?: number
    deliveryClaimToken?: string
    displayName?: string
    denialReason?: 'access_denied'
  }
}
type ClientArgs = { client: {
  clientId: string
  clientName: string
  redirectUris: string[]
  grantTypes: ('authorization_code' | 'urn:ietf:params:oauth:grant-type:device_code')[]
  tokenEndpointAuthMethod: 'none'
  createdAt: number
  lastUsedAt?: number
} }
type ClientReadArgs = { clientId: string }

const insertGrant = sourceMutation<GrantArgs, null>('customerRequestAgentOAuth:insertGrant')
const getGrantByHash = sourceQuery<GrantReadArgs, CustomerRequestAgentOAuthGrant | null>('customerRequestAgentOAuth:getGrantByHash')
const getGrantByRef = sourceQuery<GrantRefArgs, CustomerRequestAgentOAuthGrant | null>('customerRequestAgentOAuth:getGrantByRef')
const updateGrant = sourceMutation<GrantUpdateArgs, CustomerRequestAgentOAuthGrant | null>('customerRequestAgentOAuth:updateGrant')
const insertClient = sourceMutation<ClientArgs, null>('customerRequestAgentOAuth:insertClient')
const getClient = sourceQuery<ClientReadArgs, CustomerRequestAgentOAuthClient | null>('customerRequestAgentOAuth:getClient')

export function createConvexCustomerRequestAgentOAuthStore(): CustomerRequestAgentOAuthStore {
  const transport = createPublicSourceTransport()
  return {
    insertGrant: async (grant) => {
      const args: GrantArgs = { grant: grantForConvex(grant) }
      await transport.mutation(insertGrant, args)
    },
    getGrantByHash: async (kind, hash) => await transport.query(getGrantByHash, { kind, hash }),
    getGrantByRef: async (grantRef) => await transport.query(getGrantByRef, { grantRef }),
    updateGrant: async (grantRef, expectedStatus, patch) => {
      const args: GrantUpdateArgs = { grantRef, expectedStatus, patch: patchForConvex(patch) }
      return await transport.mutation(updateGrant, args)
    },
    insertClient: async (client) => {
      const args: ClientArgs = { client: clientForConvex(client) }
      await transport.mutation(insertClient, args)
    },
    getClient: async (clientId) => await transport.query(getClient, { clientId }),
  }
}

function grantForConvex(grant: CustomerRequestAgentOAuthGrant): GrantArgs['grant'] {
  return {
    grantRef: grant.grantRef,
    flow: grant.flow,
    clientId: grant.clientId,
    requestedScopes: [...grant.requestedScopes],
    status: grant.status,
    createdAt: grant.createdAt,
    expiresAt: grant.expiresAt,
    displayName: grant.displayName,
    ...(grant.redirectUri === undefined ? {} : { redirectUri: grant.redirectUri }),
    ...(grant.codeChallenge === undefined ? {} : { codeChallenge: grant.codeChallenge }),
    ...(grant.codeChallengeMethod === undefined ? {} : { codeChallengeMethod: grant.codeChallengeMethod }),
    ...(grant.deviceCodeHash === undefined ? {} : { deviceCodeHash: grant.deviceCodeHash }),
    ...(grant.userCodeHash === undefined ? {} : { userCodeHash: grant.userCodeHash }),
    ...(grant.authorizationCodeHash === undefined ? {} : { authorizationCodeHash: grant.authorizationCodeHash }),
    ...(grant.ownerId === undefined ? {} : { ownerId: grant.ownerId }),
    ...(grant.keyId === undefined ? {} : { keyId: grant.keyId }),
    ...(grant.approvedAt === undefined ? {} : { approvedAt: grant.approvedAt }),
    ...(grant.consumedAt === undefined ? {} : { consumedAt: grant.consumedAt }),
    ...(grant.nextPollAt === undefined ? {} : { nextPollAt: grant.nextPollAt }),
    ...(grant.deliveryClaimToken === undefined ? {} : { deliveryClaimToken: grant.deliveryClaimToken }),
    ...(grant.denialReason === undefined ? {} : { denialReason: grant.denialReason }),
  }
}

function patchForConvex(patch: Partial<CustomerRequestAgentOAuthGrant>): GrantUpdateArgs['patch'] {
  return {
    ...(patch.status === undefined ? {} : { status: patch.status }),
    ...(patch.redirectUri === undefined ? {} : { redirectUri: patch.redirectUri }),
    ...(patch.requestedScopes === undefined ? {} : { requestedScopes: [...patch.requestedScopes] }),
    ...(patch.codeChallenge === undefined ? {} : { codeChallenge: patch.codeChallenge }),
    ...(patch.codeChallengeMethod === undefined ? {} : { codeChallengeMethod: patch.codeChallengeMethod }),
    ...(patch.deviceCodeHash === undefined ? {} : { deviceCodeHash: patch.deviceCodeHash }),
    ...(patch.userCodeHash === undefined ? {} : { userCodeHash: patch.userCodeHash }),
    ...(patch.authorizationCodeHash === undefined ? {} : { authorizationCodeHash: patch.authorizationCodeHash }),
    ...(patch.ownerId === undefined ? {} : { ownerId: patch.ownerId }),
    ...(patch.keyId === undefined ? {} : { keyId: patch.keyId }),
    ...(patch.createdAt === undefined ? {} : { createdAt: patch.createdAt }),
    ...(patch.expiresAt === undefined ? {} : { expiresAt: patch.expiresAt }),
    ...(patch.approvedAt === undefined ? {} : { approvedAt: patch.approvedAt }),
    ...(patch.consumedAt === undefined ? {} : { consumedAt: patch.consumedAt }),
    ...(patch.nextPollAt === undefined ? {} : { nextPollAt: patch.nextPollAt }),
    ...(patch.deliveryClaimToken === undefined ? {} : { deliveryClaimToken: patch.deliveryClaimToken }),
    ...(patch.displayName === undefined ? {} : { displayName: patch.displayName }),
    ...(patch.denialReason === undefined ? {} : { denialReason: patch.denialReason }),
  }
}

function clientForConvex(client: CustomerRequestAgentOAuthClient): ClientArgs['client'] {
  return {
    clientId: client.clientId,
    clientName: client.clientName,
    redirectUris: [...client.redirectUris],
    grantTypes: [...client.grantTypes],
    tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
    createdAt: client.createdAt,
    ...(client.lastUsedAt === undefined ? {} : { lastUsedAt: client.lastUsedAt }),
  }
}
