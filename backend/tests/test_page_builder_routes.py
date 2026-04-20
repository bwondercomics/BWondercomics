from __future__ import annotations

import os
from uuid import UUID

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from sqlalchemy import select

from backend.app.routes import page_builder
from backend.app.models import BuilderModule, BuilderPage

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
        self.assertEqual(
            [page["id"] for page in reordered["pages"]], [second["page"]["id"], first["page"]["id"]]
        )

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

        public_home = page_builder.api_public_homepage("battle-bros", self.db)
        admin_home = page_builder.api_get_homepage_page_admin(
            "battle-bros",
            self.admin_request("/api/admin/pages/home/battle-bros"),
            self.db,
        )

        self.assertEqual(public_home["page"]["slug"], "reader")
        self.assertTrue(public_home["page"]["isPublished"])
        self.assertEqual(admin_home["page"]["slug"], "reader")

        published_reader = self.db.scalar(
            select(BuilderPage).where(
                BuilderPage.series_id == "battle-bros",
                BuilderPage.slug == "reader",
            )
        )
        assert published_reader is not None
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
