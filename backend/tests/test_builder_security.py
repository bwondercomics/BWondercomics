import unittest

from backend.app.builder_security import (
    ALLOWED_MODULE_TYPES,
    sanitize_column_settings,
    sanitize_header_meta,
    sanitize_module_config,
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


class SanitizeReaderStageFrameFillTest(unittest.TestCase):
    """Reader stage frameFill: 'hug' (default) wraps pages, 'fill' spans the column."""

    def test_frame_fill_defaults_and_keywords(self):
        from backend.app.builder_security import sanitize_reader_stage

        self.assertEqual(sanitize_reader_stage({})["frameFill"], "hug")
        self.assertEqual(sanitize_reader_stage({"frameFill": "fill"})["frameFill"], "fill")
        self.assertEqual(sanitize_reader_stage({"frameFill": "wide"})["frameFill"], "hug")


class SanitizeReaderEndOfEntryAndBarTest(unittest.TestCase):
    """Builder customization roadmap Phase 3: completion popup + controls bar slot."""

    def test_end_of_entry_defaults_and_overrides(self):
        from backend.app.builder_security import sanitize_module_config

        config = sanitize_module_config("reader", {})
        self.assertEqual(config["endOfEntry"], {"enabled": True, "title": "", "body": ""})

        config = sanitize_module_config(
            "reader", {"endOfEntry": {"enabled": False, "title": "Done!", "body": "x" * 999}}
        )
        self.assertFalse(config["endOfEntry"]["enabled"])
        self.assertEqual(config["endOfEntry"]["title"], "Done!")
        self.assertEqual(len(config["endOfEntry"]["body"]), 300)

    def test_controls_bar_appearance_slot(self):
        from backend.app.builder_security import sanitize_reader_controls_style

        style = sanitize_reader_controls_style(
            {"bar": {"appearance": {"background": {"color": "#101020"}}}}
        )
        self.assertEqual(style["bar"]["appearance"]["background"]["color"], "#101020")
        self.assertNotIn("defaults", style)


class SanitizeModuleLayoutTest(unittest.TestCase):
    """Builder customization roadmap Phase 2: shared per-module wrapper layout."""

    def test_layout_rides_every_module_type_and_clamps(self):
        from backend.app.builder_security import sanitize_module_config, sanitize_module_layout

        config = sanitize_module_config(
            "text",
            {
                "content": "<p>hello</p>",
                "layout": {"widthMode": "percent", "width": 250, "height": 9999, "align": "center"},
            },
        )
        self.assertEqual(config["layout"]["widthMode"], "percent")
        self.assertEqual(config["layout"]["width"], 100)
        self.assertEqual(config["layout"]["height"], 4000)
        self.assertEqual(config["layout"]["align"], "center")

        self.assertIsNone(sanitize_module_layout(None))
        self.assertIsNone(sanitize_module_layout({}))
        self.assertIsNone(sanitize_module_layout({"widthMode": "full"}))
        self.assertIsNone(sanitize_module_layout({"align": "diagonal"}))

    def test_module_without_layout_round_trips_without_key(self):
        from backend.app.builder_security import sanitize_module_config

        config = sanitize_module_config("text", {"content": "<p>x</p>"})
        self.assertNotIn("layout", config)


class SanitizeSectionMinHeightTest(unittest.TestCase):
    """Builder customization roadmap Phase 1: section-level minHeight."""

    def test_clamps_base_and_responsive_min_height(self):
        result = sanitize_section_settings(
            {"minHeight": 5000, "responsive": {"mobile": {"minHeight": -5}}},
            layout="1-1",
        )
        self.assertEqual(result["minHeight"], 2000)
        self.assertEqual(result["responsive"]["mobile"]["minHeight"], 0)

    def test_absent_or_empty_min_height_is_dropped(self):
        self.assertNotIn("minHeight", sanitize_section_settings({}, layout="1"))
        self.assertNotIn("minHeight", sanitize_section_settings({"minHeight": ""}, layout="1"))
        self.assertNotIn("minHeight", sanitize_section_settings({"minHeight": None}, layout="1"))


class SanitizeHeaderMetaPhase5Test(unittest.TestCase):
    """Builder customization roadmap Phase 5: layoutRows persistence, brand, block styling."""

    def test_layout_rows_round_trip_across_rows(self):
        # Regression: layoutRows used to be dropped, collapsing multi-row headers to
        # the top row on every save.
        result = sanitize_header_meta(
            {
                "version": 3,
                "layoutRows": {
                    "top": {"left": ["brand"], "center": [], "right": []},
                    "middle": {"left": [], "center": ["status"], "right": []},
                    "bottom": {"left": [], "center": [], "right": ["nav"]},
                },
            }
        )
        self.assertEqual(result["layoutRows"]["top"]["left"], ["brand"])
        self.assertEqual(result["layoutRows"]["middle"]["center"], ["status"])
        self.assertEqual(result["layoutRows"]["bottom"]["right"], ["nav"])
        # Unplaced blocks fall back to their default cells; regions mirror the rows.
        self.assertEqual(result["layoutRows"]["top"]["center"], ["patron"])
        self.assertEqual(result["layoutRows"]["top"]["right"], ["entryControls"])
        self.assertEqual(result["regions"]["right"], ["entryControls", "nav"])

    def test_layout_rows_drop_junk_and_duplicates(self):
        result = sanitize_header_meta(
            {
                "layoutRows": {
                    "top": {"left": ["brand", "junk", "brand"], "center": ["brand"], "right": []},
                }
            }
        )
        placements = [
            block_id
            for row in result["layoutRows"].values()
            for cell in row.values()
            for block_id in cell
        ]
        self.assertEqual(placements.count("brand"), 1)
        self.assertNotIn("junk", placements)
        self.assertEqual(sorted(placements), ["brand", "entryControls", "nav", "patron", "status"])

    def test_legacy_regions_populate_top_row(self):
        result = sanitize_header_meta(
            {"regions": {"left": ["nav"], "center": [], "right": ["brand"]}}
        )
        self.assertEqual(result["layoutRows"]["top"]["left"][0], "nav")
        self.assertIn("brand", result["layoutRows"]["top"]["right"])
        self.assertEqual(result["layoutRows"]["middle"], {"left": [], "center": [], "right": []})

    def test_brand_logo_fields_sanitized_and_sparse(self):
        result = sanitize_header_meta(
            {
                "brand": {
                    "logoText": "  PYRE  ",
                    "logoImage": "media/logo.png",
                    "logoAppearance": {"background": {"color": "#112233"}},
                }
            }
        )
        self.assertEqual(result["brand"]["logoText"], "PYRE")
        self.assertTrue(result["brand"]["logoImage"].endswith("logo.png"))
        self.assertEqual(result["brand"]["logoAppearance"]["background"]["color"], "#112233")

        empty = sanitize_header_meta({"brand": {"logoText": "", "logoImage": ""}})
        self.assertNotIn("brand", empty)

        unsafe = sanitize_header_meta({"brand": {"logoImage": "javascript:alert(1)"}})
        self.assertNotIn("brand", unsafe)

    def test_per_block_appearance_sparse(self):
        result = sanitize_header_meta(
            {
                "blocks": {
                    "entryControls": {
                        "enabled": True,
                        "appearance": {"border": {"color": "#ff0000", "width": 2}},
                    },
                    "brand": {"enabled": False},
                }
            }
        )
        self.assertEqual(
            result["blocks"]["entryControls"]["appearance"]["border"]["color"], "#ff0000"
        )
        self.assertFalse(result["blocks"]["brand"]["enabled"])
        self.assertNotIn("appearance", result["blocks"]["brand"])


class SanitizeShellChromeModulesTest(unittest.TestCase):
    """Builder customization roadmap Phase 6: account gear + links grid as modules."""

    def test_types_are_registered(self):
        self.assertIn("account", ALLOWED_MODULE_TYPES)
        self.assertIn("links-grid", ALLOWED_MODULE_TYPES)

    def test_account_and_links_grid_config_round_trip(self):
        for module_type in ("account", "links-grid"):
            result = sanitize_module_config(
                module_type,
                {
                    "iconColor": "#ff0000",
                    "appearance": {"border": {"width": 2, "color": "#00ff00"}},
                    "junk": "<script>alert(1)</script>",
                },
            )
            self.assertEqual(result["iconColor"], "#ff0000")
            self.assertEqual(result["appearance"]["border"]["color"], "#00ff00")
            self.assertNotIn("junk", result)

    def test_empty_config_stays_sparse(self):
        result = sanitize_module_config("account", {})
        self.assertEqual(result.get("iconColor"), "")
        self.assertNotIn("appearance", result)


if __name__ == "__main__":
    unittest.main()
