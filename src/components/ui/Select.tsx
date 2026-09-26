import React, { forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from './cn'

const SIZES = {
    md: 'h-10 pr-9 pl-3 text-sm',
    lg: 'h-12 pr-9 pl-4 text-base'
} as const

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
    size?: keyof typeof SIZES
    invalid?: boolean
    /** Accessible name; the native control cannot be labelled by adjacent text. */
    label: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
    { size = 'lg', invalid = false, label, className, children, ...rest },
    ref
) {
    return (
        <div className="relative min-w-0 w-full">
            <select
                ref={ref}
                aria-label={label}
                aria-invalid={invalid || undefined}
                className={cn(
                    'w-full appearance-none bg-surface border rounded-lg text-foreground cursor-pointer',
                    'focus:outline-none focus:border-border-strong disabled:cursor-not-allowed disabled:opacity-60',
                    'transition-colors duration-150 ease-out truncate',
                    SIZES[size],
                    invalid ? 'border-danger focus:border-danger' : 'border-border',
                    className
                )}
                {...rest}
            >
                {children}
            </select>
            <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60"
                aria-hidden="true"
            />
        </div>
    )
})

export default Select
