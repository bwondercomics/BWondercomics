"""
Migration script to convert existing PageConfig to page builder format.

This script:
1. Reads existing PageConfig entries (the old page-config.json format)
2. Creates corresponding BuilderPage, BuilderSection, and BuilderModule records
3. Preserves the three-column layout (left panel | reader | right panel)
4. Keeps theme settings in PageConfig for backwards compatibility

Run with: python -m app.migrate_page_config
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .builder_history import PAGE_CREATED, capture_page_snapshot
from .db import SessionLocal
from .models import BuilderModule, BuilderPage, BuilderSection, PageConfig, Series


def _now() -> datetime:
    return datetime.now(timezone.utc)


def migrate_page_config_to_builder(db: Session, series_id: str, config: dict) -> BuilderPage | None:
    """Convert a single PageConfig to page builder format."""

    # Check if a "reader" page already exists for this series
    existing = db.scalar(
        select(BuilderPage).where(
            BuilderPage.series_id == series_id,
            BuilderPage.slug == "reader",
        )
    )
    if existing:
        print(f"  Skipping {series_id}: reader page already exists")
        return None

    now = _now()
    content = config.get("content", {})
    layout = config.get("layout", {})

    # Extract content from old config
    header_config = content.get("header", {})
    left_panel = content.get("leftPanel", {})
    right_panel = content.get("rightPanel", {})

    # Determine panel visibility and order
    left_enabled = layout.get("leftPanel", {}).get("enabled", True)
    right_enabled = layout.get("rightPanel", {}).get("enabled", True)
    left_order = layout.get("leftPanel", {}).get("order", 1)
    viewport_order = layout.get("viewport", {}).get("order", 2)
    right_order = layout.get("rightPanel", {}).get("order", 3)

    # Create the reader page
    page = BuilderPage(
        id=uuid.uuid4(),
        series_id=series_id,
        slug="reader",
        title=header_config.get("title", "Reader"),
        page_type="reader",
        is_published=True,
        is_homepage=True,
        sort_index=0,
        meta={},
        created_at=now,
        updated_at=now,
    )
    db.add(page)
    db.flush()

    # Create header section (full width)
    header_section = BuilderSection(
        id=uuid.uuid4(),
        page_id=page.id,
        section_type="row",
        layout="1",
        sort_index=0,
        settings={},
        created_at=now,
    )
    db.add(header_section)
    db.flush()

    # Add header module
    header_module = BuilderModule(
        id=uuid.uuid4(),
        section_id=header_section.id,
        module_type="header",
        column_index=0,
        sort_index=0,
        config={
            "title": header_config.get("title", ""),
            "subtitle": header_config.get("subtitle", ""),
            "subtitles": header_config.get("subtitles", []),
        },
        created_at=now,
        updated_at=now,
    )
    db.add(header_module)

    # Create main content section (three columns: left | reader | right)
    # Using 1-3-1 layout to give reader more space
    main_section = BuilderSection(
        id=uuid.uuid4(),
        page_id=page.id,
        section_type="row",
        layout="1-3-1",
        sort_index=1,
        settings={
            "panelOrder": {
                "left": left_order,
                "viewport": viewport_order,
                "right": right_order,
            },
            "panelEnabled": {
                "left": left_enabled,
                "right": right_enabled,
            },
        },
        created_at=now,
    )
    db.add(main_section)
    db.flush()

    # Determine column indices based on order
    positions = [
        ("left", left_order, 0),
        ("viewport", viewport_order, 1),
        ("right", right_order, 2),
    ]
    positions.sort(key=lambda x: x[1])
    col_map = {pos[0]: idx for idx, pos in enumerate(positions)}

    # Left panel modules (column 0 by default, or based on order)
    left_col = col_map.get("left", 0)
    if left_enabled:
        # Top text module
        if left_panel.get("topText"):
            db.add(
                BuilderModule(
                    id=uuid.uuid4(),
                    section_id=main_section.id,
                    module_type="text",
                    column_index=left_col,
                    sort_index=0,
                    config={
                        "content": f"<p>{left_panel['topText']}</p>",
                        "alignment": "center",
                    },
                    created_at=now,
                    updated_at=now,
                )
            )

        # Image module
        if left_panel.get("image"):
            db.add(
                BuilderModule(
                    id=uuid.uuid4(),
                    section_id=main_section.id,
                    module_type="image",
                    column_index=left_col,
                    sort_index=1,
                    config={
                        "src": left_panel["image"],
                        "alt": "Promotional image",
                    },
                    created_at=now,
                    updated_at=now,
                )
            )

        # Bottom text module
        if left_panel.get("bottomText"):
            db.add(
                BuilderModule(
                    id=uuid.uuid4(),
                    section_id=main_section.id,
                    module_type="html",
                    column_index=left_col,
                    sort_index=2,
                    config={
                        "code": left_panel["bottomText"],
                    },
                    created_at=now,
                    updated_at=now,
                )
            )

    # Reader module (center column)
    viewport_col = col_map.get("viewport", 1)
    db.add(
        BuilderModule(
            id=uuid.uuid4(),
            section_id=main_section.id,
            module_type="reader",
            column_index=viewport_col,
            sort_index=0,
            config={
                "showPanels": False,  # Panels are separate modules now
                "showComments": True,
                "showGalleryButton": True,
            },
            created_at=now,
            updated_at=now,
        )
    )

    # Right panel modules (column 2 by default, or based on order)
    right_col = col_map.get("right", 2)
    if right_enabled:
        # Image module
        if right_panel.get("image"):
            db.add(
                BuilderModule(
                    id=uuid.uuid4(),
                    section_id=main_section.id,
                    module_type="image",
                    column_index=right_col,
                    sort_index=0,
                    config={
                        "src": right_panel["image"],
                        "alt": "Banner image",
                    },
                    created_at=now,
                    updated_at=now,
                )
            )

        # Social buttons module
        if right_panel.get("buttons"):
            db.add(
                BuilderModule(
                    id=uuid.uuid4(),
                    section_id=main_section.id,
                    module_type="social",
                    column_index=right_col,
                    sort_index=1,
                    config={
                        "buttons": right_panel["buttons"],
                    },
                    created_at=now,
                    updated_at=now,
                )
            )

    # SessionLocal disables autoflush. Persist the complete migrated graph before
    # recovery serialization, but leave commit ownership with run_migration().
    db.flush()
    capture_page_snapshot(db, page.id, PAGE_CREATED, actor_user_id=None)
    return page


def run_migration():
    """Run the migration for all existing PageConfig entries."""
    db = SessionLocal()
    try:
        # Get all series
        series_list = db.scalars(select(Series).where(Series.active == True)).all()  # noqa: E712

        print(f"Found {len(series_list)} active series")

        for series in series_list:
            print(f"\nProcessing series: {series.id}")

            # Get the PageConfig for this series
            page_config = db.get(PageConfig, series.id)
            if not page_config:
                print(f"  No PageConfig found for {series.id}, creating default reader page")
                config = {}
            else:
                config = page_config.content or {}

            # Migrate to page builder
            page = migrate_page_config_to_builder(db, series.id, config)
            if page:
                print(f"  Created reader page: {page.id}")

        db.commit()
        print("\nMigration complete!")

    except Exception as e:
        db.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run_migration()
