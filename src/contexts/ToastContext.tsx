import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

export type ToastKind = 'info' | 'success' | 'error'

interface Toast {
    id: number
    message: string
    kind: ToastKind
}

interface ToastApi {
    showToast: (message: string, kind?: ToastKind, duration?: number) => void
    dismissToast: (id: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const STYLES: Record<ToastKind, string> = {
    info: 'bg-neutral-800/90 ring-white/20',
    success: 'bg-green-600/80 ring-green-200/40',
    error: 'bg-red-600/80 ring-red-200/40'
}

let nextId = 0

/** The app's only transient message surface - replaces the three per-component toasts and alert(). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])
    const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

    const dismissToast = useCallback((id: number) => {
        const timer = timers.current.get(id)
        if (timer) {
            clearTimeout(timer)
            timers.current.delete(id)
        }
        setToasts(current => current.filter(toast => toast.id !== id))
    }, [])

    const showToast = useCallback((message: string, kind: ToastKind = 'info', duration = 3000) => {
        const id = ++nextId
        setToasts(current => [...current.slice(-2), { id, message, kind }])
        const timer = setTimeout(() => dismissToast(id), duration)
        timers.current.set(id, timer)
    }, [dismissToast])

    useEffect(() => {
        const active = timers.current
        return () => {
            active.forEach(clearTimeout)
            active.clear()
        }
    }, [])

    const api = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast])

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div
                className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none"
                aria-live="polite"
                aria-atomic="false"
            >
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        role={toast.kind === 'error' ? 'alert' : 'status'}
                        className={`pointer-events-auto max-w-[90vw] text-white px-6 py-3 rounded-full shadow-lg ring-[0.8px] backdrop-blur-md text-sm ${STYLES[toast.kind]}`}
                    >
                        {toast.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    )
}

export const useToast = (): ToastApi => {
    const context = useContext(ToastContext)
    if (!context) throw new Error('useToast must be used inside <ToastProvider>')
    return context
}
