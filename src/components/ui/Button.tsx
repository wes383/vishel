import React, { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from './cn'

const VARIANTS = {
    default: 'bg-accent text-accent-foreground hover:bg-accent-hover',
    outline: 'bg-surface text-foreground border border-border hover:bg-hover-bg hover:border-border-strong',
    ghost: 'text-foreground hover:bg-hover-bg',
    subtle: 'bg-hover-bg text-foreground hover:bg-hover-bg-strong',
    danger: 'bg-danger text-background hover:bg-danger-strong'
} as const

const SIZES = {
    sm: 'h-9 px-4 text-sm',
    md: 'h-10 px-5 text-sm',
    lg: 'h-12 px-7 text-base',
    /** Fixed square instead of the padding-sized hit boxes this replaces. */
    icon: 'h-9 w-9'
} as const

export type ButtonVariant = keyof typeof VARIANTS
export type ButtonSize = keyof typeof SIZES

export const BUTTON_BASE = cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium',
    'leading-none select-none transition-colors duration-150 ease-out active:scale-[0.97]',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50'
)

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant
    size?: ButtonSize
    loading?: boolean
    fullWidth?: boolean
}

/**
 * `className` is appended after the variant classes, so it can extend a button
 * but must not restate a utility already set here (rounded, colour, height).
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = 'default', size = 'md', loading = false, fullWidth = false, className, type = 'button', disabled, children, ...rest },
    ref
) {
    return (
        <button
            ref={ref}
            type={type}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={cn(BUTTON_BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
            {...rest}
        >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {children}
        </button>
    )
})

export default Button
