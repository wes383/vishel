import React, { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from './cn'

interface DisclosureProps {
    title: string
    /** Sits beside the trigger instead of inside it: a button must not contain another control. */
    actions?: React.ReactNode
    defaultOpen?: boolean
    className?: string
    children: React.ReactNode
}

/**
 * orkest's accordion idiom. The panel unmounts rather than animating its height, which is what
 * keeps a collapsed group's inputs and buttons out of the tab order without needing `inert`.
 */
export default function Disclosure({ title, actions, defaultOpen = true, className, children }: DisclosureProps) {
    const [open, setOpen] = useState(defaultOpen)
    const panelId = useId()
    const triggerId = useId()

    return (
        <div className={cn('border-b border-border last:border-b-0', className)}>
            <div className="flex items-center justify-between gap-3 py-3">
                <h3 className="flex min-w-0 flex-1">
                    <button
                        type="button"
                        id={triggerId}
                        aria-expanded={open}
                        aria-controls={panelId}
                        onClick={() => setOpen(value => !value)}
                        className="inline-flex min-w-0 items-center gap-2 rounded-md py-1 text-left text-sm font-medium transition-colors duration-150 ease-out hover:text-foreground-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {title}
                        <ChevronDown
                            className={cn('h-4 w-4 shrink-0 text-foreground-muted transition-transform duration-150 ease-out', open && 'rotate-180')}
                            aria-hidden="true"
                        />
                    </button>
                </h3>
                {actions}
            </div>

            {open && (
                <div id={panelId} role="group" aria-labelledby={triggerId} className="pb-3">
                    {children}
                </div>
            )}
        </div>
    )
}
