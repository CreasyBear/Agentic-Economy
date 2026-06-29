import { auth } from '@clerk/tanstack-react-start/server'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi, makeFunctionReference } from 'convex/server'
import type { DefaultFunctionArgs, FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'

export type ConvexSourceErrorCode = 'missing_auth' | 'missing_convex_url'

export class ConvexSourceError extends Error {
  readonly code: ConvexSourceErrorCode
  readonly status: number

  constructor(code: ConvexSourceErrorCode, message: string, status: number) {
    super(message)
    this.name = 'ConvexSourceError'
    this.code = code
    this.status = status
  }
}

type Env = Record<string, string | undefined>

export type ConvexSourceAuth = {
  isAuthenticated: boolean
  getToken(options?: { template?: string }): Promise<string | null>
}

export type CreateAuthenticatedConvexClientOptions = {
  env?: Env
  authObject?: ConvexSourceAuth
  tokenTemplate?: string
  fetch?: typeof globalThis.fetch
  skipConvexDeploymentUrlCheck?: boolean
}

export type CreatePublicConvexClientOptions = Pick<
  CreateAuthenticatedConvexClientOptions,
  'env' | 'fetch' | 'skipConvexDeploymentUrlCheck'
>

export type ConvexSourceTransport = {
  query<Query extends FunctionReference<'query'>>(
    query: Query,
    args: FunctionArgs<Query>
  ): Promise<FunctionReturnType<Query>>
  mutation<Mutation extends FunctionReference<'mutation'>>(
    mutation: Mutation,
    args: FunctionArgs<Mutation>
  ): Promise<FunctionReturnType<Mutation>>
  action<Action extends FunctionReference<'action'>>(
    action: Action,
    args: FunctionArgs<Action>
  ): Promise<FunctionReturnType<Action>>
}

export const sourceConvexApi = anyApi

export const sourceConvexFunctions = {
  catalog: {
    publishBusinessCatalog: sourceMutation('catalog:publishBusinessCatalog'),
  },
} as const

export function sourceQuery<Args extends DefaultFunctionArgs = DefaultFunctionArgs, Result = unknown>(
  name: string
): FunctionReference<'query', 'public', Args, Result> {
  return makeFunctionReference<'query', Args, Result>(name)
}

export function sourceMutation<Args extends DefaultFunctionArgs = DefaultFunctionArgs, Result = unknown>(
  name: string
): FunctionReference<'mutation', 'public', Args, Result> {
  return makeFunctionReference<'mutation', Args, Result>(name)
}

export function sourceAction<Args extends DefaultFunctionArgs = DefaultFunctionArgs, Result = unknown>(
  name: string
): FunctionReference<'action', 'public', Args, Result> {
  return makeFunctionReference<'action', Args, Result>(name)
}

export async function createAuthenticatedConvexClient(
  options: CreateAuthenticatedConvexClientOptions = {}
): Promise<ConvexHttpClient> {
  const convexUrl = readRequiredConvexUrl(options.env ?? process.env)
  const authObject = options.authObject ?? (await auth())
  const token = await readRequiredConvexAuthToken(authObject, options.tokenTemplate ?? 'convex')

  return new ConvexHttpClient(convexUrl, {
    auth: token,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.skipConvexDeploymentUrlCheck === undefined
      ? {}
      : { skipConvexDeploymentUrlCheck: options.skipConvexDeploymentUrlCheck }),
  })
}

export function createPublicConvexClient(options: Pick<CreateAuthenticatedConvexClientOptions, 'env' | 'fetch' | 'skipConvexDeploymentUrlCheck'> = {}): ConvexHttpClient {
  const convexUrl = readRequiredConvexUrl(options.env ?? process.env)
  return new ConvexHttpClient(convexUrl, {
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.skipConvexDeploymentUrlCheck === undefined
      ? {}
      : { skipConvexDeploymentUrlCheck: options.skipConvexDeploymentUrlCheck }),
  })
}

export async function createAuthenticatedSourceTransport(
  options: CreateAuthenticatedConvexClientOptions = {}
): Promise<ConvexSourceTransport> {
  return createConvexSourceTransport(await createAuthenticatedConvexClient(options))
}

export function createPublicSourceTransport(options: CreatePublicConvexClientOptions = {}): ConvexSourceTransport {
  return createConvexSourceTransport(createPublicConvexClient(options))
}

export function createConvexSourceTransport(client: ConvexHttpClient): ConvexSourceTransport {
  return {
    query: (query, args) => client.query(query, args),
    mutation: (mutation, args) => client.mutation(mutation, args),
    action: (action, args) => client.action(action, args),
  }
}

export async function callSourceQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: FunctionArgs<Query>,
  options?: CreateAuthenticatedConvexClientOptions
): Promise<FunctionReturnType<Query>> {
  const transport = await createAuthenticatedSourceTransport(options)
  return transport.query(query, args)
}

export async function callSourceMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
  args: FunctionArgs<Mutation>,
  options?: CreateAuthenticatedConvexClientOptions
): Promise<FunctionReturnType<Mutation>> {
  const transport = await createAuthenticatedSourceTransport(options)
  return transport.mutation(mutation, args)
}

export async function callPublicSourceQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: FunctionArgs<Query>,
  options?: CreatePublicConvexClientOptions
): Promise<FunctionReturnType<Query>> {
  return createPublicSourceTransport(options).query(query, args)
}

export async function callPublicSourceMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
  args: FunctionArgs<Mutation>,
  options?: CreatePublicConvexClientOptions
): Promise<FunctionReturnType<Mutation>> {
  return createPublicSourceTransport(options).mutation(mutation, args)
}

export async function callSourceAction<Action extends FunctionReference<'action'>>(
  action: Action,
  args: FunctionArgs<Action>,
  options?: CreateAuthenticatedConvexClientOptions
): Promise<FunctionReturnType<Action>> {
  const transport = await createAuthenticatedSourceTransport(options)
  return transport.action(action, args)
}

export function readRequiredConvexUrl(env: Env = process.env): string {
  const value = readEnv(env, 'CONVEX_URL') ?? readEnv(env, 'VITE_CONVEX_URL')
  if (value === undefined) {
    throw new ConvexSourceError('missing_convex_url', 'CONVEX_URL or VITE_CONVEX_URL is required for server Convex calls.', 500)
  }

  return value
}

export async function readRequiredConvexAuthToken(authObject: ConvexSourceAuth, tokenTemplate = 'convex'): Promise<string> {
  if (!authObject.isAuthenticated) {
    throw new ConvexSourceError('missing_auth', 'Authenticated owner session is required for this Convex call.', 401)
  }

  const token = await authObject.getToken({ template: tokenTemplate })
  if (token === null || token.trim().length === 0) {
    throw new ConvexSourceError('missing_auth', 'Clerk did not return a Convex auth token for this request.', 401)
  }

  return token
}

function readEnv(env: Env, name: string): string | undefined {
  const value = env[name]
  if (value === undefined || value.trim().length === 0) {
    return undefined
  }

  return value.trim()
}
