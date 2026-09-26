import React from 'react'
import { AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from './cn'

const SIDES = {
    bottom: 'top-full mt-2',
    top: 'bottom-full mb-2'
} as const

const ALIGNS = {
    center: 'left-1/2 -translate-x-1/2',
    end: 'right-0'
} as const

interface TooltipProps {
    label: string
    side?: keyof typeof SIDES
    align?: keyof typeof ALIGNS
    className?: string
    children: React.ReactNode
}

/**
 * CSS-only: the trigger stays focusable and the panel reveals on hover or focus-within,
 * which is why it is positioned against the trigger rather than portalled.
 */
export function Tooltip({ label, side = 'bottom', align = 'center', className, children }: TooltipProps) {
    return (
        <span className="group relative inline-flex">
            {children}
            <span
                role="tooltip"
                className={cn(
                    'pointer-events-none absolute z-popover w-max max-w-[240px] rounded-md bg-foreground px-2.5 py-1',
                    'text-xs font-medium leading-tight text-background shadow-pop opacity-0 transition-opacity duration-150 ease-out',
                    'group-hover:opacity-100 group-focus-within:opacity-100',
                    SIDES[side],
                    ALIGNS[align],
                    className
                )}
            >
                {label}
            </span>
        </span>
    )
}

/** Inline disclosure for a hint the label alone cannot carry. */
export function InfoHint({ text }: { text: string }) {
    const { t } = useTranslation(['settings', 'common'])

    return (
        <Tooltip label={text} align="end">
            <span className="sr-only">{t('settings:moreInformation')}</span>
            <AlertCircle className="w-3.5 h-3.5 text-foreground-subtle" aria-hidden="true" />
        </Tooltip>
    )
}
