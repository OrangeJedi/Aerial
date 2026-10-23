# Temporary video classifier

The next six frames preload in the background, with up to three extractions running at once. The current video moves ahead of waiting background work, and duplicate requests share the same extraction. Downloaded frames remain cached between sessions.

Run `npm run classify` from the repository root. Requires the installed project dependencies and internet access to the video sources.

The app starts with untagged videos. Choose **Day**, **Night**, or **Twilight** using the buttons or keys **1**, **2**, **3**. Each choice immediately saves to the repository's `videos.json`, then advances. Close at any time; reopening builds a fresh queue from remaining untagged videos. **All videos** lets you revise existing classifications. **Previous** revisits your last choice in the current queue; **Skip / Next** leaves a video unchanged.

FFmpeg extracts the first decoded frame, preferring the H.264 source. Frames are cached in the ignored `.classifier-frames` folder. Failed sources fall back to other qualities; errors can be retried or skipped. No full video download is intentionally retained. The app never assigns tags automatically.

Playback treats the 30 minutes before and after each configured sunrise and sunset as twilight. Other daylight hours use day; remaining hours use night. Untagged videos remain available as a fallback when a period has few tagged videos.

After classification, review the `videos.json` diff. The app writes through a temporary file to avoid partially written JSON and rereads the catalog for each save to preserve unrelated edits. Remove `tools/classifier`, the `classify` npm script, and `.classifier-frames` when the temporary tool is no longer needed.
