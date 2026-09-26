import { cn } from './cn'

interface ToggleProps {
    checked: boolean
    onChange: (next: boolean) => void
    /** Accessible name - these switches sit next to a heading but are not real checkboxes. */
    label: string
    disabled?: boolean
}

export default function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-150 ease-out',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'disabled:cursor-not-allowed disabled:opacity-50',
                checked ? 'bg-accent' : 'bg-hover-bg-strong'
            )}
        >
            <span
                className={cn(
                    'h-[18px] w-[18px] rounded-full bg-surface shadow-sm transition-transform duration-150 ease-out',
                    checked ? 'translate-x-[23px]' : 'translate-x-[3px]'
                )}
            />
        </button>
    )
}
