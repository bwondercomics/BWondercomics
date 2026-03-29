from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from backend.app.routes import page_builder

from backend.tests.helpers import BackendRouteTestCase, build_request, json_body


class PageBuilderRouteTests(BackendRouteTestCase):
    def admin_request(self, path: str, method: str = "GET"):
        admin = getattr(self, "_admin_user", None)
        if admin is None:
            admin = self.create_user(kind="admin", role="admin")
            self._admin_user = admin
        return build_request(path, method=method, cookie=self.auth_cookie(admin))

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
        about_page = next(page for page in listed["pages"] if page["id"] == second["page"]["id"])
        reader_page = next(page for page in listed["pages"] if page["id"] == first["page"]["id"])
        self.assertFalse(about_page["isHomepage"])
        self.assertTrue(reader_page["isHomepage"])

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
        self.assertEqual([page["id"] for page in reordered["pages"]], [second["page"]["id"], first["page"]["id"]])

        deleted = page_builder.api_delete_page(
            second["page"]["id"],
            self.admin_request(f"/api/admin/pages/{second['page']['id']}", "DELETE"),
            self.db,
        )
        self.assertEqual(deleted, {"status": "success"})

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
            page_builder.CreateSectionRequest(sectionType="row", layout="1"),
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
            page_builder.CreateModuleRequest(moduleType="text", columnIndex=0, config={"content": "<p>A</p>"}),
            self.admin_request(f"/api/admin/sections/{first_section['id']}/modules", "POST"),
            self.db,
        )["module"]
        image_module = page_builder.api_add_module(
            first_section["id"],
            page_builder.CreateModuleRequest(moduleType="image", columnIndex=0, config={"src": "media/a.png"}),
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
            page_builder.ReorderModulesRequest(columnIndex=0, moduleIds=[image_module["id"], text_module["id"]]),
            self.admin_request(f"/api/admin/sections/{first_section['id']}/modules/reorder", "POST"),
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
            page_builder.ReorderSectionsRequest(sectionIds=[second_section["id"], first_section["id"]]),
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
        self.assertEqual([section["id"] for section in payload["sections"]], [second_section["id"], first_section["id"]])
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

    def test_public_page_endpoint_only_returns_published_pages(self):
        self.seed_builder_page("builderPage")
        self.seed_builder_page("builderPageDraft")

        published = page_builder.api_public_page("battle-bros", "reader", self.db)
        draft = page_builder.api_public_page("battle-bros", "about", self.db)
        missing = page_builder.api_public_page("battle-bros", "missing", self.db)

        self.assertEqual(published["page"]["slug"], "reader")
        self.assertEqual(published["page"]["pageType"], "reader")
        self.assertEqual(draft.status_code, 404)
        self.assertEqual(json_body(draft)["error"], "Page not found")
        self.assertEqual(missing.status_code, 404)


if __name__ == "__main__":
    import unittest

    unittest.main()
