# Test coverage

Run `npm test` for the complete suite, including real FFmpeg encoding and decoding.
Run `npm run test:coverage` for Node's built-in coverage report. No desktop session,
network access, actual screen locking, or changes to user settings are required.

The suite covers these critical paths:

| Area | Tests |
| --- | --- |
| Startup, launch flags, migration, idle and battery gates, sleep/lock preview guards, monitor bounds and primary-only display, power events, keyboard dismissal, sunrise/sunset boundaries | `app-lifecycle.test.cjs` |
| Allowed IPC channels, removal of privileged event objects, settings invalidation, converted output gating, format permissions | `preload.test.cjs` |
| Cache deletion safety, pruning, missing and inaccessible files, queue recovery, active downloads, stale location changes, temporary directory cleanup | `cache-maintenance.test.cjs` |
| Download serialization, copy failure cleanup, exclusion rules | `downloads.test.cjs` |
| Source ordering and restrictions, cached playback, cancellation, buffering, source failure cooldown, conversion output reuse and cleanup, actual HEVC conversion | `playback.test.cjs` |
| Serialized conversion requests and queue recovery | `conversion-queue.test.cjs` |
| Transition modes, midpoint behavior, preloading, manual skips, stalls, buffering recovery, frame diagnostics, overlay timers and blanking | `screensaver.test.cjs` |
| Settings snapshots, grouped writes, unchanged values, external changes and mutation isolation | `settings-store.test.cjs` |
| Repeat avoidance, custom videos, time-of-day selection, synchronization, empty playlists | `video-selection.test.cjs` |
| Preview cleanup, font search limits, unnecessary cache I/O | `config-performance.test.cjs` |
| Catalog availability and selection/index preservation | `video-list.test.cjs` |

Main-process and renderer tests run production source in controlled VM contexts
with Electron, DOM, timers and operating-system actions replaced by test doubles.
These verify behavior without opening windows. Node's coverage report currently
counts directly required CommonJS modules (`playback.js`, `settings-store.js`,
`video-sources.js`); it does not measure the VM-loaded app and renderer sections.
Its percentage is **not an application-wide coverage percentage**.

Desktop smoke testing remains necessary for real Electron window focus and
multi-monitor fullscreen behavior, hardware video decoding, actual suspend/lock,
tray/global shortcuts, installer/auto-launch integration and visual layout.
The configuration UI is tested selectively rather than through a full browser
interaction suite. Tests do not contact the update server or download live videos.

If a restricted Windows environment rejects temporary-file renames during FFmpeg
integration tests, use a workspace-local temporary directory in PowerShell:

```powershell
New-Item -ItemType Directory -Force .test-tmp | Out-Null
$env:TEMP = Join-Path (Get-Location) '.test-tmp'
$env:TMP = $env:TEMP
npm test
```

This changes temporary-directory selection only in the current shell session.
