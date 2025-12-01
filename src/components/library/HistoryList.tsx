import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { HistoryItem } from '../../types/library'

interface HistoryListProps {
    items: HistoryItem[]
    onDelete: (id: string) => void
    emptyMessage?: React.ReactNode
}

export const HistoryList: React.FC<HistoryListProps> = ({ items, onDelete, emptyMessage }) => {
    const navigate = useNavigate()

    if (items.length === 0) {
        return (
            <div className="text-center text-gray-400 mt-20">
                {emptyMessage || <p>No history found</p>}
            </div>
        )
    }

    return (
        <div className="space-y-2">
            {items.map(item => (
                <div
                    key={item.id}
                    className="group bg-neutral-800 rounded-xl overflow-hidden hover:bg-neutral-700 transition-colors"
                >
                    <div className="flex items-center gap-4 p-3">
                        {/* Poster */}
                        <div
                            className="flex-shrink-0 w-16 h-24 rounded-lg overflow-hidden cursor-pointer bg-neutral-700"
                            onClick={() => navigate(item.mediaType === 'movie' ? `/movie/${item.mediaId}` : `/tv/${item.mediaId}`)}
                        >
                            {item.posterPath ? (
                                <img
                                    src={`https://image.tmdb.org/t/p/w200${item.posterPath}`}
                                    alt={item.title}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-neutral-500 text-xs">
                                    No Poster
                                </div>
                            )}
                        </div>

                        {/* Info */}
                        <div
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => navigate(item.mediaType === 'movie' ? `/movie/${item.mediaId}` : `/tv/${item.mediaId}`)}
                        >
                            <h3 className="font-semibold text-white text-base truncate">{item.title}</h3>
                            <div className="flex items-center gap-2 mt-1 text-sm text-gray-400">
                                {item.mediaType === 'tv' && item.seasonNumber && item.episodeNumber && (
                                    <>
                                        <span>S{item.seasonNumber}E{item.episodeNumber}</span>
                                        {item.episodeName && (
                                            <>
                                                <span>·</span>
                                                <span className="truncate">{item.episodeName}</span>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                {new Date(item.timestamp).toLocaleString()}
                            </p>
                        </div>

                        {/* Delete button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                onDelete(item.id)
                            }}
                            className="flex-shrink-0 p-2 mr-2 rounded-full text-gray-400 hover:bg-red-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    )
}
