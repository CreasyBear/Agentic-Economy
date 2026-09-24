import { SettingsGroup, SettingsRow } from '../../settings-shell/components/SettingsSections'
import type { TeamMemberRowsProps } from '../team-roles.contracts'

export function TeamMemberRows({ members }: TeamMemberRowsProps) {
  return <SettingsGroup title="Members" description="Roles shown here are the workspace permissions Agentic Economy enforces.">
    {members.map(person => <SettingsRow key={person.key} label={person.name} description={person.email ?? 'Email not available'}>
      <span className="inline-flex rounded-md bg-secondary px-2 py-1 font-medium text-secondary-foreground">{person.role}</span>
    </SettingsRow>)}
  </SettingsGroup>
}
