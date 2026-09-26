import React from 'react'
import Card from './Card'
import { cn } from './cn'

interface SettingRowProps {
    title: string
    description?: React.ReactNode
    control: React.ReactNode
    /** Extra rows rendered under the same card (e.g. a dependent sub-setting). */
    children?: React.ReactNode
    disabled?: boolean
}

export default function SettingRow({ title, description, control, children, disabled = false }: SettingRowProps) {
    return (
        <div>
            <Card
                padded
                className={cn(children ? 'space-y-5' : 'flex items-center justify-between', disabled && 'opacity-50')}
            >
                <div className={children ? 'flex items-center justify-between' : undefined}>
                    <h3 className={cn('font-medium', disabled && 'text-foreground-subtle')}>{title}</h3>
                    {children && control}
                </div>
                {children && children}
                {!children && control}
            </Card>
            {description && <p className="text-xs text-foreground-muted mt-1 flex items-center gap-2">{description}</p>}
        </div>
    )
}
