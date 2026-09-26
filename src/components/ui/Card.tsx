import React from 'react'
import { cn } from './cn'

const VARIANTS = {
    surface: 'bg-surface border border-border',
    inset: 'bg-background border border-border'
} as const

const PADDING = {
    sm: 'p-3',
    md: 'p-4'
} as const

interface CardProps extends React.HTMLAttributes<HTMLElement> {
    variant?: keyof typeof VARIANTS
    /** Hover deepens the hairline; the reference system never adds shadow to a card. */
    interactive?: boolean
    padded?: boolean | keyof typeof PADDING
    as?: 'div' | 'li' | 'section'
}

export default function Card({
    variant = 'surface',
    interactive = false,
    padded = false,
    as: Tag = 'div',
    className,
    ...rest
}: CardProps) {
    const padding = typeof padded === 'boolean' ? (padded ? PADDING.md : '') : PADDING[padded]
    return (
        <Tag
            className={cn(
                VARIANTS[variant],
                'rounded-lg',
                padding,
                interactive && 'transition-colors duration-150 ease-out hover:border-border-strong',
                className
            )}
            {...rest}
        />
    )
}
