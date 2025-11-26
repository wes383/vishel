import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import https from 'node:https'
import fs from 'node:fs'
import zlib from 'node:zlib'
import { pipeline } from 'node:stream/promises'

const DB_PATH = path.join(app.getPath('userData'), 'imdb-ratings.db')
const TSV_URL = 'https://datasets.imdbws.com/title.ratings.tsv.gz'

let dbInstance: Database.Database | null = null

interface ImdbRating {
    imdbId: string
    rating: number
    votes: number
}

export const getImdbDb = (): Database.Database => {
    if (!dbInstance) {
        dbInstance = new Database(DB_PATH)
        dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS imdb_ratings (
                imdb_id TEXT PRIMARY KEY,
                rating REAL NOT NULL,
                votes INTEGER NOT NULL
            );

        `)
    }
    return dbInstance
}

export const getImdbRating = (imdbId: string): ImdbRating | null => {
    try {
        const db = getImdbDb()
        const stmt = db.prepare('SELECT rating, votes FROM imdb_ratings WHERE imdb_id = ?')
        const row = stmt.get(imdbId) as { rating: number; votes: number } | undefined

        if (row) {
            return {
                imdbId,
                rating: row.rating,
                votes: row.votes
            }
        }
        return null
    } catch (error) {
        console.error(`Error querying IMDb rating for ${imdbId}:`, error)
        return null
    }
}

export const getImdbDbStatus = (): { exists: boolean; count: number; lastUpdated?: Date } => {
    try {
        if (!fs.existsSync(DB_PATH)) {
            return { exists: false, count: 0 }
        }

        const db = getImdbDb()
        const countResult = db.prepare('SELECT COUNT(*) as count FROM imdb_ratings').get() as { count: number }
        const stats = fs.statSync(DB_PATH)

        return {
            exists: true,
            count: countResult.count,
            lastUpdated: stats.mtime
        }
    } catch (error) {
        console.error('Error getting IMDb database status:', error)
        return { exists: false, count: 0 }
    }
}

export const downloadAndImportImdbRatings = async (
    onProgress?: (data: { stage: string; progress: number; total?: number }) => void,
    filterIds?: string[]
): Promise<void> => {
    const tempGzPath = path.join(app.getPath('temp'), 'title.ratings.tsv.gz')
    const tempTsvPath = path.join(app.getPath('temp'), 'title.ratings.tsv')
    const filterSet = filterIds ? new Set(filterIds) : null

    try {
        onProgress?.({ stage: 'downloading', progress: 0 })

        await new Promise<void>((resolve, reject) => {
            const file = fs.createWriteStream(tempGzPath)
            https.get(TSV_URL, (response) => {
                const totalSize = parseInt(response.headers['content-length'] || '0', 10)
                let downloadedSize = 0

                response.on('data', (chunk) => {
                    downloadedSize += chunk.length
                    if (totalSize > 0) {
                        onProgress?.({
                            stage: 'downloading',
                            progress: downloadedSize,
                            total: totalSize
                        })
                    }
                })

                response.pipe(file)
                file.on('finish', () => {
                    file.close()
                    resolve()
                })
            }).on('error', (err) => {
                fs.unlinkSync(tempGzPath)
                reject(err)
            })
        })

        onProgress?.({ stage: 'decompressing', progress: 0 })

        const gzipStream = fs.createReadStream(tempGzPath)
        const gunzipStream = zlib.createGunzip()
        const outputStream = fs.createWriteStream(tempTsvPath)

        await pipeline(gzipStream, gunzipStream, outputStream)

        onProgress?.({ stage: 'importing', progress: 0 })

        const db = getImdbDb()

        db.exec('DELETE FROM imdb_ratings')

        const insert = db.prepare('INSERT OR REPLACE INTO imdb_ratings (imdb_id, rating, votes) VALUES (?, ?, ?)')

        const fileContent = fs.readFileSync(tempTsvPath, 'utf-8')
        const lines = fileContent.split('\n')

        const insertMany = db.transaction((ratings: Array<[string, number, number]>) => {
            for (const rating of ratings) {
                insert.run(rating)
            }
        })

        const batchSize = 10000
        let batch: Array<[string, number, number]> = []
        let processedLines = 0

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim()
            if (!line) continue

            const parts = line.split('\t')
            if (parts.length === 3) {
                const [imdbId, ratingStr, votesStr] = parts

                if (filterSet && !filterSet.has(imdbId)) {
                    continue
                }

                const rating = parseFloat(ratingStr)
                const votes = parseInt(votesStr, 10)

                if (imdbId && !isNaN(rating) && !isNaN(votes)) {
                    batch.push([imdbId, rating, votes])
                }

                if (batch.length >= batchSize) {
                    insertMany(batch)
                    processedLines += batch.length
                    batch = []
                    onProgress?.({
                        stage: 'importing',
                        progress: processedLines,
                        total: lines.length - 1
                    })
                    await new Promise(resolve => setTimeout(resolve, 0))
                }
            }
        }

        if (batch.length > 0) {
            insertMany(batch)
            processedLines += batch.length
        }

        onProgress?.({ stage: 'complete', progress: processedLines, total: processedLines })

        if (fs.existsSync(tempGzPath)) fs.unlinkSync(tempGzPath)
        if (fs.existsSync(tempTsvPath)) fs.unlinkSync(tempTsvPath)

        console.log(`Successfully imported ${processedLines} IMDb ratings`)
    } catch (error) {
        if (fs.existsSync(tempGzPath)) fs.unlinkSync(tempGzPath)
        if (fs.existsSync(tempTsvPath)) fs.unlinkSync(tempTsvPath)
        throw error
    }
}

export const closeImdbDb = (): void => {
    if (dbInstance) {
        dbInstance.close()
        dbInstance = null
    }
}
