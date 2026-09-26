import { cn } from './cn'

/**
 * The whole app has one tab-strip definition. LibraryTabs renders it as role=tablist,
 * Segmented renders it as a toggle group; both read these classes so the two cannot drift.
 */
export const TAB_LIST_CLASS = 'flex flex-wrap items-center gap-1 p-1'

export const tabTriggerClass = (isActive: boolean) => cn(
    'inline-flex items-center justify-center whitespace-nowrap rounded-md px-4 py-2.5',
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
}

/**
 * Contained tabs: the selection is a fill, not an underline, and nothing scales.
 */
export default function Segmented<T extends string | number>({ value, options, onChange, label, fill = false }: SegmentedProps<T>) {
    return (
        <div className={cn(TAB_LIST_CLASS, fill && 'w-full')} role="group" aria-label={label}>
            {options.map(option => (
                <button
                    key={String(option.value)}
                    type="button"
                    aria-pressed={value === option.value}
                    onClick={() => onChange(option.value)}
                    className={cn(tabTriggerClass(value === option.value), fill && 'flex-1')}
                >
                    {option.label}
                </button>
            ))}
        </div>
    )
}
