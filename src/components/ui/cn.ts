export type ClassValue = string | false | null | undefined

export const cn = (...parts: ClassValue[]): string => parts.filter(Boolean).join(' ')
