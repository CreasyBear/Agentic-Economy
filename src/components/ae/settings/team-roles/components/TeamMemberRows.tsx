import { SettingsGroup } from '../../settings-shell/components/SettingsSections'
import type { TeamMemberRowsProps } from '../team-roles.contracts'
import '../TeamComposition.css'

function initialsForName(name: string) {
  const words = name.trim().split(/\s+/u).filter(Boolean)
  const candidates = words.length > 1 ? [words[0], words.at(-1)] : [words[0]]

  return candidates
    .filter((word): word is string => word !== undefined)
    .map(word => {
      const firstCodePoint = Array.from(word)[0]
      return firstCodePoint === undefined ? '' : Array.from(firstCodePoint.toUpperCase())[0] ?? firstCodePoint
    })
    .join('')
}

export function TeamMemberRows({ members }: TeamMemberRowsProps) {
  return <div className="arc-market arc-team-members">
    <SettingsGroup title="Members" description="Roles shown here are the workspace permissions Agentic Economy enforces.">
      <ul className="arc-team-member-list" aria-label="Workspace members">
        {members.map(person => <li key={person.key} className="arc-team-member-row">
          <div className="arc-team-member-row-inner">
            <span className="arc-team-member-avatar" aria-hidden="true">{initialsForName(person.name)}</span>
            <div className="arc-team-member-identity">
              <span className="arc-team-member-name">{person.name}</span>
              <span className="arc-team-member-email">{person.email ?? 'Email not available'}</span>
            </div>
            <span className="arc-team-member-role">{person.role}</span>
          </div>
        </li>)}
      </ul>
    </SettingsGroup>
  </div>
}
