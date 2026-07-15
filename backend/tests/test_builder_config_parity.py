"""Python side of the JS<->Python builder schema parity fixture.

tests/fixtures/builder-config-parity.json is the single source of truth shared with
tests/builder-config-parity.test.js (vitest). This suite pins the Python sanitizers to
the fixture; the vitest suite pins the JS allowlists, descriptors, and HTML sanitizer
to the same file. Drift on either side fails one of the two suites.

When the schema changes deliberately, regenerate the fixture's expected values and
review the diff — it is the cross-language contract, not a cache.
"""

import json
import unittest
from pathlib import Path

from backend.app.builder_security import (
    ADVANCED_HTML_TAGS,
    ALLOWED_MODULE_TYPES,
    BUILDER_DEVICE_IDS,
    TEXT_HTML_TAGS,
    sanitize_html_fragment,
    sanitize_module_config,
)

FIXTURE_PATH = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "builder-config-parity.json"


class BuilderConfigParityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads(FIXTURE_PATH.read_text())

    def test_module_types_match_fixture(self):
        self.assertEqual(sorted(ALLOWED_MODULE_TYPES), self.fixture["moduleTypes"])

    def test_device_ids_match_fixture(self):
        self.assertEqual(list(BUILDER_DEVICE_IDS), self.fixture["deviceIds"])

    def test_html_allowlists_match_fixture(self):
        self.assertEqual(sorted(TEXT_HTML_TAGS), self.fixture["htmlAllowlists"]["text"])
        self.assertEqual(sorted(ADVANCED_HTML_TAGS), self.fixture["htmlAllowlists"]["html"])

    def test_html_samples_sanitize_to_fixture(self):
        for sample in self.fixture["htmlSamples"]:
            with self.subTest(sample["name"]):
                self.assertEqual(
                    sanitize_html_fragment(sample["input"], sample["mode"]),
                    sample["expected"],
                )

    def test_module_configs_cover_every_type(self):
        self.assertEqual(sorted(self.fixture["moduleConfigs"]), sorted(ALLOWED_MODULE_TYPES))

    def test_module_configs_sanitize_to_fixture(self):
        for module_type, case in self.fixture["moduleConfigs"].items():
            with self.subTest(module_type):
                self.assertEqual(
                    sanitize_module_config(module_type, case["config"]),
                    case["expected"],
                )


if __name__ == "__main__":
    unittest.main()
