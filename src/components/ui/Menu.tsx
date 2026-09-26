import React from 'react'
import { cn } from './cn'

/**
 * Kept in step with the classes below so MediaGrid can size its open-upwards
 * flip logic from a real measurement instead of a guess.
 */
export const MENU_ITEM_HEIGHT = 34
/** py-2 text-sm line plus the 1px rule and the mb-1 gap under it. */
export const MENU_HEADER_HEIGHT = 39
export const MENU_PADDING_Y = 8

export const menuHeight = (items: number, withHeader = false): number =>
    MENU_PADDING_Y + items * MENU_ITEM_HEIGHT + (withHeader ? MENU_HEADER_HEIGHT : 0)

interface MenuProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Accessible name, e.g. "Actions for <title>". */
    label: string
    /** Cursor-anchored context menus need the viewport; trigger-anchored ones need the parent. */
    placement?: 'fixed' | 'absolute'
}

const PLACEMENT = {
    fixed: 'fixed',
    absolute: 'absolute'
} as const

const Menu = React.forwardRef<HTMLDivElement, MenuProps>(function Menu(
    { label, placement = 'absolute', className, children, ...rest },
    ref
) {
    return (
        <div
            ref={ref}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            className={cn(
                'z-dropdown min-w-48 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-pop',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                PLACEMENT[placement],
                className
            )}
            {...rest}
        >
            {children}
        </div>
    )
})

interface MenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    role?: 'menuitem' | 'menuitemradio' | 'menuitemcheckbox'
    checked?: boolean
}

/**
 * A real button, because MediaGrid roves focus over `[role="menuitem"]:not([disabled])`
 * and a div with aria-disabled would both join that walk and swallow the click.
 */
export const MenuItem = React.forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem(
    { role = 'menuitem', checked, className, children, ...rest },
    ref
) {
    return (
        <button
            ref={ref}
            type="button"
            role={role}
            aria-checked={role === 'menuitem' ? undefined : checked}
            className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground',
                'cursor-pointer transition-colors duration-150 ease-out hover:bg-hover-bg focus:bg-hover-bg focus:outline-none',
                'disabled:pointer-events-none disabled:opacity-50',
                className
            )}
            {...rest}
        >
            {children}
        </button>
    )
})

export function MenuLabel({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <p className={cn('px-3 py-1.5 text-xs font-medium tracking-wide text-foreground-muted', className)}>{children}</p>
    )
}

export function MenuSeparator() {
    return <div role="separator" className="my-1 h-px bg-border" />
}

export default Menu
