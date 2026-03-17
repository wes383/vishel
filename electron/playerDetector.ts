import { execSync } from 'node:child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

export interface DetectedPlayer {
    name: string
    path: string
}

interface PlayerCandidate {
    name: string
    paths: string[]
}

function getWindowsCandidates(): PlayerCandidate[] {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    const localAppData = process.env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local')

    return [
        {
            name: 'VLC media player',
            paths: [
                path.join(programFiles, 'VideoLAN', 'VLC', 'vlc.exe'),
                path.join(programFilesX86, 'VideoLAN', 'VLC', 'vlc.exe'),
            ]
        },
        {
            name: 'mpv',
            paths: [
                path.join(programFiles, 'mpv', 'mpv.exe'),
                path.join(programFilesX86, 'mpv', 'mpv.exe'),
                path.join(localAppData, 'Programs', 'mpv', 'mpv.exe'),
                // scoop install
                path.join(os.homedir(), 'scoop', 'apps', 'mpv', 'current', 'mpv.exe'),
                path.join(os.homedir(), 'scoop', 'shims', 'mpv.exe'),
            ]
        },
        {
            name: 'mpv.net',
            paths: [
                path.join(programFiles, 'mpv.net', 'mpvnet.exe'),
                path.join(programFilesX86, 'mpv.net', 'mpvnet.exe'),
                path.join(localAppData, 'Programs', 'mpv.net', 'mpvnet.exe'),
                path.join(os.homedir(), 'scoop', 'apps', 'mpv.net', 'current', 'mpvnet.exe'),
            ]
        },
        {
            name: 'PotPlayer',
            paths: [
                path.join(programFiles, 'DAUM', 'PotPlayer', 'PotPlayerMini64.exe'),
                path.join(programFilesX86, 'DAUM', 'PotPlayer', 'PotPlayerMini.exe'),
                path.join(programFiles, 'PotPlayer', 'PotPlayerMini64.exe'),
                path.join(programFilesX86, 'PotPlayer', 'PotPlayerMini.exe'),
            ]
        },
        {
            name: 'MPC-HC',
            paths: [
                path.join(programFiles, 'MPC-HC', 'mpc-hc64.exe'),
                path.join(programFilesX86, 'MPC-HC', 'mpc-hc.exe'),
            ]
        },
        {
            name: 'MPC-BE',
            paths: [
                path.join(programFiles, 'MPC-BE x64', 'mpc-be64.exe'),
                path.join(programFilesX86, 'MPC-BE', 'mpc-be.exe'),
                path.join(programFiles, 'MPC-BE', 'mpc-be64.exe'),
            ]
        },
        {
            name: 'KMPlayer',
            paths: [
                path.join(programFiles, 'KMPlayer', 'KMPlayer.exe'),
                path.join(programFilesX86, 'KMPlayer', 'KMPlayer.exe'),
                path.join(programFiles, 'KMPlayer 64X', 'KMPlayer64.exe'),
            ]
        },
        {
            name: 'GOM Player',
            paths: [
                path.join(programFiles, 'GRETECH', 'GOMPlayer', 'GOM.exe'),
                path.join(programFilesX86, 'GRETECH', 'GOMPlayer', 'GOM.exe'),
            ]
        },
    ]
}

function getMacCandidates(): PlayerCandidate[] {
    return [
        {
            name: 'iina-cli',
            paths: [
                '/usr/local/bin/iina',
                '/opt/homebrew/bin/iina',
                '/Applications/IINA.app/Contents/MacOS/iina-cli',
            ]
        },
        {
            name: 'IINA',
            paths: [
                '/Applications/IINA.app/Contents/MacOS/IINA',
            ]
        },
        {
            name: 'VLC media player',
            paths: [
                '/Applications/VLC.app/Contents/MacOS/VLC',
            ]
        },
        {
            name: 'mpv',
            paths: [
                '/usr/local/bin/mpv',
                '/opt/homebrew/bin/mpv',
            ]
        },
    ]
}

function getLinuxCandidates(): PlayerCandidate[] {
    // On Linux try `which` for common players
    const names = ['vlc', 'mpv', 'celluloid', 'smplayer', 'totem', 'parole', 'dragon']
    return names.map(name => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        paths: [name]
    }))
}

function resolveWhich(cmd: string): string | null {
    try {
        const result = execSync(`which ${cmd}`, { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] })
        const resolved = result.trim()
        if (resolved && fs.existsSync(resolved)) {
            return resolved
        }
    } catch {
    }
    return null
}

function tryRegistryLookup(): DetectedPlayer[] {
    if (process.platform !== 'win32') return []

    const players: DetectedPlayer[] = []
    const regQueries = [
        { name: 'VLC media player', key: 'HKLM\\SOFTWARE\\VideoLAN\\VLC', value: 'InstallDir', exe: 'vlc.exe' },
        { name: 'VLC media player', key: 'HKLM\\SOFTWARE\\WOW6432Node\\VideoLAN\\VLC', value: 'InstallDir', exe: 'vlc.exe' },
        { name: 'PotPlayer', key: 'HKCU\\SOFTWARE\\DAUM\\PotPlayer64', value: 'ProgramPath', exe: null },
        { name: 'PotPlayer', key: 'HKCU\\SOFTWARE\\DAUM\\PotPlayer', value: 'ProgramPath', exe: null },
    ]

    for (const q of regQueries) {
        try {
            const output = execSync(`reg query "${q.key}" /v "${q.value}"`, {
                encoding: 'utf-8',
                timeout: 3000,
                stdio: ['pipe', 'pipe', 'pipe']
            })
            const match = output.match(/REG_SZ\s+(.+)/i)
            if (match) {
                const regValue = match[1].trim()
                const fullPath = q.exe ? path.join(regValue, q.exe) : regValue
                if (fs.existsSync(fullPath)) {
                    if (!players.some(p => p.path.toLowerCase() === fullPath.toLowerCase())) {
                        players.push({ name: q.name, path: fullPath })
                    }
                }
            }
        } catch {
        }
    }

    return players
}

export async function detectPlayers(): Promise<DetectedPlayer[]> {
    const platform = process.platform
    const detected: DetectedPlayer[] = []
    const seenPaths = new Set<string>()

    let candidates: PlayerCandidate[]
    if (platform === 'win32') {
        candidates = getWindowsCandidates()
    } else if (platform === 'darwin') {
        candidates = getMacCandidates()
    } else {
        candidates = getLinuxCandidates()
    }

    // Check file-system candidates
    for (const candidate of candidates) {
        for (const candidatePath of candidate.paths) {
            if (platform === 'linux' && !path.isAbsolute(candidatePath)) {
                // Resolve via `which`
                const resolved = resolveWhich(candidatePath)
                if (resolved) {
                    const key = resolved.toLowerCase()
                    if (!seenPaths.has(key)) {
                        seenPaths.add(key)
                        detected.push({ name: candidate.name, path: resolved })
                    }
                    break
                }
            } else if (fs.existsSync(candidatePath)) {
                const key = candidatePath.toLowerCase()
                if (!seenPaths.has(key)) {
                    seenPaths.add(key)
                    detected.push({ name: candidate.name, path: candidatePath })
                }
                break
            }
        }
    }

    // On Windows, also try registry lookup for additional installs
    if (platform === 'win32') {
        const regPlayers = tryRegistryLookup()
        for (const rp of regPlayers) {
            const key = rp.path.toLowerCase()
            if (!seenPaths.has(key)) {
                seenPaths.add(key)
                detected.push(rp)
            }
        }
    }

    return detected
}
