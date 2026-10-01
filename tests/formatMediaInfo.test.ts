import { describe, expect, it } from 'vitest'
import { displayPoster } from '../src/utils/formatMediaInfo'

describe('displayPoster', () => {
    const media = { posterPath: '/zh.jpg', posterPathEn: '/en.jpg' }

    it('prefers the English poster under a Chinese UI, including when never touched', () => {
        expect(displayPoster(media, { language: 'zh' })).toBe('/en.jpg')
        expect(displayPoster(media, { language: 'zh', preferEnglishPoster: true })).toBe('/en.jpg')
    })

    it('shows the localized poster when the preference is off or the UI is English', () => {
        expect(displayPoster(media, { language: 'zh', preferEnglishPoster: false })).toBe('/zh.jpg')
        expect(displayPoster(media, { language: 'en' })).toBe('/zh.jpg')
    })

    it('falls back to the localized poster - a grid cell cannot fall back to text', () => {
        expect(displayPoster({ posterPath: '/zh.jpg' }, { language: 'zh' })).toBe('/zh.jpg')
    })

    it('reads the localized poster while settings are still loading', () => {
        expect(displayPoster(media, null)).toBe('/zh.jpg')
        expect(displayPoster(media, undefined)).toBe('/zh.jpg')
    })
})
