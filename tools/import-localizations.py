"""Import Apple aerial strings without overwriting existing translations (Python 3)."""
import argparse
import json
import pathlib
import plistlib
import re
import tarfile
import urllib.request

PROJECT = pathlib.Path(__file__).resolve().parent.parent
ARCHIVES = [
    'resources.tar', 'resources-13.tar', 'resources-15.tar', 'resources-16.tar',
    'resources-14-0.tar', 'resources-14-0-10.tar', 'resources-14-1-0.tar',
    'resources-15-0-2.tar', 'resources-26-4-1.tar', 'resources-atv-23J-2.tar'
]
MAC_BASE = 'https://sylvan.apple.com/itunes-assets/Aerials126/v4/82/2e/34/822e344c-f5d2-878c-3d56-508d5b09ed61/'
GROUP_KEYS = {
    'ISS (Space)': 'AerialCategorySpace', 'Undersea': 'AerialCategoryUnderwater',
    'New York City': 'AerialSubcategoryCitiesNewYork'
}


def load_json(path, default):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def read_strings(raw):
    try:
        return plistlib.loads(raw)
    except plistlib.InvalidFileException:
        text = raw.decode('utf-16' if raw.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8-sig')
        pairs = re.findall(r'"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;', text)
        def unescape(value):
            value = re.sub(r'\\U([0-9a-fA-F]{4})', lambda match: chr(int(match[1], 16)), value)
            return value.replace('\\"', '"').replace('\\n', '\n').replace('\\\\', '\\')
        if not pairs:
            raise ValueError('Unrecognized Apple .strings file')
        return {unescape(key): unescape(value) for key, value in pairs}


def normalize(locale):
    return locale.replace('_', '-')


def read_archives(directory):
    assets = {}
    strings = {}
    inventory = []
    for name in ARCHIVES:
        path = directory / name
        if not path.exists():
            raise FileNotFoundError(f'Missing {path}; provide all archives or use --download')
        with tarfile.open(path) as archive:
            members = [member for member in archive.getmembers() if not any(part.startswith('._') for part in member.name.split('/'))]
            entries = next(member for member in members if member.name.lstrip('./') == 'entries.json')
            catalog = json.load(archive.extractfile(entries))
            for asset in catalog['assets']:
                assets.setdefault(asset['id'], []).append(asset)
            for member in members:
                if member.name.endswith('/Localizable.nocache.loctable'):
                    table = plistlib.loads(archive.extractfile(member).read())
                    for locale, values in table.items():
                        if locale != 'LocProvenance' and isinstance(values, dict):
                            strings.setdefault(normalize(locale), {}).update(values)
                elif member.name.endswith('.strings'):
                    locale = next((part[:-6] for part in member.name.split('/') if part.endswith('.lproj')), None)
                    if locale:
                        strings.setdefault(normalize(locale), {}).update(read_strings(archive.extractfile(member).read()))
            inventory.append({'file': name, 'assets': len(catalog['assets'])})
    # Old catalogs called Brazilian Portuguese simply pt.
    for key, value in strings.pop('pt', {}).items():
        strings.setdefault('pt-BR', {}).setdefault(key, value)
    return assets, strings, inventory


def has_text(value):
    return isinstance(value, str) and bool(value.strip())


def fill(target, key, value):
    if not has_text(target.get(key)) and has_text(value):
        target[key] = value


def import_localizations(videos_path, archive_dir, output):
    videos = load_json(videos_path, [])
    assets, tables, inventory = read_archives(archive_dir)
    output.mkdir(parents=True, exist_ok=True)
    locales = sorted(set(tables) | set(load_json(output / 'locales.json', [])))
    if any(not re.fullmatch(r'[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*', locale) for locale in locales):
        raise ValueError('Invalid locale identifier')
    packs = {locale: load_json(output / f'{locale}.json', {}) for locale in locales}
    english = packs['en']
    preferred_english = load_json(PROJECT / 'localized/en.json', {})
    matches = {}
    for video in videos:
        current = english.setdefault(video['id'], {})
        fill(current, 'name', video.get('name'))
        fill(current, 'group', video.get('accessibilityLabel'))
        pois = current.setdefault('pointsOfInterest', {})
        for timestamp, caption in video.get('pointsOfInterest', {}).items():
            fill(pois, timestamp, caption)
        for timestamp, caption in preferred_english.get(video['id'], {}).get('pointsOfInterest', {}).items():
            fill(pois, timestamp, caption)
        ids = [video['id']] if video['id'] in assets else []
        if not ids:
            urls = set(video.get('src', {}).values())
            ids = [asset_id for asset_id, versions in assets.items() if any(
                urls.intersection(value for key, value in asset.items() if key.startswith('url-') and isinstance(value, str))
                for asset in versions)]
        matches[video['id']] = [asset for asset_id in ids for asset in assets[asset_id]]

    source_gaps = []
    remaining = []
    for video in videos:
        video_id = video['id']
        versions = matches[video_id]
        name_key = next((asset['localizedNameKey'] for asset in reversed(versions) if asset.get('localizedNameKey')), None)
        poi_keys = {}
        for asset in versions:
            poi_keys.update(asset.get('pointsOfInterest', {}))
        for timestamp, key in poi_keys.items():
            fill(english[video_id]['pointsOfInterest'], timestamp, tables['en'].get(key))
        label = video.get('accessibilityLabel', '')
        group_key = GROUP_KEYS.get(label)
        if not group_key:
            group_key = next((key for key, value in tables['en'].items() if value == label and key.startswith('AerialSubcategory') and 'Description' not in key), None)
        for locale in locales:
            pack = packs[locale].setdefault(video_id, {})
            # Keep all English variants identical to the preferred English text.
            if locale.split('-')[0] == 'en':
                for field in ['name', 'group']:
                    fill(pack, field, english[video_id].get(field))
                for timestamp, caption in english[video_id]['pointsOfInterest'].items():
                    fill(pack.setdefault('pointsOfInterest', {}), timestamp, caption)
                if not english[video_id]['pointsOfInterest']:
                    detail = {'id': video_id, 'group': label, 'name': video.get('name'), 'locale': locale, 'fields': ['pointsOfInterest']}
                    source_gaps.append(detail)
                    remaining.append(detail)
                continue
            table = tables.get(locale, {})
            missing_source = []
            missing_result = []
            for field, key in [('name', name_key), ('group', group_key)]:
                # India is Aerial's own grouping; translated at runtime via Intl region names.
                if field == 'group' and label == 'India':
                    continue
                value = table.get(key)
                fill(pack, field, value)
                if not has_text(value):
                    missing_source.append(field)
                if not has_text(pack.get(field)):
                    missing_result.append(field)
            for timestamp in english[video_id]['pointsOfInterest']:
                value = table.get(poi_keys.get(timestamp))
                fill(pack.setdefault('pointsOfInterest', {}), timestamp, value)
                if not has_text(value):
                    missing_source.append(f'pointsOfInterest.{timestamp}')
                if not has_text(pack.get('pointsOfInterest', {}).get(timestamp)):
                    missing_result.append(f'pointsOfInterest.{timestamp}')
            if not english[video_id]['pointsOfInterest'] and not poi_keys:
                missing_source.append('pointsOfInterest')
                if not pack.get('pointsOfInterest'):
                    missing_result.append('pointsOfInterest')
            detail = {'id': video_id, 'group': label, 'name': video.get('name'), 'locale': locale}
            if missing_source:
                source_gaps.append({**detail, 'fields': missing_source})
            if missing_result:
                remaining.append({**detail, 'fields': missing_result})
    for locale, pack in packs.items():
        write_json(output / f'{locale}.json', pack)
    write_json(output / 'locales.json', locales)
    report = {'catalogs': inventory, 'videos': len(videos), 'locales': locales,
              'sourceGaps': source_gaps, 'remainingGaps': remaining}
    write_json(output / 'import-report.json', report)
    print(f'Imported {len(videos)} videos into {len(locales)} locale files. Existing nonempty text preserved.')
    print(f'Apple source gaps: {len(source_gaps)} video/locale combinations; remaining: {len(remaining)}.')
    grouped = {}
    for gap in remaining:
        key = (gap['id'], gap['group'], gap['name'], tuple(gap['fields']))
        grouped.setdefault(key, []).append(gap['locale'])
    for (video_id, group, name, fields), missing_locales in grouped.items():
        print(f"GAP {group} / {name} ({video_id}): {', '.join(fields)}; locales: {', '.join(missing_locales)}")
    filled = [gap for gap in source_gaps if not any(result['id'] == gap['id'] and result['locale'] == gap['locale'] for result in remaining)]
    for gap in filled:
        print(f"SOURCE GAP (existing text retained) {gap['locale']} {gap['id']}: {', '.join(gap['fields'])}")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archives', type=pathlib.Path, required=True, help='Directory containing the ten Apple tar archives')
    parser.add_argument('--videos', type=pathlib.Path, default=PROJECT / 'videos.json')
    parser.add_argument('--output', type=pathlib.Path, default=PROJECT / 'localized')
    parser.add_argument('--download', action='store_true', help='Download missing public archives using TLS verification')
    args = parser.parse_args()
    if args.download:
        args.archives.mkdir(parents=True, exist_ok=True)
        for name in ARCHIVES:
            path = args.archives / name
            if not path.exists():
                base = MAC_BASE if name in ARCHIVES[4:9] else 'https://sylvan.apple.com/Aerials/'
                print(f'Downloading {name}')
                with urllib.request.urlopen(base + name, timeout=90) as response:
                    path.write_bytes(response.read())
    import_localizations(args.videos, args.archives, args.output)


if __name__ == '__main__':
    main()
