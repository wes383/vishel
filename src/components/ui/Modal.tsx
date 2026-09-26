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
    /** Extra class for the panel, used for the lighter overlays in the library. */
    panelClassName?: string
    variant?: 'light' | 'dark'
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
    panelClassName = '',
    variant = 'light'
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
            .filter(el => el.offsetParent !== null)
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

    const isLight = variant === 'light'

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose()
            }}
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={description ? descriptionId : undefined}
                className={`rounded-xl backdrop-blur-md w-full ${SIZES[size]} max-h-[90vh] flex flex-col overflow-hidden ${
                    isLight ? 'bg-white/50 text-gray-900 ring-[0.8px] ring-white/30' : 'bg-neutral-900/95 text-white ring-[0.8px] ring-white/10'
                } ${panelClassName}`}
            >
                <div className={`flex items-start justify-between gap-4 px-6 py-4 border-b ${isLight ? 'border-gray-900/10' : 'border-white/10'}`}>
                    <div>
                        <h2 id={titleId} className={`text-xl font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>{title}</h2>
                        {description && (
                            <p id={descriptionId} className={`text-sm mt-1 ${isLight ? 'text-gray-700' : 'text-white/60'}`}>{description}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('common:closeDialog')}
                        className={`p-2 rounded-full transition-colors ${isLight ? 'hover:bg-black/10 text-gray-900' : 'hover:bg-white/10 text-white'}`}
                    >
                        <X className="w-5 h-5" aria-hidden="true" />
                    </button>
                </div>

                <div className={`flex-1 overflow-auto px-6 py-4 ${bodyClassName}`}>
                    {children}
                </div>

                {footer && (
                    <div className={`px-6 py-4 border-t ${isLight ? 'border-gray-900/10' : 'border-white/10'}`}>
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    )
}
