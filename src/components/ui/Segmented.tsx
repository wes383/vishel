import { cn } from './cn'

interface SegmentedProps<T extends string> {
    value: T
    options: readonly { value: T; label: string }[]
    onChange: (next: T) => void
    label: string
    /** Full-width equal columns, for controls that sit inside a row. */
    fill?: boolean
}

/**
 * Contained tabs: the selection is a fill, not an underline, and nothing scales.
 */
export default function Segmented<T extends string>({ value, options, onChange, label, fill = false }: SegmentedProps<T>) {
    return (
        <div className={cn('flex bg-hover-bg rounded-full p-1', fill && 'w-full')} role="group" aria-label={label}>
            {options.map(option => (
                <button
                    key={option.value}
                    type="button"
                    aria-pressed={value === option.value}
                    onClick={() => onChange(option.value)}
                    className={cn(
                        'px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors duration-150 ease-out',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        fill && 'flex-1',
                        value === option.value ? 'bg-hover-bg-strong text-foreground' : 'text-foreground-muted hover:text-foreground'
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    )
}
