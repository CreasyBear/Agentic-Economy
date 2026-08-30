import { COMMANDS, type CommandManifestEntry } from '../commands/manifest'
import { CliFailure } from './output'

export const CLI_ENTRYPOINT = 'ae'

export function commandMetadata(path: string): CommandManifestEntry | undefined {
  const [command, subcommand] = path.split(' ')
  if (command === undefined) return undefined
  const root = COMMANDS[command]
  if (subcommand === undefined) return root
  return root?.commands?.[subcommand]
}

export function commandUsage(path: string): string {
  const metadata = commandMetadata(path)
  if (metadata === undefined) return `${CLI_ENTRYPOINT} ${path} [args] [flags]`
  return `${CLI_ENTRYPOINT} ${path}${metadata.args.length === 0 ? '' : ` ${metadata.args}`}`
}

export function usageFailure(path: string, code: string): CliFailure {
  return new CliFailure(`Usage: ${commandUsage(path)}`, {
    kind: 'INVALID_ARGUMENT',
    code,
    suggestion: 'Review the command arguments and try again.',
    nextCommand: `${CLI_ENTRYPOINT} help ${path}`,
  })
}

export function rootCommandHelpLines(): readonly string[] {
  return Object.entries(COMMANDS).map(([name, metadata]) => (
    `  ${commandUsage(name)}\n      ${metadata.summary}`
  ))
}
