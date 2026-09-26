import React from 'react'
import { cn } from './cn'

interface FieldProps {
    /** Must match the id of the control inside `children` so the label binds. */
    id?: string
    label?: React.ReactNode
    hint?: React.ReactNode
    error?: React.ReactNode
    required?: boolean
    className?: string
    children: React.ReactNode
}

export function Field({ id, label, hint, error, required = false, className, children }: FieldProps) {
    return (
        <div className={cn('space-y-2', className)}>
            {label && (
                <label htmlFor={id} className="block text-sm font-medium tracking-wide text-foreground-muted">
                    {label}
                    {required && <span aria-hidden="true"> *</span>}
                </label>
            )}
            {children}
            {hint && !error && <p id={id ? `${id}-hint` : undefined} className="text-xs text-foreground-muted">{hint}</p>}
            {error && <p id={id ? `${id}-error` : undefined} role="alert" className="text-xs font-medium text-danger">{error}</p>}
        </div>
    )
}

interface FieldLabelProps {
    htmlFor?: string
    className?: string
    children: React.ReactNode
}

/** Standalone label for layouts that assemble their own rows. */
export function FieldLabel({ htmlFor, className, children }: FieldLabelProps) {
    return (
        <label htmlFor={htmlFor} className={cn('block text-sm font-medium tracking-wide text-foreground-muted', className)}>
            {children}
        </label>
    )
}
