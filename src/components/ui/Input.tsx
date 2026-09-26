import React, { forwardRef } from 'react'
import { cn } from './cn'

const SIZES = {
    md: 'h-10 px-3 text-sm',
    lg: 'h-12 px-4 text-base'
} as const

const BASE = cn(
    'w-full min-w-0 bg-surface border rounded-lg text-foreground transition-colors duration-150 ease-out',
    'focus:outline-none focus:border-border-strong disabled:cursor-not-allowed disabled:opacity-60'
)

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
    size?: keyof typeof SIZES
    invalid?: boolean
}

/** Focus feedback is the border colour only - fields must not glow. */
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    { size = 'lg', invalid = false, className, ...rest },
    ref
) {
    return (
        <input
            ref={ref}
            aria-invalid={invalid || undefined}
            className={cn(BASE, SIZES[size], invalid ? 'border-danger focus:border-danger' : 'border-border', className)}
            {...rest}
        />
    )
})

export default Input
