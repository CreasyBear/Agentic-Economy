import type { CliOptions } from './args'

const SHELL_SAFE_ARGUMENT = /^[A-Za-z0-9_@%+=:,./-]+$/u

export type ContinuationOptions = Pick<CliOptions, 'baseUrl' | 'baseUrlSource' | 'json'>

export function shellArgument(value: string): string {
  if (value.length > 0 && SHELL_SAFE_ARGUMENT.test(value)) return value
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

export function continuationCommand(
  tokens: readonly (string | number | undefined)[],
): string {
  return tokens
    .filter((token): token is string | number => token !== undefined)
    .map((token) => shellArgument(String(token)))
    .join(' ')
}

/** The origin and output flags a continuation must repeat to stay runnable. */
export function continuationFlags(options: ContinuationOptions | undefined): readonly string[] {
  if (options === undefined) return []
  return [
    ...(options.baseUrlSource === undefined || options.baseUrlSource === 'hosted_default'
      ? []
      : ['--base-url', options.baseUrl]),
    ...(options.json ? ['--json'] : []),
  ]
}

/** One runnable `ae` continuation bound to the caller's exact origin and output mode. */
export function cliContinuation(
  options: ContinuationOptions | undefined,
  tokens: readonly (string | number | undefined)[],
): string {
  return continuationCommand([...tokens, ...continuationFlags(options)])
}
