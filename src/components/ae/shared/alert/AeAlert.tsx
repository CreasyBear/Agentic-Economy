import { Alert } from '@/components/arc/alert/alert'
import type { AeAlertProps } from './alert.contracts'
import styles from './alert.module.css'

export function AeAlert({ className, ...props }: AeAlertProps) {
  return <Alert {...props} className={[styles.alert, className].filter(Boolean).join(' ')} />
}
