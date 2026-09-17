import type { HTMLAttributes } from 'react'

type RecordCardProps = HTMLAttributes<HTMLElement>

function RecordCard({ className, ...props }: RecordCardProps) {
  return (
    <article
      className={`rounded-card border border-line bg-surface p-5 ${className ?? ''}`}
      {...props}
    />
  )
}

export default RecordCard
export type { RecordCardProps }
