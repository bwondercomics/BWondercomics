from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from backend.app.models import Series
from backend.app.routes import series_json

from backend.tests.helpers import BackendRouteTestCase, json_body, parse_iso_z


class SeriesContractTests(BackendRouteTestCase):
    def test_public_series_index_matches_the_shared_contract(self):
        self.seed_contract_series()
        stealth = self.contracts["seriesIndex"]["series"][1]
        self.db.add(
            Series(
                id=stealth["id"],
                title=stealth["title"],
                description=stealth["description"],
                cover_image=stealth.get("coverImage"),
                premium_only=bool(stealth.get("premiumOnly")),
                status_message="",
                unit_label_singular=stealth["unitLabelSingular"],
                unit_label_plural=stealth["unitLabelPlural"],
                active=True,
                created_at=parse_iso_z(self.contracts["seriesData"]["lastUpdated"])
                + timedelta(seconds=1)
                if parse_iso_z(self.contracts["seriesData"]["lastUpdated"])
                else datetime.now(timezone.utc),
                updated_at=parse_iso_z(self.contracts["seriesData"]["lastUpdated"])
                + timedelta(seconds=1)
                if parse_iso_z(self.contracts["seriesData"]["lastUpdated"])
                else datetime.now(timezone.utc),
            )
        )
        self.db.commit()

        response = series_json.public_series_index(self.db)

        self.assertEqual(json_body(response), self.contracts["seriesIndex"])

    def test_public_and_admin_series_data_match_the_seeded_contract(self):
        self.seed_contract_series()

        public_response = series_json.public_default_series_data(self.db)
        admin_response = series_json.admin_series_data_api("battle-bros", self.db)

        self.assertEqual(json_body(public_response), self.contracts["seriesData"])
        self.assertEqual(json_body(admin_response), self.contracts["seriesData"])


if __name__ == "__main__":
    import unittest

    unittest.main()
