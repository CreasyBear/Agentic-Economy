export type StringEnvironment = Readonly<Record<string, string | undefined>>

export function readTrimmedEnv(env: StringEnvironment, name: string): string | undefined {
  const value = env[name]
  return value === undefined || value.trim().length === 0 ? undefined : value.trim()
}
