from __future__ import annotations

import os
from uuid import UUID

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from sqlalchemy import select

from backend.app.builder_security import sanitize_module_config
from backend.app.routes import page_builder
from backend.app.models import BuilderModule, BuilderPage, BuilderPageBinding

from backend.tests.helpers import BackendRouteTestCase, build_request, json_body


class PageBuilderRouteTests(BackendRouteTestCase):
    def admin_request(self, path: str, method: str = "GET"):
        admin = getattr(self, "_admin_user", None)
        if admin is None:
            admin = self.create_user(kind="admin", role="admin")
            self._admin_user = admin
        return build_request(path, method=method, cookie=self.auth_cookie(admin))

    def add_reader_module_to_page(
        self, page_id: str, config: dict | None = None, layout: str = "1"
    ) -> dict:
        section = page_builder.api_add_section(
            page_id,
            page_builder.CreateSectionRequest(sectionType="row", layout=layout),
            self.admin_request(f"/api/admin/pages/{page_id}/sections", "POST"),
            self.db,
        )["section"]
        return page_builder.api_add_module(
            section["id"],
            page_builder.CreateModuleRequest(
                moduleType="reader",
                columnIndex=0,
                config=config or {"source": {"mode": "active-page-series"}},
            ),
            self.admin_request(f"/api/admin/sections/{section['id']}/modules", "POST"),
            self.db,
        )["module"]

    def test_admin_page_crud_slug_uniqueness_homepage_and_reorder(self):
        self.seed_contract_series()

        first = page_builder.api_create_page(
            page_builder.CreatePageRequest(
                slug="reader",
                title="Reader",
                pageType="reader",
                isPublished=True,
            ),
            self.admin_request("/api/admin/pages", "POST"),
            "battle-bros",
            self.db,
        )
        second = page_builder.api_create_page(
            page_builder.CreatePageRequest(
                slug="about",
                title="About",
                pageType="custom",
                isHomepage=True,
            ),
            self.admin_request("/api/admin/pages", "POST"),
            "battle-bros",
            self.db,
        )

        duplicate = page_builder.api_create_page(
            page_builder.CreatePageRequest(slug="about", title="Duplicate"),
            self.admin_request("/api/admin/pages", "POST"),
            "battle-bros",
            self.db,
        )

        self.assertEqual(json_body(duplicate)["error"], "Page with slug 'about' already exists")
        self.assertEqual(duplicate.status_code, 400)

        updated_first = page_builder.api_update_page(
            first["page"]["id"],
            page_builder.UpdatePageRequest(isHomepage=True),
            self.admin_request(f"/api/admin/pages/{first['page']['id']}", "PUT"),
            self.db,
        )
        listed = page_builder.api_list_pages(
            self.admin_request("/api/admin/pages"),
            "battle-bros",
            self.db,
        )

        self.assertTrue(updated_first["page"]["isHomepage"])
        self.assertEqual(updated_first["page"]["scope"], "series")
        self.assertEqual(updated_first["page"]["seriesId"], "battle-bros")
        reader_binding = self.db.scalar(
            select(BuilderPageBinding).where(
                BuilderPageBinding.series_id == "battle-bros",
                BuilderPageBinding.role == "reader",
            )
        )
        self.assertIsNone(reader_binding)
        about_page = next(page for page in listed["pages"] if page["id"] == second["page"]["id"])
        reader_page = next(page for page in listed["pages"] if page["id"] == first["page"]["id"])
        self.assertFalse(about_page["isHomepage"])
        self.assertTrue(reader_page["isHomepage"])
        missing_reader_binding = page_builder.api_get_page_bindings(
            "battle-bros",
            self.admin_request("/api/admin/page-bindings/battle-bros"),
            self.db,
        )
        self.assertEqual(missing_reader_binding["warnings"][0]["code"], "missing_reader_binding")

        page_builder.api_reorder_pages(
            page_builder.ReorderPagesRequest(pageIds=[second["page"]["id"], first["page"]["id"]]),
            self.admin_request("/api/admin/pages/reorder", "POST"),
            "battle-bros",
            self.db,
        )
        reordered = page_builder.api_list_pages(
            self.admin_request("/api/admin/pages"),
            "battle-bros",
            self.db,
        )
        self.assertEqual(
            [page["id"] for page in reordered["pages"]], [second["page"]["id"], first["page"]["id"]]
        )

        deleted = page_builder.api_delete_page(
            second["page"]["id"],
            self.admin_request(f"/api/admin/pages/{second['page']['id']}", "DELETE"),
            self.db,
        )
        self.assertEqual(deleted, {"status": "success"})

    def test_page_scopes_global_routes_and_reader_bindings(self):
        self.seed_contract_series()

        series_about = page_builder.api_create_series_page(
            "battle-bros",
            page_builder.CreatePageRequest(slug="about", title="Series About"),
            self.admin_request("/api/admin/pages/series/battle-bros", "POST"),
            self.db,
        )["page"]
        global_about = page_builder.api_create_global_page(
            page_builder.CreatePageRequest(slug="about", title="Global About", isPublished=True),
            self.admin_request("/api/admin/pages/global", "POST"),
            self.db,
        )["page"]
        duplicate_global = page_builder.api_create_global_page(
            page_builder.CreatePageRequest(slug="about", title="Duplicate"),
            self.admin_request("/api/admin/pages/global", "POST"),
            self.db,
        )

        self.assertEqual(series_about["scope"], "series")
        self.assertEqual(series_about["seriesId"], "battle-bros")
        self.assertEqual(global_about["scope"], "global")
        self.assertIsNone(global_about["seriesId"])
        self.assertEqual(duplicate_global.status_code, 400)
        self.assertEqual(
            json_body(duplicate_global)["error"], "Page with slug 'about' already exists"
        )

        global_list = page_builder.api_list_global_pages(
            self.admin_request("/api/admin/pages/global"),
            self.db,
        )
        series_list = page_builder.api_list_series_pages(
            "battle-bros",
            self.admin_request("/api/admin/pages/series/battle-bros"),
            self.db,
        )
        self.assertEqual([page["id"] for page in global_list["pages"]], [global_about["id"]])
        self.assertEqual([page["id"] for page in series_list["pages"]], [series_about["id"]])

        public_global = page_builder.api_public_global_page("about", self.db)
        public_series = page_builder.api_public_page("battle-bros", "about", self.db)
        self.assertEqual(public_global["page"]["id"], global_about["id"])
        self.assertEqual(public_series.status_code, 404)

        missing_bindings = page_builder.api_get_page_bindings(
            "battle-bros",
            self.admin_request("/api/admin/page-bindings/battle-bros"),
            self.db,
        )
        self.assertEqual(missing_bindings["warnings"][0]["code"], "missing_reader_binding")

        global_binding = page_builder.api_update_page_bindings(
            "battle-bros",
            page_builder.PageBindingsRequest(bindings={"reader": global_about["id"]}),
            self.admin_request("/api/admin/page-bindings/battle-bros", "PUT"),
            self.db,
        )
        self.assertEqual(global_binding.status_code, 400)
        self.assertEqual(json_body(global_binding)["error"], "Page cannot be used for reader binding")

        self.db.add(
            BuilderPageBinding(
                series_id="battle-bros",
                role="reader",
                page_id=UUID(global_about["id"]),
            )
        )
        self.db.commit()

        invalid_binding_home = page_builder.api_public_homepage("battle-bros", self.db)
        invalid_bindings = page_builder.api_get_page_bindings(
            "battle-bros",
            self.admin_request("/api/admin/page-bindings/battle-bros"),
            self.db,
        )
        self.assertEqual(invalid_binding_home.status_code, 404)
        self.assertEqual(invalid_bindings["warnings"][0]["code"], "reader_binding_invalid")
        self.assertEqual(invalid_bindings["warnings"][1]["code"], "missing_reader_binding")

        self.db.query(BuilderPageBinding).filter(
            BuilderPageBinding.series_id == "battle-bros",
            BuilderPageBinding.role == "reader",
        ).delete()
        self.db.commit()

        series_reader = page_builder.api_create_series_page(
            "battle-bros",
            page_builder.CreatePageRequest(
                slug="reader",
                title="Series Reader",
                pageType="reader",
                isPublished=True,
            ),
            self.admin_request("/api/admin/pages/series/battle-bros", "POST"),
            self.db,
        )["page"]
        self.add_reader_module_to_page(series_reader["id"])
        other_reader = page_builder.api_create_series_page(
            "other-series",
            page_builder.CreatePageRequest(slug="reader", title="Other Reader", pageType="reader"),
            self.admin_request("/api/admin/pages/series/other-series", "POST"),
            self.db,
        )["page"]
        wrong_series_binding = page_builder.api_update_page_bindings(
            "battle-bros",
            page_builder.PageBindingsRequest(bindings={"reader": other_reader["id"]}),
            self.admin_request("/api/admin/page-bindings/battle-bros", "PUT"),
            self.db,
        )
        updated_bindings = page_builder.api_update_page_bindings(
            "battle-bros",
            page_builder.PageBindingsRequest(bindings={"reader": series_reader["id"]}),
            self.admin_request("/api/admin/page-bindings/battle-bros", "PUT"),
            self.db,
        )

        self.assertEqual(wrong_series_binding.status_code, 400)
        self.assertEqual(updated_bindings["bindings"]["reader"]["pageId"], series_reader["id"])
        self.assertFalse(updated_bindings["warnings"])

    def test_reader_binding_requires_one_visible_active_reader_module(self):
        self.seed_contract_series()

        missing_reader = page_builder.api_create_series_page(
            "battle-bros",
            page_builder.CreatePageRequest(
                slug="missing-reader",
                title="Missing Reader",
                pageType="reader",
                isPublished=True,
            ),
            self.admin_request("/api/admin/pages/series/battle-bros", "POST"),
            self.db,
        )["page"]
        missing_binding = page_builder.api_update_page_bindings(
            "battle-bros",
            page_builder.PageBindingsRequest(bindings={"reader": missing_reader["id"]}),
            self.admin_request("/api/admin/page-bindings/battle-bros", "PUT"),
            self.db,
        )
        self.assertEqual(missing_binding.status_code, 400)
        self.assertEqual(json_body(missing_binding)["code"], "reader_module_missing")

        self.add_reader_module_to_page(missing_reader["id"])
        text_section = page_builder.api_add_section(
            missing_reader["id"],
            page_builder.CreateSectionRequest(sectionType="row", layout="1"),
            self.admin_request(f"/api/admin/pages/{missing_reader['id']}/sections", "POST"),
            self.db,
        )["section"]
        page_builder.api_add_module(
            text_section["id"],
            page_builder.CreateModuleRequest(
                moduleType="text", columnIndex=0, config={"content": "<p>Below reader</p>"}
            ),
            self.admin_request(f"/api/admin/sections/{text_section['id']}/modules", "POST"),
            self.db,
        )
        valid_binding = page_builder.api_update_page_bindings(
            "battle-bros",
            page_builder.PageBindingsRequest(bindings={"reader": missing_reader["id"]}),
            self.admin_request("/api/admin/page-bindings/battle-bros", "PUT"),
            self.db,
        )
        self.assertEqual(valid_binding["bindings"]["reader"]["pageId"], missing_reader["id"])
        self.assertFalse(valid_binding["warnings"])

        duplicate_reader = page_builder.api_create_series_page(
            "battle-bros",
            page_builder.CreatePageRequest(slug="duplicate-reader", title="Duplicate Reader"),
            self.admin_request("/api/admin/pages/series/battle-bros", "POST"),
            self.db,
        )["page"]
        self.add_reader_module_to_page(duplicate_reader["id"])
        self.add_reader_module_to_page(duplicate_reader["id"])
        duplicate_binding = page_builder.api_update_page_bindings(
            "battle-bros",
            page_builder.PageBindingsRequest(bindings={"reader": duplicate_reader["id"]}),
            self.admin_request("/api/admin/page-bindings/battle-bros", "PUT"),
            self.db,
        )
        self.assertEqual(duplicate_binding.status_code, 400)
        self.assertEqual(json_body(duplicate_binding)["code"], "reader_module_duplicate")

        hidden_reader = page_builder.api_create_series_page(
            "battle-bros",
            page_builder.CreatePageRequest(slug="hidden-reader", title="Hidden Reader"),
            self.admin_request("/api/admin/pages/series/battle-bros", "POST"),
            self.db,
        )["page"]
        self.add_reader_module_to_page(
            hidden_reader["id"],
            config={
                "source": {"mode": "active-page-series"},
                "responsive": {"desktop": {"hidden": True}},
            },
        )
        hidden_binding = page_builder.api_update_page_bindings(
            "battle-bros",
            page_builder.PageBindingsRequest(bindings={"reader": hidden_reader["id"]}),
            self.admin_request("/api/admin/page-bindings/battle-bros", "PUT"),
            self.db,
        )
        self.assertEqual(hidden_binding.status_code, 400)
        self.assertEqual(json_body(hidden_binding)["code"], "reader_module_hidden_default_device")

        wrong_source_reader = page_builder.api_create_series_page(
            "battle-bros",
            page_builder.CreatePageRequest(slug="wrong-source-reader", title="Wrong Source"),
            self.admin_request("/api/admin/pages/series/battle-bros", "POST"),
            self.db,
        )["page"]
        wrong_source_module = self.add_reader_module_to_page(wrong_source_reader["id"])
        raw_module = self.db.get(BuilderModule, UUID(wrong_source_module["id"]))
        assert raw_module is not None
        raw_module.config = {"source": {"mode": "specific-series", "seriesId": "other-series"}}
        self.db.commit()
        wrong_source_binding = page_builder.api_update_page_bindings(
            "battle-bros",
            page_builder.PageBindingsRequest(bindings={"reader": wrong_source_reader["id"]}),
            self.admin_request("/api/admin/page-bindings/battle-bros", "PUT"),
            self.db,
        )
        self.assertEqual(wrong_source_binding.status_code, 400)
        self.assertEqual(json_body(wrong_source_binding)["code"], "reader_module_wrong_source")

    def test_bound_reader_publish_blocks_invalid_reader_module_state(self):
        self.seed_contract_series()
        reader_page = page_builder.api_create_series_page(
            "battle-bros",
            page_builder.CreatePageRequest(slug="reader", title="Reader", pageType="reader"),
            self.admin_request("/api/admin/pages/series/battle-bros", "POST"),
            self.db,
        )["page"]
        self.add_reader_module_to_page(reader_page["id"])
        bound = page_builder.api_update_page_bindings(
            "battle-bros",
            page_builder.PageBindingsRequest(bindings={"reader": reader_page["id"]}),
            self.admin_request("/api/admin/page-bindings/battle-bros", "PUT"),
            self.db,
        )
        self.assertEqual(bound["bindings"]["reader"]["pageId"], reader_page["id"])

        self.add_reader_module_to_page(reader_page["id"])
        draft_save = page_builder.api_update_page(
            reader_page["id"],
            page_builder.UpdatePageRequest(isPublished=False),
            self.admin_request(f"/api/admin/pages/{reader_page['id']}", "PUT"),
            self.db,
        )
        self.assertFalse(draft_save["page"]["isPublished"])

        publish = page_builder.api_update_page(
            reader_page["id"],
            page_builder.UpdatePageRequest(title="Should Not Persist", isPublished=True),
            self.admin_request(f"/api/admin/pages/{reader_page['id']}", "PUT"),
            self.db,
        )
        self.assertEqual(publish.status_code, 400)
        self.assertEqual(json_body(publish)["code"], "reader_module_duplicate")
        self.db.expire_all()
        unchanged_page = self.db.get(BuilderPage, UUID(reader_page["id"]))
        self.assertIsNotNone(unchanged_page)
        self.assertFalse(unchanged_page.is_published)
        self.assertEqual(unchanged_page.title, "Reader")

    def test_page_reorder_rejects_invalid_stale_or_wrong_scope_lists(self):
        self.seed_contract_series()
        first = page_builder.api_create_series_page(
            "battle-bros",
            page_builder.CreatePageRequest(slug="reader", title="Reader"),
            self.admin_request("/api/admin/pages/series/battle-bros", "POST"),
            self.db,
        )["page"]
        second = page_builder.api_create_series_page(
            "battle-bros",
            page_builder.CreatePageRequest(slug="about", title="About"),
            self.admin_request("/api/admin/pages/series/battle-bros", "POST"),
            self.db,
        )["page"]
        global_page = page_builder.api_create_global_page(
            page_builder.CreatePageRequest(slug="about", title="Global About"),
            self.admin_request("/api/admin/pages/global", "POST"),
            self.db,
        )["page"]
        other_page = page_builder.api_create_series_page(
            "other-series",
            page_builder.CreatePageRequest(slug="reader", title="Other Reader"),
            self.admin_request("/api/admin/pages/series/other-series", "POST"),
            self.db,
        )["page"]

        def listed_ids():
            return [
                page["id"]
                for page in page_builder.api_list_series_pages(
                    "battle-bros",
                    self.admin_request("/api/admin/pages/series/battle-bros"),
                    self.db,
                )["pages"]
            ]

        original_order = [first["id"], second["id"]]
        self.assertEqual(listed_ids(), original_order)

        invalid_requests = [
            page_builder.ReorderPagesRequest(pageIds=["not-a-uuid", second["id"]]),
            page_builder.ReorderPagesRequest(pageIds=[first["id"], first["id"]]),
            page_builder.ReorderPagesRequest(pageIds=[first["id"]]),
            page_builder.ReorderPagesRequest(pageIds=[global_page["id"], first["id"]]),
            page_builder.ReorderPagesRequest(pageIds=[other_page["id"], first["id"]]),
        ]
        for payload in invalid_requests:
            response = page_builder.api_reorder_series_pages(
                "battle-bros",
                payload,
                self.admin_request("/api/admin/pages/series/battle-bros/reorder", "POST"),
                self.db,
            )
            self.assertEqual(response.status_code, 400)
            self.assertEqual(listed_ids(), original_order)

        legacy_response = page_builder.api_reorder_pages(
            page_builder.ReorderPagesRequest(pageIds=[first["id"]]),
            self.admin_request("/api/admin/pages/reorder", "POST"),
            "battle-bros",
            self.db,
        )
        self.assertEqual(legacy_response.status_code, 400)
        self.assertEqual(listed_ids(), original_order)

        success = page_builder.api_reorder_series_pages(
            "battle-bros",
            page_builder.ReorderPagesRequest(pageIds=[second["id"], first["id"]]),
            self.admin_request("/api/admin/pages/series/battle-bros/reorder", "POST"),
            self.db,
        )
        self.assertEqual(success, {"status": "success"})
        self.assertEqual(listed_ids(), [second["id"], first["id"]])

    def test_admin_section_and_module_endpoints_cover_crud_move_and_reorder(self):
        self.seed_contract_series()
        page = page_builder.api_create_page(
            page_builder.CreatePageRequest(slug="reader", title="Reader", pageType="reader"),
            self.admin_request("/api/admin/pages", "POST"),
            "battle-bros",
            self.db,
        )["page"]

        first_section = page_builder.api_add_section(
            page["id"],
            page_builder.CreateSectionRequest(sectionType="row", layout="1-1"),
            self.admin_request(f"/api/admin/pages/{page['id']}/sections", "POST"),
            self.db,
        )["section"]
        second_section = page_builder.api_add_section(
            page["id"],
            page_builder.CreateSectionRequest(sectionType="row", layout="1-1"),
            self.admin_request(f"/api/admin/pages/{page['id']}/sections", "POST"),
            self.db,
        )["section"]

        updated_section = page_builder.api_update_section(
            first_section["id"],
            page_builder.UpdateSectionRequest(settings={"moduleGap": 24}),
            self.admin_request(f"/api/admin/sections/{first_section['id']}", "PUT"),
            self.db,
        )["section"]

        text_module = page_builder.api_add_module(
            first_section["id"],
            page_builder.CreateModuleRequest(
                moduleType="text", columnIndex=0, config={"content": "<p>A</p>"}
            ),
            self.admin_request(f"/api/admin/sections/{first_section['id']}/modules", "POST"),
            self.db,
        )["module"]
        image_module = page_builder.api_add_module(
            first_section["id"],
            page_builder.CreateModuleRequest(
                moduleType="image", columnIndex=0, config={"src": "media/a.png"}
            ),
            self.admin_request(f"/api/admin/sections/{first_section['id']}/modules", "POST"),
            self.db,
        )["module"]
        feed_module = page_builder.api_add_module(
            second_section["id"],
            page_builder.CreateModuleRequest(moduleType="feed", columnIndex=0, config={"limit": 3}),
            self.admin_request(f"/api/admin/sections/{second_section['id']}/modules", "POST"),
            self.db,
        )["module"]

        updated_module = page_builder.api_update_module(
            feed_module["id"],
            page_builder.UpdateModuleRequest(config={"limit": 5, "heading": "Feed"}),
            self.admin_request(f"/api/admin/modules/{feed_module['id']}", "PUT"),
            self.db,
        )["module"]

        page_builder.api_reorder_modules(
            first_section["id"],
            page_builder.ReorderModulesRequest(
                columnIndex=0, moduleIds=[image_module["id"], text_module["id"]]
            ),
            self.admin_request(
                f"/api/admin/sections/{first_section['id']}/modules/reorder", "POST"
            ),
            self.db,
        )
        moved_module = page_builder.api_move_module(
            text_module["id"],
            page_builder.MoveModuleRequest(
                targetSectionId=second_section["id"],
                columnIndex=1,
                sortIndex=0,
            ),
            self.admin_request(f"/api/admin/modules/{text_module['id']}/move", "POST"),
            self.db,
        )["module"]
        page_builder.api_reorder_sections(
            page["id"],
            page_builder.ReorderSectionsRequest(
                sectionIds=[second_section["id"], first_section["id"]]
            ),
            self.admin_request(f"/api/admin/pages/{page['id']}/sections/reorder", "POST"),
            self.db,
        )

        payload = page_builder.api_get_page(
            page["id"],
            self.admin_request(f"/api/admin/pages/{page['id']}"),
            self.db,
        )["page"]

        self.assertEqual(updated_section["settings"]["moduleGap"], 24)
        self.assertEqual(updated_module["config"]["limit"], 5)
        self.assertEqual(moved_module["columnIndex"], 1)
        self.assertEqual(
            [section["id"] for section in payload["sections"]],
            [second_section["id"], first_section["id"]],
        )
        self.assertEqual(payload["sections"][0]["modules"][0]["moduleType"], "feed")
        self.assertEqual(payload["sections"][0]["modules"][1]["id"], text_module["id"])
        self.assertEqual(payload["sections"][1]["modules"][0]["id"], image_module["id"])

        deleted_module = page_builder.api_delete_module(
            image_module["id"],
            self.admin_request(f"/api/admin/modules/{image_module['id']}", "DELETE"),
            self.db,
        )
        deleted_section = page_builder.api_delete_section(
            first_section["id"],
            self.admin_request(f"/api/admin/sections/{first_section['id']}", "DELETE"),
            self.db,
        )

        self.assertEqual(deleted_module, {"status": "success"})
        self.assertEqual(deleted_section, {"status": "success"})

    def test_cms_module_source_config_sanitization(self):
        reader = sanitize_module_config(
            "reader",
            {
                "source": {"mode": "all-series", "seriesId": "wrong"},
                "showPanels": True,
                "showComments": False,
            },
        )
        entry_gallery = sanitize_module_config(
            "entry-gallery",
            {
                "source": {
                    "mode": "specific-series",
                    "seriesId": "battle-bros",
                    "filters": {
                        "labelId": "issues",
                        "status": "published",
                        "access": "premium",
                        "unsupported": "<script>",
                    },
                    "sort": "title",
                    "limit": 500,
                },
                "columns": 8,
            },
        )
        media_gallery = sanitize_module_config(
            "media-gallery",
            {
                "source": {
                    "mode": "specific-series",
                    "seriesId": "ignored-series",
                    "filters": {"access": "private", "tags": ["covers", "<bad>"]},
                    "sort": "newest",
                },
                "columns": 2,
                "limit": 12,
                "includePremium": False,
                "responsive": {"mobile": {"columns": 2}},
            },
        )
        feed = sanitize_module_config("feed", {"source": {"mode": "specific-series"}})

        self.assertEqual(reader["source"], {"mode": "active-page-series"})
        self.assertEqual(entry_gallery["source"]["mode"], "specific-series")
        self.assertEqual(entry_gallery["source"]["seriesId"], "battle-bros")
        self.assertEqual(entry_gallery["source"]["filters"]["access"], "premium")
        self.assertEqual(entry_gallery["source"]["sort"], "title")
        self.assertEqual(entry_gallery["source"]["limit"], 200)
        self.assertEqual(entry_gallery["columns"], 6)
        self.assertEqual(media_gallery["source"]["mode"], "site")
        self.assertNotIn("seriesId", media_gallery["source"])
        self.assertNotIn("access", media_gallery["source"].get("filters", {}))
        self.assertEqual(media_gallery["source"]["filters"]["tags"], ["covers", "<bad>"])
        self.assertEqual(media_gallery["responsive"]["mobile"]["columns"], 2)
        self.assertFalse(media_gallery["includePremium"])
        self.assertEqual(feed["source"], {"mode": "site"})

    def test_reader_module_source_normalizes_by_page_scope(self):
        self.seed_contract_series()
        series_page = page_builder.api_create_series_page(
            "battle-bros",
            page_builder.CreatePageRequest(slug="reader-source", title="Reader Source"),
            self.admin_request("/api/admin/pages/series/battle-bros", "POST"),
            self.db,
        )["page"]
        series_section = page_builder.api_add_section(
            series_page["id"],
            page_builder.CreateSectionRequest(sectionType="row", layout="1"),
            self.admin_request(f"/api/admin/pages/{series_page['id']}/sections", "POST"),
            self.db,
        )["section"]
        series_reader = page_builder.api_add_module(
            series_section["id"],
            page_builder.CreateModuleRequest(
                moduleType="reader",
                columnIndex=0,
                config={"source": {"mode": "specific-series", "seriesId": "other-series"}},
            ),
            self.admin_request(f"/api/admin/sections/{series_section['id']}/modules", "POST"),
            self.db,
        )["module"]
        self.assertEqual(series_reader["config"]["source"], {"mode": "active-page-series"})

        updated_series_reader = page_builder.api_update_module(
            series_reader["id"],
            page_builder.UpdateModuleRequest(
                config={"source": {"mode": "specific-series", "seriesId": "other-series"}}
            ),
            self.admin_request(f"/api/admin/modules/{series_reader['id']}", "PUT"),
            self.db,
        )["module"]
        self.assertEqual(updated_series_reader["config"]["source"], {"mode": "active-page-series"})

        serialized_series = page_builder.api_get_page(
            series_page["id"],
            self.admin_request(f"/api/admin/pages/{series_page['id']}"),
            self.db,
        )["page"]
        serialized_series_reader = serialized_series["sections"][0]["modules"][0]
        self.assertEqual(serialized_series_reader["config"]["source"], {"mode": "active-page-series"})

        global_page = page_builder.api_create_global_page(
            page_builder.CreatePageRequest(slug="global-reader-source", title="Global Reader"),
            self.admin_request("/api/admin/pages/global", "POST"),
            self.db,
        )["page"]
        global_section = page_builder.api_add_section(
            global_page["id"],
            page_builder.CreateSectionRequest(sectionType="row", layout="1"),
            self.admin_request(f"/api/admin/pages/{global_page['id']}/sections", "POST"),
            self.db,
        )["section"]
        global_reader = page_builder.api_add_module(
            global_section["id"],
            page_builder.CreateModuleRequest(
                moduleType="reader",
                columnIndex=0,
                config={"source": {"mode": "active-page-series"}},
            ),
            self.admin_request(f"/api/admin/sections/{global_section['id']}/modules", "POST"),
            self.db,
        )["module"]
        self.assertEqual(global_reader["config"]["source"], {"mode": "specific-series"})

        updated_global_reader = page_builder.api_update_module(
            global_reader["id"],
            page_builder.UpdateModuleRequest(
                config={"source": {"mode": "specific-series", "seriesId": "other-series"}}
            ),
            self.admin_request(f"/api/admin/modules/{global_reader['id']}", "PUT"),
            self.db,
        )["module"]
        self.assertEqual(
            updated_global_reader["config"]["source"],
            {"mode": "specific-series", "seriesId": "other-series"},
        )

    def test_public_page_endpoint_only_returns_published_pages(self):
        self.seed_builder_page("builderPage")
        self.seed_builder_page("builderPageDraft")

        published = page_builder.api_public_page("battle-bros", "reader", self.db)
        draft = page_builder.api_public_page("battle-bros", "about", self.db)
        missing = page_builder.api_public_page("battle-bros", "missing", self.db)
        admin_draft = page_builder.api_get_page_by_slug_admin(
            "battle-bros",
            "about",
            self.admin_request("/api/admin/pages/by-slug/battle-bros/about"),
            self.db,
        )
        unauthorized_draft = page_builder.api_get_page_by_slug_admin(
            "battle-bros",
            "about",
            build_request("/api/admin/pages/by-slug/battle-bros/about"),
            self.db,
        )

        self.assertEqual(published["page"]["slug"], "reader")
        self.assertEqual(published["page"]["pageType"], "reader")
        self.assertEqual(draft.status_code, 404)
        self.assertEqual(json_body(draft)["error"], "Page not found")
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(admin_draft["page"]["slug"], "about")
        self.assertFalse(admin_draft["page"]["isPublished"])
        self.assertEqual(unauthorized_draft.status_code, 403)

    def test_homepage_endpoints_resolve_homepage_then_reader_with_visibility_rules(self):
        self.seed_builder_page("builderPage")
        self.seed_builder_page("builderPageDraft")
        published_reader = self.db.scalar(
            select(BuilderPage).where(
                BuilderPage.series_id == "battle-bros",
                BuilderPage.slug == "reader",
            )
        )
        assert published_reader is not None
        self.add_reader_module_to_page(str(published_reader.id))
        bound_reader = page_builder.api_update_page_bindings(
            "battle-bros",
            page_builder.PageBindingsRequest(bindings={"reader": str(published_reader.id)}),
            self.admin_request("/api/admin/page-bindings/battle-bros", "PUT"),
            self.db,
        )
        self.assertEqual(bound_reader["bindings"]["reader"]["pageId"], str(published_reader.id))

        public_home = page_builder.api_public_homepage("battle-bros", self.db)
        admin_home = page_builder.api_get_homepage_page_admin(
            "battle-bros",
            self.admin_request("/api/admin/pages/home/battle-bros"),
            self.db,
        )

        self.assertEqual(public_home["page"]["slug"], "reader")
        self.assertTrue(public_home["page"]["isPublished"])
        self.assertEqual(admin_home["page"]["slug"], "reader")

        published_reader.is_homepage = False

        draft_homepage = self.db.scalar(
            select(BuilderPage).where(
                BuilderPage.series_id == "battle-bros",
                BuilderPage.slug == "about",
            )
        )
        assert draft_homepage is not None
        draft_homepage.is_homepage = True
        self.db.commit()

        public_fallback = page_builder.api_public_homepage("battle-bros", self.db)
        admin_draft_home = page_builder.api_get_homepage_page_admin(
            "battle-bros",
            self.admin_request("/api/admin/pages/home/battle-bros"),
            self.db,
        )

        self.assertEqual(public_fallback["page"]["slug"], "reader")
        self.assertEqual(admin_draft_home["page"]["slug"], "about")

        self.db.query(BuilderPageBinding).filter(
            BuilderPageBinding.series_id == "battle-bros",
            BuilderPageBinding.role == "reader",
        ).delete()
        draft_homepage.is_homepage = False
        self.db.commit()

        missing_binding_home = page_builder.api_public_homepage("battle-bros", self.db)
        self.assertEqual(missing_binding_home.status_code, 404)

    def test_builder_security_sanitizes_saved_builder_payloads(self):
        self.seed_contract_series()
        page = page_builder.api_create_page(
            page_builder.CreatePageRequest(
                slug="secure",
                title="Secure",
                meta={
                    "header": {
                        "copy": {"title": "Secure <Page>"},
                        "nav": {
                            "items": [
                                {
                                    "label": "Bad Link",
                                    "style": "secondary",
                                    "link": {"kind": "url", "url": "javascript:alert(1)"},
                                }
                            ]
                        },
                    },
                    "panelBackgrounds": {
                        "left": {"path": "javascript:alert(1)", "opacity": 0.7},
                    },
                },
            ),
            self.admin_request("/api/admin/pages", "POST"),
            "battle-bros",
            self.db,
        )["page"]

        section = page_builder.api_add_section(
            page["id"],
            page_builder.CreateSectionRequest(sectionType="row", layout="1"),
            self.admin_request(f"/api/admin/pages/{page['id']}/sections", "POST"),
            self.db,
        )["section"]

        text_module = page_builder.api_add_module(
            section["id"],
            page_builder.CreateModuleRequest(
                moduleType="text",
                columnIndex=0,
                config={
                    "content": '<p onclick="evil()">Safe <strong>copy</strong><script>alert(1)</script><a href="javascript:alert(2)">Link</a></p>',
                },
            ),
            self.admin_request(f"/api/admin/sections/{section['id']}/modules", "POST"),
            self.db,
        )["module"]
        html_module = page_builder.api_add_module(
            section["id"],
            page_builder.CreateModuleRequest(
                moduleType="html",
                columnIndex=0,
                config={
                    "code": '<section onclick="evil()"><script>alert(1)</script><div class="widget" data-note="ok">Widget</div><img src="javascript:alert(3)"></section>',
                },
            ),
            self.admin_request(f"/api/admin/sections/{section['id']}/modules", "POST"),
            self.db,
        )["module"]
        promo_module = page_builder.api_add_module(
            section["id"],
            page_builder.CreateModuleRequest(
                moduleType="promo",
                columnIndex=0,
                config={
                    "items": [
                        {
                            "bottomText": '<img src=x onerror="evil()"><strong>Buy now</strong>',
                            "linkUrl": "javascript:alert(4)",
                        }
                    ]
                },
            ),
            self.admin_request(f"/api/admin/sections/{section['id']}/modules", "POST"),
            self.db,
        )["module"]

        self.assertEqual(page["meta"]["header"]["nav"]["items"][0]["link"]["url"], "#")
        self.assertEqual(page["meta"]["header"]["nav"]["items"][0]["style"], "secondary")
        self.assertEqual(page["meta"]["panelBackgrounds"], {})
        self.assertIn("<strong>copy</strong>", text_module["config"]["content"])
        self.assertNotIn("<script", text_module["config"]["content"])
        self.assertNotIn("onclick", text_module["config"]["content"])
        self.assertNotIn("javascript:", text_module["config"]["content"])
        self.assertIn('class="widget"', html_module["config"]["code"])
        self.assertIn('data-note="ok"', html_module["config"]["code"])
        self.assertNotIn("<script", html_module["config"]["code"])
        self.assertNotIn("onclick", html_module["config"]["code"])
        self.assertNotIn("javascript:", html_module["config"]["code"])
        self.assertIn("<strong>Buy now</strong>", promo_module["config"]["items"][0]["bottomText"])
        self.assertNotIn("onerror", promo_module["config"]["items"][0]["bottomText"])
        self.assertEqual(promo_module["config"]["items"][0]["linkUrl"], "")

        stored_page = self.db.get(BuilderPage, UUID(page["id"]))
        stored_text = self.db.get(BuilderModule, UUID(text_module["id"]))
        self.assertEqual(stored_page.meta["header"]["nav"]["items"][0]["link"]["url"], "#")
        self.assertEqual(stored_page.meta["header"]["nav"]["items"][0]["style"], "secondary")
        self.assertNotIn("<script", stored_text.config["content"])

    def test_builder_security_round_trips_sparse_appearance_payloads(self):
        self.seed_contract_series()
        page = page_builder.api_create_page(
            page_builder.CreatePageRequest(
                slug="appearance-contract",
                title="Appearance Contract",
                meta={
                    "header": {
                        "copy": {"title": "Appearance Contract"},
                        "appearance": {
                            "top": {
                                "background": {
                                    "type": "gradient",
                                    "color": "#112233",
                                    "secondaryColor": "#334455",
                                    "angle": 999,
                                    "opacity": 99,
                                },
                                "text": {"color": "not-a-color"},
                            },
                            "scrolled": {
                                "border": {
                                    "width": -5,
                                    "style": "double",
                                    "color": "#00d9ff",
                                    "opacity": 99,
                                    "radius": 999,
                                }
                            },
                            "navItemDefaults": {
                                "text": {"color": "#ffffff"},
                            },
                        },
                        "nav": {
                            "items": [
                                {
                                    "label": "About",
                                    "appearance": {
                                        "background": {
                                            "color": "bad-color",
                                            "secondaryColor": "#abcdef",
                                            "angle": 12,
                                        },
                                        "text": {"color": "#ffee00"},
                                        "border": {
                                            "width": 2,
                                            "style": "dotted",
                                            "color": "#00ff00",
                                            "opacity": 0.5,
                                        },
                                    },
                                    "link": {"kind": "url", "url": "https://example.com"},
                                }
                            ]
                        },
                    }
                },
            ),
            self.admin_request("/api/admin/pages", "POST"),
            "battle-bros",
            self.db,
        )["page"]

        section = page_builder.api_add_section(
            page["id"],
            page_builder.CreateSectionRequest(sectionType="row", layout="1"),
            self.admin_request(f"/api/admin/pages/{page['id']}/sections", "POST"),
            self.db,
        )["section"]

        page_builder.api_add_module(
            section["id"],
            page_builder.CreateModuleRequest(
                moduleType="buttons",
                columnIndex=0,
                config={
                    "defaults": {
                        "appearance": {
                            "background": {
                                "color": "#202020",
                                "opacity": 1.2,
                            },
                            "border": {
                                "radius": 16,
                            },
                        }
                    },
                    "buttons": [
                        {
                            "text": "Read",
                            "appearance": {
                                "border": {
                                    "width": -5,
                                    "style": "danger",
                                    "color": "#ff00ff",
                                    "opacity": 99,
                                },
                                "text": {"color": "#ffffff"},
                            },
                            "link": {"kind": "builder-page", "pageSlug": "reader"},
                        }
                    ],
                },
            ),
            self.admin_request(f"/api/admin/sections/{section['id']}/modules", "POST"),
            self.db,
        )

        payload = page_builder.api_get_page(
            page["id"],
            self.admin_request(f"/api/admin/pages/{page['id']}"),
            self.db,
        )["page"]

        header_appearance = payload["meta"]["header"]["appearance"]
        self.assertEqual(header_appearance["top"]["background"]["type"], "gradient")
        self.assertEqual(header_appearance["top"]["background"]["color"], "#112233")
        self.assertEqual(header_appearance["top"]["background"]["secondaryColor"], "#334455")
        self.assertEqual(header_appearance["top"]["background"]["angle"], 360)
        self.assertEqual(header_appearance["top"]["background"]["opacity"], 1.0)
        self.assertIsNone(header_appearance["top"]["text"]["color"])
        self.assertEqual(header_appearance["scrolled"]["border"]["width"], 0)
        self.assertIsNone(header_appearance["scrolled"]["border"]["style"])
        self.assertEqual(header_appearance["scrolled"]["border"]["color"], "#00d9ff")
        self.assertEqual(header_appearance["scrolled"]["border"]["opacity"], 1.0)
        self.assertEqual(header_appearance["scrolled"]["border"]["radius"], 200)
        self.assertEqual(header_appearance["navItemDefaults"]["text"]["color"], "#ffffff")

        nav_item = payload["meta"]["header"]["nav"]["items"][0]
        self.assertIn("appearance", nav_item)
        self.assertIsNone(nav_item["appearance"]["background"]["color"])
        self.assertEqual(nav_item["appearance"]["background"]["secondaryColor"], "#abcdef")
        self.assertEqual(nav_item["appearance"]["background"]["angle"], 12)
        self.assertEqual(nav_item["appearance"]["text"]["color"], "#ffee00")
        self.assertEqual(nav_item["appearance"]["border"]["width"], 2)
        self.assertEqual(nav_item["appearance"]["border"]["style"], "dotted")
        self.assertEqual(nav_item["appearance"]["border"]["color"], "#00ff00")
        self.assertEqual(nav_item["appearance"]["border"]["opacity"], 0.5)

        buttons_module = next(
            module
            for section_payload in payload["sections"]
            for module in section_payload["modules"]
            if module["moduleType"] == "buttons"
        )
        self.assertEqual(
            buttons_module["config"]["defaults"]["appearance"]["background"]["color"], "#202020"
        )
        self.assertEqual(
            buttons_module["config"]["defaults"]["appearance"]["background"]["opacity"], 1.0
        )
        self.assertEqual(buttons_module["config"]["defaults"]["appearance"]["border"]["radius"], 16)
        self.assertEqual(buttons_module["config"]["buttons"][0]["appearance"]["border"]["width"], 0)
        self.assertIsNone(buttons_module["config"]["buttons"][0]["appearance"]["border"]["style"])
        self.assertEqual(
            buttons_module["config"]["buttons"][0]["appearance"]["border"]["color"], "#ff00ff"
        )
        self.assertEqual(
            buttons_module["config"]["buttons"][0]["appearance"]["border"]["opacity"], 1.0
        )
        self.assertEqual(
            buttons_module["config"]["buttons"][0]["appearance"]["text"]["color"], "#ffffff"
        )

        plain_page = page_builder.api_create_page(
            page_builder.CreatePageRequest(
                slug="appearance-plain",
                title="Appearance Plain",
                meta={"header": {"copy": {"title": "Appearance Plain"}}},
            ),
            self.admin_request("/api/admin/pages", "POST"),
            "battle-bros",
            self.db,
        )["page"]
        plain_payload = page_builder.api_get_page(
            plain_page["id"],
            self.admin_request(f"/api/admin/pages/{plain_page['id']}"),
            self.db,
        )["page"]

        self.assertNotIn("appearance", plain_page["meta"]["header"])
        self.assertNotIn("appearance", plain_payload["meta"]["header"])

    def test_builder_security_sanitizes_responsive_overrides(self):
        self.seed_contract_series()
        page = page_builder.api_create_page(
            page_builder.CreatePageRequest(
                slug="responsive-contract",
                title="Responsive Contract",
                meta={
                    "header": {"copy": {"title": "Responsive Contract"}},
                    "responsive": {
                        "mobile": {
                            "header": {
                                "appearance": {
                                    "top": {"background": {"color": "#112233"}},
                                    "unknown": {"color": "#ffffff"},
                                },
                            },
                            "unsafe": {"value": "drop"},
                        },
                        "watch": {"header": {"appearance": {"top": {"text": {"color": "#fff"}}}}},
                    },
                },
            ),
            self.admin_request("/api/admin/pages", "POST"),
            "battle-bros",
            self.db,
        )["page"]

        section = page_builder.api_add_section(
            page["id"],
            page_builder.CreateSectionRequest(
                sectionType="row",
                layout="1-1",
                settings={
                    "moduleGap": 20,
                    "responsive": {
                        "mobile": {
                            "layout": "1",
                            "moduleGap": -10,
                            "backgroundColor": "not-a-color",
                            "unsafe": "drop",
                        },
                        "tablet": {"columnGap": 24},
                    },
                },
            ),
            self.admin_request(f"/api/admin/pages/{page['id']}/sections", "POST"),
            self.db,
        )["section"]

        page_builder.api_add_module(
            section["id"],
            page_builder.CreateModuleRequest(
                moduleType="text",
                columnIndex=0,
                config={
                    "content": "<p>Copy</p>",
                    "alignment": "left",
                    "responsive": {
                        "mobile": {
                            "alignment": "right",
                            "hidden": True,
                            "content": "<script>drop()</script>",
                        },
                        "tablet": {
                            "alignment": "sideways",
                            "hidden": False,
                        },
                    },
                },
            ),
            self.admin_request(f"/api/admin/sections/{section['id']}/modules", "POST"),
            self.db,
        )
        page_builder.api_add_module(
            section["id"],
            page_builder.CreateModuleRequest(
                moduleType="buttons",
                columnIndex=1,
                config={
                    "buttons": [
                        {
                            "id": "read-now",
                            "text": "Read",
                            "link": {"kind": "builder-page", "pageSlug": "reader"},
                        }
                    ],
                    "responsive": {
                        "mobile": {
                            "defaults": {
                                "appearance": {"background": {"color": "#202020", "opacity": 2}}
                            },
                            "buttons": [
                                {
                                    "id": "read-now",
                                    "text": "Drop",
                                    "appearance": {"text": {"color": "#ffffff"}},
                                }
                            ],
                            "text": "drop",
                        }
                    },
                },
            ),
            self.admin_request(f"/api/admin/sections/{section['id']}/modules", "POST"),
            self.db,
        )

        payload = page_builder.api_get_page(
            page["id"],
            self.admin_request(f"/api/admin/pages/{page['id']}"),
            self.db,
        )["page"]

        self.assertNotIn("watch", payload["meta"]["responsive"])
        self.assertNotIn("unsafe", payload["meta"]["responsive"]["mobile"])
        self.assertEqual(
            payload["meta"]["responsive"]["mobile"]["header"]["appearance"]["top"]["background"][
                "color"
            ],
            "#112233",
        )

        section_payload = payload["sections"][0]
        self.assertEqual(section_payload["settings"]["moduleGap"], 20)
        self.assertEqual(section_payload["settings"]["responsive"]["mobile"]["layout"], "1")
        self.assertEqual(section_payload["settings"]["responsive"]["mobile"]["moduleGap"], 0)
        self.assertNotIn("backgroundColor", section_payload["settings"]["responsive"]["mobile"])
        self.assertNotIn("unsafe", section_payload["settings"]["responsive"]["mobile"])
        self.assertEqual(section_payload["settings"]["responsive"]["tablet"]["columnGap"], 24)

        text_module = next(
            module for module in section_payload["modules"] if module["moduleType"] == "text"
        )
        self.assertEqual(text_module["config"]["alignment"], "left")
        self.assertEqual(text_module["config"]["responsive"]["mobile"]["alignment"], "right")
        self.assertEqual(text_module["config"]["responsive"]["mobile"]["hidden"], True)
        self.assertNotIn("content", text_module["config"]["responsive"]["mobile"])
        self.assertEqual(text_module["config"]["responsive"]["tablet"]["hidden"], False)
        self.assertNotIn("alignment", text_module["config"]["responsive"]["tablet"])

        buttons_module = next(
            module for module in section_payload["modules"] if module["moduleType"] == "buttons"
        )
        button_responsive = buttons_module["config"]["responsive"]["mobile"]
        self.assertEqual(
            button_responsive["defaults"]["appearance"]["background"]["color"], "#202020"
        )
        self.assertEqual(button_responsive["defaults"]["appearance"]["background"]["opacity"], 1.0)
        self.assertEqual(button_responsive["buttons"][0]["id"], "read-now")
        self.assertEqual(button_responsive["buttons"][0]["appearance"]["text"]["color"], "#ffffff")
        self.assertNotIn("text", button_responsive["buttons"][0])
        self.assertNotIn("text", button_responsive)

    def test_builder_security_rejects_invalid_structure_and_sanitizes_legacy_reads(self):
        self.seed_contract_series()
        page = page_builder.api_create_page(
            page_builder.CreatePageRequest(slug="structure-check", title="Reader"),
            self.admin_request("/api/admin/pages", "POST"),
            "battle-bros",
            self.db,
        )["page"]

        bad_section = page_builder.api_add_section(
            page["id"],
            page_builder.CreateSectionRequest(sectionType="row", layout="9-9"),
            self.admin_request(f"/api/admin/pages/{page['id']}/sections", "POST"),
            self.db,
        )
        self.assertEqual(bad_section.status_code, 400)
        self.assertIn("Unsupported section layout", json_body(bad_section)["error"])

        section = page_builder.api_add_section(
            page["id"],
            page_builder.CreateSectionRequest(sectionType="row", layout="1"),
            self.admin_request(f"/api/admin/pages/{page['id']}/sections", "POST"),
            self.db,
        )["section"]

        bad_module = page_builder.api_add_module(
            section["id"],
            page_builder.CreateModuleRequest(moduleType="evil", columnIndex=0, config={}),
            self.admin_request(f"/api/admin/sections/{section['id']}/modules", "POST"),
            self.db,
        )
        self.assertEqual(bad_module.status_code, 400)
        self.assertIn("Unsupported module type", json_body(bad_module)["error"])

        seeded = self.seed_builder_page("builderPage")
        builder_page = seeded["page"]
        builder_page.meta = {
            "header": {
                "nav": {
                    "items": [
                        {
                            "label": "Unsafe",
                            "style": "secondary",
                            "link": {"kind": "url", "url": "javascript:alert(1)"},
                        }
                    ]
                }
            }
        }
        text_module = next(module for module in seeded["modules"] if module.module_type == "text")
        text_module.config = {
            "content": '<p><script>alert(1)</script><a href="javascript:alert(2)">Unsafe</a><strong>Safe</strong></p>',
        }
        self.db.commit()

        payload = page_builder.api_get_page(
            str(builder_page.id),
            self.admin_request(f"/api/admin/pages/{builder_page.id}"),
            self.db,
        )["page"]

        self.assertEqual(payload["meta"]["header"]["nav"]["items"][0]["link"]["url"], "#")
        self.assertEqual(payload["meta"]["header"]["nav"]["items"][0]["style"], "secondary")
        hydrated_text = next(
            module
            for section_payload in payload["sections"]
            for module in section_payload["modules"]
            if module["moduleType"] == "text"
        )
        self.assertNotIn("<script", hydrated_text["config"]["content"])
        self.assertNotIn("javascript:", hydrated_text["config"]["content"])
        self.assertIn("<strong>Safe</strong>", hydrated_text["config"]["content"])


if __name__ == "__main__":
    import unittest

    unittest.main()
