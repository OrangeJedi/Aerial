# Config app

`index.html` is the Electron config window entry point. `app.js` owns page
navigation, scroll restoration, preview cleanup, and system accent updates.
Light/dark colors follow `prefers-color-scheme`; Electron supplies the Windows
accent on startup and whenever it changes. The app opens to Settings.
Windows 11 22H2 and newer use the native Acrylic backdrop with translucent canvas,
sidebar, and cards. Earlier Windows versions keep the opaque theme. Reduced
transparency and high-contrast preferences also use opaque surfaces.

| Module | Responsibility |
| --- | --- |
| `settings.js` | Ordered scrolling Settings page, About, updater state |
| `settings-controls.js` | JSON control rendering, persistence, action adapters |
| `settings-model.js` | Pure condition, binding, and option rules |
| `video-sidebar.js` | Independently scrolling catalog and selection checkboxes |
| `video-display.js` | Preview, per-video policies, bulk selection, profiles |
| `video-model.js` | Catalog filtering, profile loading, download-policy changes |
| `text-settings.js` | Named overlay list, inline accordion editor with up to four progressive lines, collapsible default font |
| `custom-videos.js` | Folder import, names, selection, removal |
| `fonts.js` | Local font family aliases and fallback handling |
| `shared.js` | DOM helpers, dialogs, locale selection, change notifications |

Each visual area has a matching stylesheet; `app.css` defines shared layout,
theme variables, and common controls. Browser ES modules are used directly,
without a build step. `package.json` also lets Node import pure modules in tests.

`settings.json` is exposed through the existing context-isolated preload bridge;
it is not the user's saved configuration. See
`documentation/settings-definition.md` for the metadata contract. Persisted key
names remain compatible with the existing application. Shared playback and vendor
libraries remain in `web/` because the screensaver uses them too.
