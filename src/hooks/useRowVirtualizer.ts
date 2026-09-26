import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface RowVirtualizer {
    /** Columns the CSS grid currently resolves to. */
    columns: number
    /** First row index to render. */
    startRow: number
    /** Row index just past the rendered range. */
    endRow: number
    rowHeight: number
    gap: number
    totalRows: number
    /** Heights for the spacer above and below the rendered window. */
    paddingTop: number
    paddingBottom: number
}

/** Tailwind's viewport breakpoints, mirroring the grid column classes used by the poster grid. */
const COLUMN_STEPS: Record<'small' | 'medium' | 'large', Array<{ atLeast: number, columns: number }>> = {
    small: [
        { atLeast: 1536, columns: 8 },
        { atLeast: 1280, columns: 7 },
        { atLeast: 1024, columns: 6 },
        { atLeast: 768, columns: 5 },
        { atLeast: 640, columns: 4 },
        { atLeast: 0, columns: 3 }
    ],
    medium: [
        { atLeast: 1280, columns: 6 },
        { atLeast: 1024, columns: 5 },
        { atLeast: 768, columns: 4 },
        { atLeast: 640, columns: 3 },
        { atLeast: 0, columns: 2 }
    ],
    large: [
        { atLeast: 1280, columns: 5 },
        { atLeast: 1024, columns: 4 },
        { atLeast: 768, columns: 3 },
        { atLeast: 640, columns: 2 },
        { atLeast: 0, columns: 1 }
    ]
}

const GAP = 24
const ROWS_OVERSCAN = 3
/** List rows are far shorter than a poster row, so more of them act as buffer. */
const LIST_OVERSCAN = 8
/** Title block under a poster: text line plus its top margin. */
const TITLE_EXTRA_HEIGHT = 36

export const columnsForWidth = (size: 'small' | 'medium' | 'large', viewportWidth: number): number => {
    const step = COLUMN_STEPS[size].find(entry => viewportWidth >= entry.atLeast)
    return step ? step.columns : 4
}

const findScrollParent = (node: HTMLElement | null): HTMLElement | null => {
    let current = node?.parentElement || null
    while (current) {
        const style = window.getComputedStyle(current)
        const scrollable = /(auto|scroll|overlay)/.test(style.overflowY)
        if (scrollable && current.scrollHeight >= current.clientHeight) return current
        current = current.parentElement
    }
    return null
}

export interface ListWindow {
    /** First row index to render. */
    start: number
    /** Row index just past the rendered range. */
    end: number
    paddingTop: number
    paddingBottom: number
}

/**
 * Fixed-pitch windowing for a vertical list that shares the library's scroll container.
 *
 * Unlike the poster grid, these lists sit below other content, so the window is derived from the
 * list's own offset inside the scroller rather than from `scrollTop` alone. The offset is measured
 * on the list element itself, whose padding lives inside its top edge, so windowing cannot feed
 * back into the measurement.
 */
export function useListVirtualizer(
    listRef: React.RefObject<HTMLElement | null>,
    itemCount: number,
    rowPitch: number,
    active = true
): ListWindow {
    const [metrics, setMetrics] = useState({ scrollTop: 0, viewportHeight: window.innerHeight, offsetTop: 0 })
    const scrollParent = useRef<HTMLElement | null>(null)

    useEffect(() => {
        const node = listRef.current
        if (!active || !node) return

        const parent = scrollParent.current = findScrollParent(node)

        const measure = () => {
            if (!parent) {
                setMetrics({ scrollTop: 0, viewportHeight: window.innerHeight, offsetTop: 0 })
                return
            }
            setMetrics({
                scrollTop: parent.scrollTop,
                viewportHeight: parent.clientHeight,
                offsetTop: node.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop
            })
        }

        measure()

        const observer = new ResizeObserver(measure)
        observer.observe(node)
        parent?.addEventListener('scroll', measure, { passive: true })
        window.addEventListener('resize', measure)

        return () => {
            observer.disconnect()
            parent?.removeEventListener('scroll', measure)
            window.removeEventListener('resize', measure)
        }
    }, [listRef, itemCount, active])

    const firstVisible = Math.max(0, Math.floor((metrics.scrollTop - metrics.offsetTop) / rowPitch))
    const visibleRows = Math.ceil(metrics.viewportHeight / rowPitch) + 1
    const start = Math.max(0, firstVisible - LIST_OVERSCAN)
    const end = Math.min(itemCount, firstVisible + visibleRows + LIST_OVERSCAN)

    return {
        start,
        end,
        paddingTop: start * rowPitch,
        paddingBottom: Math.max(0, (itemCount - end) * rowPitch)
    }
}

/**
 * Row windowing for a responsive poster grid: renders only the rows near the viewport so a
 * library of thousands of titles does not mount thousands of nodes.
 */
export function useRowVirtualizer(
    containerRef: React.RefObject<HTMLElement | null>,
    itemCount: number,
    posterSize: 'small' | 'medium' | 'large',
    showTitleBelow: boolean
): RowVirtualizer {
    const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight)
    const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
    const [width, setWidth] = useState(() => containerRef.current?.clientWidth || 0)
    const [scrollTop, setScrollTop] = useState(0)
    const scrollParent = useRef<HTMLElement | null>(null)

    const measure = useCallback(() => {
        const node = containerRef.current
        if (!node) return
        setWidth(node.clientWidth)
        setViewportWidth(window.innerWidth)
        const parent = scrollParent.current
        setScrollTop(parent ? parent.scrollTop : 0)
        setViewportHeight(parent ? parent.clientHeight : window.innerHeight)
    }, [containerRef])

    useEffect(() => {
        const node = containerRef.current
        if (!node) return

        scrollParent.current = findScrollParent(node)
        measure()

        const parent = scrollParent.current
        const onScroll = () => measure()
        const observer = new ResizeObserver(() => measure())
        observer.observe(node)

        parent?.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('resize', measure)

        return () => {
            observer.disconnect()
            parent?.removeEventListener('scroll', onScroll)
            window.removeEventListener('resize', measure)
        }
    }, [containerRef, measure, itemCount])

    const columns = useMemo(
        () => columnsForWidth(posterSize, viewportWidth),
        [posterSize, viewportWidth]
    )

    const rowHeight = useMemo(() => {
        if (columns <= 0 || width <= 0) return 0
        const cardWidth = (width - (columns - 1) * GAP) / columns
        // Posters keep the 2/3 aspect ratio of the grid cell.
        return cardWidth * 1.5 + (showTitleBelow ? TITLE_EXTRA_HEIGHT : 0)
    }, [columns, width, showTitleBelow])

    const totalRows = Math.ceil(itemCount / Math.max(columns, 1))
    const blockHeight = rowHeight + GAP

    const firstVisible = rowHeight > 0 ? Math.floor(scrollTop / blockHeight) : 0
    const visibleRows = rowHeight > 0 ? Math.ceil(viewportHeight / blockHeight) + 1 : 20

    const startRow = Math.max(0, firstVisible - ROWS_OVERSCAN)
    const endRow = Math.min(totalRows, firstVisible + visibleRows + ROWS_OVERSCAN)

    return {
        columns,
        startRow,
        endRow,
        rowHeight,
        gap: GAP,
        totalRows,
        paddingTop: startRow * blockHeight,
        paddingBottom: Math.max(0, (totalRows - endRow) * blockHeight)
    }
}
