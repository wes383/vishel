/**
 * Logging helpers. URLs built for authenticated playback embed `user:password@host`,
 * so nothing may print a URL without passing through here first.
 */
export const maskUrl = (rawUrl: string): string => {
    if (!rawUrl) return ''
    try {
        const url = new URL(rawUrl)
        if (!url.username && !url.password) return rawUrl
        if (url.username) url.username = '***'
        if (url.password) url.password = '***'
        return url.toString()
    } catch {
        // Not a parseable URL (UNC path, local path): still hide inline credentials.
        return rawUrl.replace(/(:\/\/)[^@/]*@/, '$1***@')
    }
}

export const maskArgs = (args: string[]): string[] => args.map(arg => maskUrl(arg))
