type ParkedLoaderContext<TParams extends Record<string, string>> = {
  params: TParams
  request?: Request
}

type ParkedServerHandler<TParams extends Record<string, string>> = (
  input: ParkedLoaderContext<TParams> & { request: Request }
) => unknown

type ParkedRouteOptions<TLoaderData, TParams extends Record<string, string>> = {
  loader?: (context: ParkedLoaderContext<TParams>) => TLoaderData | Promise<TLoaderData>
  head?: () => unknown
  component?: () => unknown
  server?: {
    handlers: Record<string, ParkedServerHandler<TParams>>
  }
}

export type ParkedFileRoute<TLoaderData> = {
  useLoaderData: () => TLoaderData
}

export function createParkedFileRoute<TLoaderData, TParams extends Record<string, string> = Record<string, string>>(
  path: string
) {
  return function defineParkedRoute(
    options: ParkedRouteOptions<TLoaderData, TParams>
  ): ParkedFileRoute<TLoaderData> & ParkedRouteOptions<TLoaderData, TParams> {
    return {
      ...options,
      useLoaderData: () => {
        throw new Error(`Parked future route ${path} is not mounted in the active route tree.`)
      },
    }
  }
}
