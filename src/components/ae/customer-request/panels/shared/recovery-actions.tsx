import { Button } from '@astryxdesign/core/Button'

export function RecoveryActions({ edit, restart }: { edit: () => void; restart: () => void }) { return <div className="flex flex-wrap gap-3 border-t border-border pt-4"><Button label="Edit this Request" variant="secondary" clickAction={edit} /><Button label="Start a new Request" variant="ghost" clickAction={restart} /></div> }
