# Video translations

These files contain video information for 152 videos in 33 languages (43 regional locales). They are bundled with Aerial and work offline. `locales.json` lists the available sets. Each locale file is an object keyed by the existing IDs in `videos.json`:

```json
{
  "B876B645-3955-420E-99DF-60139E451CF3": {
    "name": "Montagnes de Chine",
    "group": "Chine",
    "pointsOfInterest": {
      "0": "Traversée du parc national de Wulingyuan en Chine"
    }
  }
}
```

`pointsOfInterest` keys are seconds in the video. Use the same timestamps as `en.json`. The English file retains all 398 existing captions, including the four approved Sonoma corrections and nine descriptive fallbacks. For every English regional choice, Aerial uses the preferred names and groups from `videos.json` and captions from `en.json`. Other locales use Apple's full localized titles, localized group labels, and captions, falling back to English per missing field or timestamp. Custom videos and user-entered text are unchanged. The India group does not exist in Apple's categories, so its display name comes from `Intl.DisplayNames` for region `IN`; a manually supplied `group` overrides that fallback.

The existing `dateTimeLanguage` preference now controls all of these displays through the **Display language** selector. It still supports the date library's additional languages. Unsupported video languages fall back to English. Norwegian `nb`/`nn` map to Apple's `no`; Chinese script variants resolve to the appropriate simplified/traditional locale. Video IDs, media sources, selection order, and saved selections do not change.

## Importing Apple translations

Use Python 3 and its standard library; no extra packages are required. From the project root:

```powershell
python tools/import-localizations.py --archives .test-tmp/apple-catalogs --download
```

For already downloaded archives:

```powershell
python tools/import-localizations.py --archives .test-tmp/catalog-audit
```

The importer lists its ten source archives in `tools/import-localizations.py`, with newer macOS and tvOS resources taking precedence for available Apple strings. It reads both binary/text `.strings` files and the macOS `.loctable` directly from the archives without extracting files. It matches videos by ID, then by exact media URL, and follows every matched Apple ID through all catalog revisions. It does not modify `videos.json` or add catalog entries.

**Imports only fill empty fields.** Existing nonempty names, groups, and individual captions always win, including manually supplied gap translations. To deliberately refresh a particular imported translation, clear that field and rerun. Do not clear English captions unless intending to replace the preferred English text. An import also preserves manually added locales listed in `locales.json`.

`import-report.json` records Apple source gaps separately from gaps still unfilled after preserving manual entries. The importer also prints the missing fields and affected locales. An English fallback shown in the app does not count as a completed translation. Identical text across languages is retained when Apple publishes it; names of places can legitimately be identical.

The report and locale data can be regenerated with the commands above. Committed English data supplies preferred fallback captions when importing into another output directory via `--output`. Future videos with no Apple or manually supplied caption are reported as missing `pointsOfInterest`, even when no timestamp is known.

## Supplemental caption translations

All 152 video names and all caption timestamps now have text in every locale. Apple supplies the video names. For the following nine videos, Apple supplies no timed captions; Aerial supplies translations of the existing English descriptions at timestamp `0` in all 37 non-English locales (32 languages). These supplemental captions were translated for Aerial and are not Apple-provided text. English remains unchanged.

| Group | Video | Original English caption | Video ID |
|---|---|---|---|
| Iceland | Lake | Flying over Iceland | `cb5b5035-6701-619f-9065-3d7d0e5fbef4-113` |
| Sequoia | Sunrise | In Sequoia National Park at sunrise | `cb5b5035-6701-619f-9065-3d7d0e5fbef4-144` |
| Sequoia | Morning | In Sequoia National Park in the morning | `cb5b5035-6701-619f-9065-3d7d0e5fbef4-145` |
| Sequoia | Night | In Sequoia National Park at night | `cb5b5035-6701-619f-9065-3d7d0e5fbef4-146` |
| Sonoma | Evening | Flying over Sonoma, California | `ecebc8d2-5486-c2b2-52ae-6f0ab2d6b65f-126` |
| Tahoe | Morning | Lake Tahoe in the morning | `cb5b5035-6701-619f-9065-3d7d0e5fbef4-147` |
| Tahoe | Day | Lake Tahoe during the day | `cb5b5035-6701-619f-9065-3d7d0e5fbef4-148` |
| Tahoe | Evening | Lake Tahoe in the evening | `cb5b5035-6701-619f-9065-3d7d0e5fbef4-149` |
| Tahoe | Night | Lake Tahoe at night | `cb5b5035-6701-619f-9065-3d7d0e5fbef4-150` |

The supplemented locales are `ar`, `ca`, `cs`, `da`, `de`, `el`, `es`, `es-419`, `fi`, `fr`, `fr-CA`, `he`, `hi`, `hr`, `hu`, `id`, `it`, `ja`, `ko`, `ms`, `nl`, `no`, `pl`, `pt-BR`, `pt-PT`, `ro`, `ru`, `sk`, `sl`, `sv`, `th`, `tr`, `uk`, `vi`, `zh-CN`, `zh-HK`, and `zh-TW`.

The importer preserves these supplemental captions and continues to report the 333 Apple source gaps, while `remainingGaps` is empty. To revise a translation, edit its video's `pointsOfInterest` object in the appropriate locale file; imports preserve the edit.

The 33 languages, including the original English, are Arabic, Catalan, Chinese, Croatian, Czech, Danish, Dutch, English, Finnish, French, German, Greek, Hebrew, Hindi, Hungarian, Indonesian, Italian, Japanese, Korean, Malay, Norwegian, Polish, Portuguese, Romanian, Russian, Slovak, Slovenian, Spanish, Swedish, Thai, Turkish, Ukrainian, and Vietnamese. Regional variants account for the 43 locale files.

## Installer size estimate

For version 1.4.2, the existing combined x64/ARM64 installer without localization files is 319,920,884 bytes (319.9 MB). All 43 runtime locale sets total 2,339,356 bytes before compression, compared with 48,717 bytes for English only. LZMA compression against the existing application archive estimates an additional 233,446 bytes per architecture, or about 466,892 bytes for the combined installer. That puts an equivalent installer with all languages at approximately 320.4 MB, versus 319.9 MB without the additional language sets.

These are estimates using decimal MB, not two rebuilt installers. The calculation measures the language data's compression impact; other code changes, build metadata, and NSIS archive layout may shift the final size. The English caption file remains necessary in an English-only build. Installed language data adds approximately 2.3 MB relative to English only; it does not add video downloads.

## Validation

```powershell
npm test
python tests/import_localizations_test.py
```

The Node tests cover English compatibility, all locale files, regional/script fallback, partial translations, custom video preservation, UI rendering, and source/ID stability. The Python tests use small synthetic Apple archives to verify ID aliases, multiple catalog revisions, Unicode parsing, manual gap preservation, source-gap reporting, and repeatable imports without network access.
