import type { ReactNode } from 'react'

type EmptyStateProps = {
  action?: ReactNode
  children: ReactNode
  title: string
}

function EmptyState({ action, children, title }: EmptyStateProps) {
  return (
    <section className="mx-auto flex max-w-md flex-col items-start gap-3 py-10 text-left">
      <h2 className="font-display text-section-title text-ink">{title}</h2>
      <div className="max-w-[70ch] text-body text-ink">{children}</div>
      {action && <div className="mt-2 w-full sm:w-auto">{action}</div>}
    </section>
  )
}

export default EmptyState
export type { EmptyStateProps }
