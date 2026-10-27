import contextlib
import importlib.util
import io
import json
import pathlib
import plistlib
import tarfile
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('import_localizations', pathlib.Path(__file__).resolve().parents[1] / 'tools/import-localizations.py')
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)


class ImportTests(unittest.TestCase):
    def fixture(self, directory):
        archives = directory / 'archives'
        archives.mkdir()
        videos = directory / 'videos.json'
        IMPORTER.write_json(videos, [{'id': 'local', 'name': 'Preferred name', 'accessibilityLabel': 'China',
                                     'src': {'H2654k': 'https://example.com/old.mov'},
                                     'pointsOfInterest': {'0': 'Preferred English', '15': 'Our fallback'}}])
        for index, filename in enumerate(IMPORTER.ARCHIVES):
            asset = {'id': 'apple', 'pointsOfInterest': {'0': 'CAPTION'},
                     'url-4K-SDR': 'https://example.com/old.mov' if index == 0 else 'https://example.com/new.mov'}
            if index:
                asset['localizedNameKey'] = 'TITLE'
            files = {'./entries.json': json.dumps({'assets': [asset]}).encode(),
                     'TVIdleScreenStrings.bundle/en.lproj/Localizable.nocache.strings': plistlib.dumps({
                         'TITLE': 'Apple name', 'CAPTION': 'Apple English', 'AerialSubcategoryChina': 'China'}, fmt=plistlib.FMT_BINARY),
                     'TVIdleScreenStrings.bundle/fr.lproj/Localizable.nocache.strings': plistlib.dumps({
                         'TITLE': 'Nom Apple', 'CAPTION': 'Légende Apple', 'AerialSubcategoryChina': 'Chine'}, fmt=plistlib.FMT_BINARY)}
            with tarfile.open(archives / filename, 'w') as archive:
                for name, data in files.items():
                    member = tarfile.TarInfo(name)
                    member.size = len(data)
                    archive.addfile(member, io.BytesIO(data))
        return videos, archives, directory / 'localized'

    def run_import(self, videos, archives, output):
        with contextlib.redirect_stdout(io.StringIO()):
            return IMPORTER.import_localizations(videos, archives, output)

    def test_id_aliases_follow_newer_catalogs_and_english_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            videos, archives, output = self.fixture(pathlib.Path(temp))
            report = self.run_import(videos, archives, output)
            english = IMPORTER.load_json(output / 'en.json', {})['local']
            french = IMPORTER.load_json(output / 'fr.json', {})['local']
            self.assertEqual(english['name'], 'Preferred name')
            self.assertEqual(english['pointsOfInterest'], {'0': 'Preferred English', '15': 'Our fallback'})
            self.assertEqual(french['name'], 'Nom Apple')
            self.assertEqual(french['pointsOfInterest']['0'], 'Légende Apple')
            self.assertEqual(report['remainingGaps'][0]['fields'], ['pointsOfInterest.15'])
            self.assertEqual(report['remainingGaps'][0]['locale'], 'fr')

    def test_manual_gap_fills_survive_reimport_and_source_gaps_still_log(self):
        with tempfile.TemporaryDirectory() as temp:
            videos, archives, output = self.fixture(pathlib.Path(temp))
            self.run_import(videos, archives, output)
            french = IMPORTER.load_json(output / 'fr.json', {})
            french['local']['name'] = 'Our manual title'
            french['local']['pointsOfInterest']['15'] = 'Our manual gap fill'
            IMPORTER.write_json(output / 'fr.json', french)
            catalog = IMPORTER.load_json(videos, [])
            del catalog[0]['pointsOfInterest']
            IMPORTER.write_json(videos, catalog)
            report = self.run_import(videos, archives, output)
            self.assertEqual(IMPORTER.load_json(output / 'fr.json', {}), french)
            self.assertEqual(report['remainingGaps'], [])
            self.assertEqual(report['sourceGaps'][0]['fields'], ['pointsOfInterest.15'])
            first = {path.name: path.read_bytes() for path in output.glob('*.json')}
            self.run_import(videos, archives, output)
            self.assertEqual(first, {path.name: path.read_bytes() for path in output.glob('*.json')})

    def test_empty_source_never_erases_manual_text_and_whitespace_is_a_gap(self):
        target = {'caption': 'Manually supplied', 'name': '  '}
        IMPORTER.fill(target, 'caption', '')
        IMPORTER.fill(target, 'caption', None)
        IMPORTER.fill(target, 'name', 'Apple title')
        self.assertEqual(target, {'caption': 'Manually supplied', 'name': 'Apple title'})

    def test_new_video_without_apple_or_manual_caption_is_reported(self):
        with tempfile.TemporaryDirectory() as temp:
            videos, archives, output = self.fixture(pathlib.Path(temp))
            catalog = IMPORTER.load_json(videos, [])
            catalog.append({'id': 'unmatched', 'name': 'New video', 'accessibilityLabel': 'China', 'src': {}})
            IMPORTER.write_json(videos, catalog)
            report = self.run_import(videos, archives, output)
            gaps = [gap for gap in report['remainingGaps'] if gap['id'] == 'unmatched']
            self.assertEqual(len(gaps), 2)
            self.assertTrue(all('pointsOfInterest' in gap['fields'] for gap in gaps))
            self.assertIn('name', next(gap for gap in gaps if gap['locale'] == 'fr')['fields'])

    def test_text_and_binary_apple_strings_decode_without_losing_unicode(self):
        expected = {'CAPTION': 'Chine’s mountains\nnext'}
        self.assertEqual(IMPORTER.read_strings(plistlib.dumps(expected, fmt=plistlib.FMT_BINARY)), expected)
        self.assertEqual(IMPORTER.read_strings('"CAPTION" = "Chine\\U2019s mountains\\nnext";'.encode('utf-16')), expected)


if __name__ == '__main__':
    unittest.main()
