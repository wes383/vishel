import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',')

const SIZES = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl'
} as const

export interface ModalProps {
    title: string
    onClose: () => void
    children: React.ReactNode
    size?: keyof typeof SIZES
    /** Rendered under the title; also announced together with the dialog. */
    description?: string
    footer?: React.ReactNode
    /** Content is scrolled by the caller instead of the shell. */
    bodyClassName?: string
    /** Extra class for the panel, e.g. a fixed width the size preset cannot express. */
    panelClassName?: string
}

/**
 * Single accessible dialog shell: role=dialog + aria-modal, Escape to close, focus moved
 * in on mount and returned to the opener on unmount, and Tab kept inside the panel.
 */
export default function Modal({
    title,
    onClose,
    children,
    size = 'md',
    description,
    footer,
    bodyClassName = '',
    panelClassName = ''
}: ModalProps) {
    const panelRef = useRef<HTMLDivElement>(null)
    const { t } = useTranslation(['common'])
    const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2)}`).current
    const descriptionId = useRef(`modal-description-${Math.random().toString(36).slice(2)}`).current
    const [opener, setOpener] = useState<HTMLElement | null>(null)

    useEffect(() => {
        setOpener(document.activeElement instanceof HTMLElement ? document.activeElement : null)
    }, [])

    useEffect(() => {
        const panel = panelRef.current
        if (!panel) return

        const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        const preferred = focusables.find(el => el.dataset.autofocus !== undefined) || focusables[0]
        preferred?.focus()
    }, [])

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
            return
        }

        if (event.key !== 'Tab') return

        const panel = panelRef.current
        if (!panel) return

        const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
            .filter(el => !el.hasAttribute('inert') && el.getClientRects().length > 0)
        if (focusables.length === 0) return

        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement

        if (event.shiftKey && (active === first || !panel.contains(active))) {
            event.preventDefault()
            last.focus()
        } else if (!event.shiftKey && active === last) {
            event.preventDefault()
            first.focus()
        }
    }, [onClose])

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown, true)
        return () => {
            document.removeEventListener('keydown', handleKeyDown, true)
            opener?.focus()
        }
    }, [handleKeyDown, opener])

    return createPortal(
        <div
            className="fixed inset-0 z-modal flex items-center justify-center bg-overlay p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
                // No element may be introduced between this overlay and the panel: the
                // click-outside test compares the event target against this node.
                if (event.target === event.currentTarget) onClose()
            }}
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={description ? descriptionId : undefined}
                className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-border bg-surface text-foreground shadow-dialog ${SIZES[size]} ${panelClassName}`}
            >
                <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
                    <div>
                        <h2 id={titleId} className="font-display text-xl font-semibold tracking-tight">{title}</h2>
                        {description && (
                            <p id={descriptionId} className="mt-1 text-sm text-foreground-muted">{description}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('common:closeDialog')}
                        className="-mr-2 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-foreground-muted transition-colors duration-150 ease-out hover:bg-hover-bg hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <X className="w-5 h-5" aria-hidden="true" />
                    </button>
                </div>

                <div className={`flex-1 overflow-auto px-6 py-4 ${bodyClassName}`}>
                    {children}
                </div>

                {footer && (
                    <div className="border-t border-border px-6 py-4">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    )
}
