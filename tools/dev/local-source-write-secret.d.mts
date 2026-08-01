export type DotenvFile = {
  path: string
  content: string
}

export type LocalSourceWriteSecretResult = {
  secret: string
  source: 'existing' | 'generated'
  persistPath?: string
}

export declare function resolveLocalSourceWriteSecret(input?: {
  env?: Record<string, string | undefined>
  dotenvFiles?: readonly DotenvFile[]
  randomBytes?: (size: number) => Uint8Array
}): LocalSourceWriteSecretResult

export declare function sourceWriteEnvAssignment(secret: string): string

export declare function persistLocalSourceWriteSecret(path: string, secret: string): Promise<void>

export declare function configureLocalSourceWriteSecret(input?: {
  cwd?: string
  env?: Record<string, string | undefined>
  runEnvSet?: (input: { cwd: string; url: string; adminKey: string; secret: string }) => Promise<void>
}): Promise<LocalSourceWriteSecretResult>
