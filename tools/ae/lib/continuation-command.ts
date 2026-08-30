const SHELL_SAFE_ARGUMENT = /^[A-Za-z0-9_@%+=:,./-]+$/u

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
