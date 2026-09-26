import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from './cn'

interface EmptyStateProps {
    icon?: LucideIcon
    title: React.ReactNode
    hint?: React.ReactNode
    /** Centred column of text with no card; use inside a scroller that already has one. */
    compact?: boolean
    className?: string
    /** Actions, rendered under the copy. */
    children?: React.ReactNode
}

/** Never gains an overflow rule: the grid virtualizer resolves the nearest scrollable ancestor. */
export default function EmptyState({ icon: Icon, title, hint, compact = false, className, children }: EmptyStateProps) {
    if (compact) {
        return (
            <div className={cn('flex flex-col items-center justify-center text-center py-12', className)}>
                {Icon && <Icon className="h-6 w-6 mb-2 text-foreground-faint" aria-hidden="true" />}
                <p className="text-base text-foreground-muted">{title}</p>
                {hint && <p className="text-sm text-foreground-muted mt-1">{hint}</p>}
                {children && <div className="flex items-center gap-2 mt-4">{children}</div>}
            </div>
        )
    }

    return (
        <div className={cn('flex flex-col items-center justify-center text-center p-8 border border-dashed border-border rounded-lg bg-surface/60', className)}>
            {Icon && <Icon className="h-8 w-8 text-foreground-faint mb-3" aria-hidden="true" />}
            <p className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</p>
            {hint && <p className="text-sm text-foreground-muted mt-1">{hint}</p>}
            {children && <div className="flex items-center gap-2 mt-4">{children}</div>}
        </div>
    )
}
