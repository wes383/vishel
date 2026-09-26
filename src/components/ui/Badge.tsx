import React from 'react'
import { cn } from './cn'

const TONES = {
    neutral: 'bg-hover-bg-strong text-foreground-muted',
    accent: 'bg-accent text-accent-foreground',
    muted: 'bg-muted text-foreground-muted',
    outline: 'border border-border text-foreground-muted',
    success: 'bg-success-soft text-success border border-success-border',
    danger: 'bg-danger-soft text-danger border border-danger-border',
    warning: 'bg-warning-soft text-warning border border-warning-border',
    info: 'bg-info-soft text-info border border-info-border'
} as const

const SIZES = {
    xs: 'px-2 py-0.5 text-xs',
    sm: 'px-3 py-1 text-sm'
} as const

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    tone?: keyof typeof TONES
    size?: keyof typeof SIZES
    shape?: 'pill' | 'rect'
    /** Leading dot in the badge's own colour. */
    dot?: boolean
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
    { tone = 'neutral', size = 'xs', shape = 'pill', dot = false, className, children, ...rest },
    ref
) {
    return (
        <span
            ref={ref}
            className={cn(
                'inline-flex items-center gap-1.5 font-medium whitespace-nowrap',
                shape === 'pill' ? 'rounded-full' : 'rounded-md',
                TONES[tone],
                SIZES[size],
                className
            )}
            {...rest}
        >
            {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
            {children}
        </span>
    )
})

export default Badge
