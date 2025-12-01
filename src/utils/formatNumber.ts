export function formatVoteCount(count: number): string {
    if (count < 1000) {
        return count.toString()
    } else if (count < 10000) {
        const k = count / 1000
        return `${k.toFixed(1)}K`
    } else if (count < 1000000) {
        const k = Math.round(count / 1000)
        return `${k}K`
    } else {
        const m = count / 1000000
        return `${m.toFixed(1)}M`
    }
}
