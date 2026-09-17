import type { ButtonHTMLAttributes } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary'
}

const variantStyles = {
  primary: 'w-full bg-coral text-action-ink shadow-float active:bg-coral-pressed disabled:bg-stone disabled:shadow-none sm:w-auto',
  secondary: 'border border-line bg-surface text-ink active:bg-page disabled:text-muted',
}

function Button({ className, type = 'button', variant = 'primary', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-control px-5 py-3 text-body font-[650] transition-colors focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-70 ${variantStyles[variant]} ${className ?? ''}`}
      type={type}
      {...props}
    />
  )
}

export default Button
export type { ButtonProps }
