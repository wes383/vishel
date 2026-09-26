import React from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle } from 'lucide-react'

interface ToggleProps {
    checked: boolean
    onChange: (next: boolean) => void
    /** Accessible name - these switches sit next to a heading but are not real checkboxes. */
    label: string
    disabled?: boolean
}

export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                disabled ? 'bg-neutral-600 cursor-not-allowed' : checked ? 'bg-white' : 'bg-neutral-600 hover:bg-neutral-500'
            }`}
        >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-transform ${checked ? 'left-7' : 'left-1'}`} />
        </button>
    )
}

interface SegmentedProps<T extends string> {
    value: T
    options: readonly { value: T; label: string }[]
    onChange: (next: T) => void
    label: string
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
    return (
        <div className="flex bg-neutral-700/50 rounded-full p-1" role="group" aria-label={label}>
            {options.map(option => (
                <button
                    key={option.value}
                    type="button"
                    aria-pressed={value === option.value}
                    onClick={() => onChange(option.value)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                        value === option.value ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                    }`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    )
}

interface SettingRowProps {
    title: string
    description?: React.ReactNode
    control: React.ReactNode
    /** Extra rows rendered under the same card (e.g. a dependent sub-setting). */
    children?: React.ReactNode
    disabled?: boolean
}

export function SettingRow({ title, description, control, children, disabled = false }: SettingRowProps) {
    return (
        <div>
            <div className={`bg-neutral-800 p-4 rounded-lg ${children ? 'space-y-5' : 'flex items-center justify-between'} ${disabled ? 'opacity-50' : ''}`}>
                <div className={children ? 'flex items-center justify-between' : ''}>
                    <h3 className={`font-medium ${disabled ? 'text-gray-500' : ''}`}>{title}</h3>
                    {children && control}
                </div>
                {children && children}
                {!children && control}
            </div>
            {description && <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">{description}</p>}
        </div>
    )
}

export function InfoHint({ text }: { text: string }) {
    const { t } = useTranslation(['settings', 'common'])

    return (
        <span className="group relative inline-flex">
            <span className="sr-only">{t('settings:moreInformation')}</span>
            <AlertCircle className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />
            <span
                role="tooltip"
                className="absolute top-full right-0 mt-2 px-3 py-2 bg-neutral-800 border border-neutral-600 text-white text-xs rounded-lg whitespace-normal w-72 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none z-10"
            >
                {text}
            </span>
        </span>
    )
}
