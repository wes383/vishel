import { Loader2 } from 'lucide-react'
import { cn } from './cn'

const SPINNER_SIZES = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6'
} as const

export function Spinner({ size = 'md', label, className }: { size?: keyof typeof SPINNER_SIZES; label?: string; className?: string }) {
    return (
        <>
            <Loader2 className={cn('animate-spin text-foreground-muted', SPINNER_SIZES[size], className)} aria-hidden="true" aria-busy="true" />
            {label && <span className="sr-only">{label}</span>}
        </>
    )
}

export function Skeleton({ className }: { className?: string }) {
    return <div className={cn('bg-hover-bg-strong rounded-md animate-pulse', className)} aria-hidden="true" />
}

export function LoadingPanel({ label, className }: { label: string; className?: string }) {
    return (
        <div className={cn('flex items-center justify-center gap-3 py-20 text-foreground-muted', className)} role="status">
            <Spinner size="md" />
            <span className="text-sm">{label}</span>
        </div>
    )
}
