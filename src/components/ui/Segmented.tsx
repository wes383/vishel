import { cn } from './cn'

/**
 * The whole app has one tab-strip definition. LibraryTabs renders it as role=tablist,
 * Segmented renders it as a toggle group; both read these classes so the two cannot drift.
 */
export const TAB_LIST_CLASS = 'flex flex-wrap items-center gap-1 p-1'

/** Compact strip for in-row controls: 24px tall so a setting row matches its Toggle twin. */
export const TAB_LIST_COMPACT_CLASS = 'flex flex-wrap items-center gap-1'

export const tabTriggerClass = (isActive: boolean, compact = false) => cn(
    'inline-flex items-center justify-center whitespace-nowrap rounded-md px-4',
    compact ? 'py-[3px]' : 'py-2.5',
    'text-sm font-medium transition-colors duration-150 ease-out',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    isActive
        ? 'bg-hover-bg text-foreground'
        : 'text-foreground-muted hover:bg-hover-bg hover:text-foreground'
)

interface SegmentedOption<T> {
    value: T
    label: string
}

interface SegmentedProps<T extends string | number> {
    /** null renders an unselected strip, for controls whose value is still loading. */
    value: T | null
    options: readonly SegmentedOption<T>[]
    onChange: (next: T) => void
    label: string
    /** Full-width equal columns, for controls that sit inside a row. */
    fill?: boolean
    /** Shorter strip that lines up with the Toggle height (24px) beside it in setting rows. */
    compact?: boolean
}

/**
 * Contained tabs: the selection is a fill, not an underline, and nothing scales.
 */
export default function Segmented<T extends string | number>({ value, options, onChange, label, fill = false, compact = false }: SegmentedProps<T>) {
    return (
        <div className={cn(compact ? TAB_LIST_COMPACT_CLASS : TAB_LIST_CLASS, fill && 'w-full')} role="group" aria-label={label}>
            {options.map(option => (
                <button
                    key={String(option.value)}
                    type="button"
                    aria-pressed={value === option.value}
                    onClick={() => onChange(option.value)}
                    className={cn(tabTriggerClass(value === option.value, compact), fill && 'flex-1')}
                >
                    {option.label}
                </button>
            ))}
        </div>
    )
}
