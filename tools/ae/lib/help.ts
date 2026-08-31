import {
  COMMANDS,
  ROOT_COMMAND_GROUPS,
  type CommandManifestEntry,
} from '../commands/manifest'
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

export type RootCommandHelpGroup = Readonly<{
  id: string
  title: string
  commands: readonly Readonly<{ name: string; summary: string }>[]
}>

export function rootCommandHelpGroups(
  knownCommands: readonly string[] = Object.keys(COMMANDS),
): readonly RootCommandHelpGroup[] {
  const runnable = new Set(knownCommands)
  return ROOT_COMMAND_GROUPS.map((group) => ({
    ...group,
    commands: Object.entries(COMMANDS)
      .filter(([name, metadata]) => runnable.has(name) && metadata.group === group.id)
      .sort(([, left], [, right]) => left.rootOrder - right.rootOrder)
      .map(([name, metadata]) => ({ name, summary: metadata.summary })),
  })).filter((group) => group.commands.length > 0)
}
