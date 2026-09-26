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
            <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
                {Icon && <Icon className="h-6 w-6 mb-2 text-foreground-faint" aria-hidden="true" />}
                <div className="text-base text-foreground-muted">{title}</div>
                {hint && <div className="mt-1 text-sm text-foreground-muted">{hint}</div>}
                {children && <div className="mt-4 flex items-center gap-2">{children}</div>}
            </div>
        )
    }

    return (
        <div className={cn('flex flex-col items-center justify-center p-8 text-center border border-dashed border-border rounded-lg bg-surface/60', className)}>
            {Icon && <Icon className="h-8 w-8 text-foreground-faint mb-3" aria-hidden="true" />}
            <div className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</div>
            {hint && <div className="mt-1 text-sm text-foreground-muted">{hint}</div>}
            {children && <div className="mt-4 flex items-center gap-2">{children}</div>}
        </div>
    )
}
