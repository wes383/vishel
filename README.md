# Vishel

**Vishel** is a modern media manager. Built with **Electron**, **React**, and **Vite**, it can organize your movies and TV shows, fetches metadata, and lets you play them with external player.

## Key Features

- **Smart Organization**: Automatically sorts Movies & TV Shows with rich metadata from TMDB.
- **Universal Sources**: Supports Local folders, SMB shares (NAS), and WebDAV.
- **External Player**: Plays media in your favorite player (VLC, PotPlayer, mpv) with auto-auth handling.

## Getting Started

### Prerequisites
1.  **Node.js**: Version 18 or higher.
2.  **TMDB API Key**: You need a [TMDB API](https://developer.themoviedb.org/docs/getting-started) to fetch metadata.
3.  **Video Player**: An external video player.

### Installation

1.  **Clone the repository**

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Run in development mode**
    ```bash
    npm run dev
    ```

4.  **Build for production**
    ```bash
    npm run build
    ```

## Configuration Guide

Once the app is running, go to the **Settings** page to set up your environment.

### 1. General Settings
- **TMDB API Key**: Paste your Read Access Token here. This is **required** for the library to work.
- **External Player Path**: Enter the full path to your video player executable.

### 2. Adding Data Sources
Click **"Add Source"** to connect your media folders.

### 3. Scanning
Click **"Scan Library"** in Settings to start indexing your files. Vishel will:
1.  Walk through all configured paths.
2.  Identify video files.
3.  Parse filenames for titles, years, and episode numbers.
4.  Fetch metadata from TMDB.
5.  Populate your library.
