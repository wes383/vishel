export const formatMoviePlayTitle = (title: string): string => title

export const formatTvPlayTitle = (
    showTitle: string,
    seasonNumber: number,
    episodeNumber: number,
    episodeName?: string | null
): string => {
    const base = `${showTitle} - S${seasonNumber}E${episodeNumber}`
    const name = (episodeName || '').trim()
    return name ? `${base} - ${name}` : base
}
