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

const DANGER_VARIANTS = {
    outline: 'bg-surface border border-border text-foreground-muted hover:bg-danger-soft hover:border-danger-border hover:text-danger',
    ghost: 'text-foreground-muted hover:bg-danger-soft hover:text-danger',
    subtle: 'bg-hover-bg text-foreground-muted hover:bg-danger-soft hover:text-danger',
    default: 'bg-danger text-background hover:bg-danger-strong',
    danger: 'bg-danger text-background hover:bg-danger-strong'
} as const

/**
 * A tone never layers a second `hover:bg-*` onto the variant: two utilities for
 * the same property on one element resolve by stylesheet order, not by the order
 * they are written in the class attribute.
 */
const variantClasses = (variant: ButtonVariant, danger: boolean) =>
    (danger ? DANGER_VARIANTS[variant] : VARIANTS[variant])

const SIZES = {
    sm: 'h-9 px-4 text-sm',
    md: 'h-10 px-5 text-sm',
    lg: 'h-12 px-7 text-base',
    /** Fixed square hit box instead of the padding-sized ones this replaces. */
    icon: 'h-9 w-9'
} as const

/**
 * Exactly one radius is emitted per button: two `rounded-*` utilities on one element
 * would resolve by stylesheet order, not by the order written here.
 */
const RADIUS = { pill: 'rounded-full', tile: 'rounded-md' } as const

export type ButtonVariant = keyof typeof VARIANTS
export type ButtonSize = keyof typeof SIZES

export const BUTTON_BASE = cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium',
    'leading-none select-none transition-colors duration-150 ease-out active:scale-[0.97]',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50'
)

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant
    size?: ButtonSize
    /** Semantic red on hover, for controls that destroy something. */
    tone?: 'default' | 'danger'
    loading?: boolean
    fullWidth?: boolean
}

/**
 * `className` is appended after the variant classes, so it can extend a button
 * but must not restate a utility already set here (rounded, colour, height).
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = 'default', size = 'md', tone = 'default', loading = false, fullWidth = false, className, type = 'button', disabled, children, ...rest },
    ref
) {
    return (
        <button
            ref={ref}
            type={type}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={cn(BUTTON_BASE, size === 'icon' ? RADIUS.tile : RADIUS.pill, variantClasses(variant, tone === 'danger'), SIZES[size], fullWidth && 'w-full', className)}
            {...rest}
        >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {children}
        </button>
    )
})

export default Button
