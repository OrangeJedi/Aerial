# Settings definition

`web/config/settings.json` drives the Settings page in `web/config/index.html`.
It describes controls rather than saved user values. The preload bridge supplies
the definition to the renderer. Video controls and Overlay are separate modules.
Defaults are a snapshot of `setUpConfigFile()` in `app.js`; that function remains
authoritative for initializing saved configuration.

The root is an ordered array of sections. Each section has `id`, `name`, and an
ordered `entries` array. Array order defines display order. Each top-level entry
also names its `section`. General Settings is the initial section. Custom Videos
has its own sidebar page, so the settings renderer skips that section. About is
the last section of Settings.

## Entries and storage

- `id`: unique control identifier.
- `key`: exact configuration key; absent for actions and transient information.
- `name`: user-facing label.
- `type`: `checkbox`, `slider`, `number`, `text`, `time`, `select`, `key`,
  `directory`, `list`, `display`, `status`, `action`, or `link`.
- `valueType`: persisted value type. Existing number and ordinary slider inputs
  save strings after editing, even when their initial default is numeric. Filter
  sliders save numbers. The renderer handles both numeric defaults and existing
  numeric strings without changing storage normalization.
- `default` / `defaultSource`: literal initial value or application-provided
  value. Never overwrite an existing user value just by rendering a control.
- `min`, `max`, `step`, `unit`, `resetValue`, `description`: control metadata.
  Numeric bounds are copied only where the existing UI defines them.
- `options`: ordered `{name, value}` choices for a select.
- `handler`: existing operation name, interpreted by the renderer.
  It is not executable code. `settings-controls.js` adapts these names to existing
  IPC operations and confirmation dialogs.

Filter controls bind to the `value` property of the `videoFilters` array item
whose `name` matches `binding.match.name`. Their `group` identifies Filter
Settings. The custom-video list has nested row entries: enablement is membership
of its item ID in `allowedVideos`, editing changes the item's `name`, and removal
uses the existing removal operation. Adding a folder imports video items; the
configuration does not store a separate list of watched folders. Other item
properties are preserved, not exposed as editable settings.

Cache location uses the directory-selection operation, which also handles moving
the cache. Cache size and version are read-only. Update state is transient and
comes from the updater, not configuration. Static About prose and decorative
elements are not settings and are omitted.

## Conditions

A condition is one of:

```json
{"key": "blankScreen", "equals": true}
{"key": "useLocationForSunrise", "equals": false}
{"key": "latitude", "notEquals": ""}
{"key": "transitionType", "in": ["fade", "wipe"]}
{"all": [{"key": "blankScreen", "equals": true}, {"key": "sleepAfterBlank", "equals": true}]}
{"source": "updateStatus", "property": "status", "equals": "ready"}
```

`key` reads a saved setting. `source` reads named runtime data. `all` requires
every child condition. Comparisons are exact; missing values should first resolve
to their configuration defaults. `visibleWhen` hides an entry when false;
`enabledWhen` keeps it visible but disables editing. If absent, the entry is
visible/enabled. Neither condition clears saved values.

`requiresWhenTrue` validates prerequisites when checking a box. Automatic sunrise
and sunset need nonempty latitude and longitude. Its `onRequirementFailure`
records the existing behavior of unchecking the box and showing a message.

`exclusiveWith` lists checkbox IDs that cannot be true together. For the two
multiscreen options, checking either unchecks the other (`uncheckOther`); both
may be false. This is the only enforced exclusive pair in the current Settings
tab. Primary-monitor-only and duplicate avoidance can coexist with either option;
no additional exclusion is inferred.

Transition directions use the first matching `optionSets` condition. The control
is hidden for transitions without direction. An empty or unavailable saved
direction selects the first available option. Runtime language
options combine installed Moment locales and available video locales, deduplicate
them, and sort localized labels, after the static System default option.

## Scope of this snapshot

This definition preserves current behavior rather than proposing new dependencies.
For example, blanking delay, lock delay, skip key, shortcut fields, and cache
checkboxes currently remain visible and editable regardless of their related
enable checkbox. Only the sleep delay, 4k240 preference, original deletion, and
manual sunrise/sunset fields have dependency-based disabling. Transition direction
and updater controls have conditional visibility.

`settings-controls.js` implements the listed control types, bindings, option
providers, conditions, action adapters, shortcut registration, and location updates.
`settings-model.js` contains pure condition and value-binding functions. Config
values still use the existing central settings store and persistence writer.
