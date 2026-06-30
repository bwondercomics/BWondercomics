import unittest

from backend.app.builder_security import (
    sanitize_column_settings,
    sanitize_section_settings,
)


class SanitizeColumnPanelFieldsTest(unittest.TestCase):
    """Phase 2: panel background + spacing now live on the column entry."""

    def test_keeps_valid_panel_background_and_gap(self):
        result = sanitize_column_settings(
            {
                "index": 0,
                "panelBackground": {
                    "path": "assets/uploads/panel.png",
                    "fit": "contain",
                    "focus": "top left",
                    "opacity": 0.4,
                    "hideEmptyText": True,
                },
                "panelGap": 24,
            }
        )
        self.assertEqual(result["panelGap"], 24)
        self.assertEqual(result["panelBackground"]["fit"], "contain")
        self.assertEqual(result["panelBackground"]["opacity"], 0.4)
        self.assertTrue(result["panelBackground"]["hideEmptyText"])
        self.assertIn("path", result["panelBackground"])

    def test_clamps_out_of_range_gap_and_opacity(self):
        result = sanitize_column_settings(
            {
                "panelGap": 9999,
                "panelBackground": {"path": "assets/uploads/panel.png", "opacity": 99},
            }
        )
        self.assertEqual(result["panelGap"], 240)
        self.assertLessEqual(result["panelBackground"]["opacity"], 1.0)

    def test_drops_junk_panel_fields(self):
        result = sanitize_column_settings(
            {
                "panelGap": "not-a-number",
                "panelBackground": "nope",
            }
        )
        self.assertNotIn("panelGap", result)
        self.assertNotIn("panelBackground", result)

    def test_empty_panel_background_is_dropped(self):
        # No art and hideEmptyText falsy -> nothing worth persisting.
        result = sanitize_column_settings({"panelBackground": {"opacity": 0.5, "fit": "cover"}})
        self.assertNotIn("panelBackground", result)

    def test_panel_fields_not_emitted_on_responsive_branches(self):
        result = sanitize_column_settings(
            {
                "index": 0,
                "panelGap": 12,
                "panelBackground": {"path": "assets/uploads/panel.png"},
                "responsive": {
                    "mobile": {
                        "panelGap": 40,
                        "panelBackground": {"path": "assets/uploads/mobile.png"},
                        "hidden": True,
                    }
                },
            }
        )
        self.assertEqual(result["panelGap"], 12)
        self.assertIn("panelBackground", result)
        mobile = result["responsive"]["mobile"]
        self.assertNotIn("panelGap", mobile)
        self.assertNotIn("panelBackground", mobile)
        self.assertTrue(mobile["hidden"])

    def test_section_settings_persist_panel_fields_on_columns(self):
        result = sanitize_section_settings(
            {
                "columns": [
                    {
                        "index": 0,
                        "panelGap": 16,
                        "panelBackground": {"path": "assets/uploads/left.png"},
                    }
                ]
            },
            layout="1-1",
        )
        col0 = next(c for c in result["columns"] if c["index"] == 0)
        self.assertEqual(col0["panelGap"], 16)
        self.assertIn("path", col0["panelBackground"])


if __name__ == "__main__":
    unittest.main()
