import React from 'react'
import { useNavigate } from 'react-router-dom'
import { LazyImage } from '../LazyImage'
import { CombinedItem, Movie, TVShow } from '../../types/library'

interface MediaGridProps {
    items: CombinedItem[] | Movie[] | TVShow[]
    showTitlesOnPosters: boolean
    emptyMessage?: React.ReactNode
    type?: 'combined' | 'movie' | 'tv'
}

export const MediaGrid: React.FC<MediaGridProps> = ({ items, showTitlesOnPosters, emptyMessage, type = 'combined' }) => {
    const navigate = useNavigate()

    if (items.length === 0) {
        return (
            <div className="text-center text-gray-400 mt-20">
                {emptyMessage || <p>No content found</p>}
            </div>
        )
    }

    const getItemTitle = (item: any) => {
        if ('title' in item) return item.title
        if ('name' in item) return item.name
        return ''
    }

    const getItemType = (item: any) => {
        if ('type' in item) return item.type
        if (type === 'movie') return 'movie'
        if (type === 'tv') return 'tv'
        return 'movie'
    }

    const handleNavigate = (item: any) => {
        const itemType = getItemType(item)
        if (itemType === 'movie') {
            navigate(`/movie/${item.id}`)
        } else {
            navigate(`/tv/${item.id}`)
        }
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {items.map((item: any) => {
                const title = getItemTitle(item)
                const itemType = getItemType(item)
                const key = `${itemType}-${item.id}`

                return (
                    <div key={key} className="group">
                        <div className={`relative rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ${showTitlesOnPosters ? 'group-hover:-translate-y-1' : ''}`}>
                            <div
                                onClick={() => handleNavigate(item)}
                                className="aspect-[2/3] relative cursor-pointer bg-neutral-800"
                            >
                                {item.posterPath ? (
                                    <LazyImage
                                        src={`https://image.tmdb.org/t/p/w500${item.posterPath}`}
                                        alt={title}
                                        className={`w-full h-full object-cover ${showTitlesOnPosters ? '' : 'group-hover:blur-sm'}`}
                                        placeholderClassName="w-full h-full"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-neutral-700 text-neutral-500">
                                        No Poster
                                    </div>
                                )}
                                {!showTitlesOnPosters && (
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all duration-300 delay-[50ms] flex items-center justify-center p-4 opacity-0 group-hover:opacity-100">
                                        <h3 className="font-medium text-white text-center text-lg font-['Inter']">
                                            {title}
                                        </h3>
                                    </div>
                                )}
                            </div>
                        </div>
                        {showTitlesOnPosters && (
                            <div
                                onClick={() => handleNavigate(item)}
                                className="mt-2 cursor-pointer transition-transform duration-300 group-hover:-translate-y-1"
                            >
                                <h3 className="font-medium text-white text-base text-center px-1 font-['Inter']">
                                    {title}
                                </h3>
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
