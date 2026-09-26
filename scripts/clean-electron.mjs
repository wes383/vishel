import { rmSync } from 'node:fs'

// vite-plugin-electron pins build.emptyOutDir to false for both the main and the preload build,
// and it runs them into the same dist-electron folder - so neither can be given a true value
// without the second build erasing the first. Every main-process rebuild instead emits a fresh
// set of hashed chunks and leaves the previous set in place: the live graph is ~6 files, the
// folder had grown to 1156 and 358MB. electron-builder ships the folder by name, so all of it
// travelled into the installer.
rmSync('dist-electron', { recursive: true, force: true })
