import React from 'react'
import { cn } from './cn'

interface ListItemButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    title: string
    /** Secondary line, typically a path. Truncated, so keep it single-line. */
    meta?: string
    icon?: React.ReactNode
    selected?: boolean
}

/**
 * The pick-a-version row, which the grid, the history list and the episode
 * picker each used to style for themselves.
 */
export default function ListItemButton({ title, meta, icon, selected = false, className, ...rest }: ListItemButtonProps) {
    return (
        <button
            type="button"
            aria-pressed={selected || undefined}
            className={cn(
                'flex w-full items-center gap-3 rounded-lg p-4 text-left transition-colors duration-150 ease-out',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected ? 'bg-accent-muted border border-border-strong' : 'bg-hover-bg hover:bg-hover-bg-strong border border-transparent',
                className
            )}
            {...rest}
        >
            {icon && <span className="flex-shrink-0 text-foreground" aria-hidden="true">{icon}</span>}
            <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">{title}</span>
                {meta && <span className="block truncate text-sm text-foreground-muted">{meta}</span>}
            </span>
        </button>
    )
}
