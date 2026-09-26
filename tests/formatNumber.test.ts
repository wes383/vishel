import { describe, expect, it } from 'vitest'
import { formatVoteCount } from '../src/utils/formatNumber'

describe('formatVoteCount', () => {
    it('leaves counts below one thousand untouched', () => {
        expect(formatVoteCount(0)).toBe('0')
        expect(formatVoteCount(999)).toBe('999')
    })

    it('uses one decimal between one and ten thousand', () => {
        expect(formatVoteCount(1000)).toBe('1.0K')
        expect(formatVoteCount(1234)).toBe('1.2K')
        expect(formatVoteCount(9999)).toBe('10.0K')
    })

    it('rounds to whole thousands above ten thousand', () => {
        expect(formatVoteCount(10000)).toBe('10K')
        expect(formatVoteCount(45678)).toBe('46K')
        expect(formatVoteCount(999999)).toBe('1000K')
    })

    it('switches to millions at one million', () => {
        expect(formatVoteCount(1000000)).toBe('1.0M')
        expect(formatVoteCount(2345678)).toBe('2.3M')
    })
})
