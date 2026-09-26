import { Check, Minus } from 'lucide-react'
import { cn } from './cn'

interface CheckboxProps {
    checked: boolean
    onCheckedChange: () => void
    /** The row itself is often the clickable thing, so this stays a plain control. */
    label: string
    indeterminate?: boolean
    disabled?: boolean
    className?: string
}

const BOX = 'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export function Checkbox({ checked, onCheckedChange, label, indeterminate = false, disabled = false, className }: CheckboxProps) {
    const on = checked || indeterminate
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={indeterminate ? 'mixed' : checked}
            aria-label={label}
            disabled={disabled}
            onClick={onCheckedChange}
            className={cn(BOX, on ? 'border-accent bg-accent text-accent-foreground' : 'border-border-strong bg-surface hover:border-ring', disabled && 'cursor-not-allowed opacity-50', className)}
        >
            {indeterminate
                ? <Minus className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                : checked && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
        </button>
    )
}

const INDICATOR = 'flex h-4 w-4 flex-shrink-0 items-center justify-center transition-colors duration-150 ease-out'

/** Presentational box for rows that are already buttons. */
export function CheckboxIndicator({ checked }: { checked: boolean }) {
    return (
        <span className={cn(INDICATOR, 'rounded-[4px] border', checked ? 'border-accent bg-accent text-accent-foreground' : 'border-border-strong bg-surface')} aria-hidden="true">
            {checked && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
    )
}

/** Presentational dot for the same reason. */
export function RadioIndicator({ checked }: { checked: boolean }) {
    return (
        <span className={cn(INDICATOR, 'rounded-full border', checked ? 'border-accent' : 'border-border-strong')} aria-hidden="true">
            <span className={cn('h-2 w-2 rounded-full transition-transform duration-150 ease-out', checked ? 'scale-100 bg-accent' : 'scale-0')} />
        </span>
    )
}
