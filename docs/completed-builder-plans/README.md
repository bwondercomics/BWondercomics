# Completed Builder Plans

This folder contains finished page-builder implementation plans and roadmaps. They are retained as
implementation history, contract rationale, completion evidence, and migration/QA records. Current
runtime behavior and source code remain authoritative when an older discovery-time path or line
number has drifted.

Completed plans:

- [Builder Plan](BUILDER_PLAN.md) — historical architecture and canonicalization work.
- [Builder Preview Parity Plan](BUILDER_PREVIEW_PARITY_PLAN.md) — iframe preview fidelity and
  release gates.
- [Full-Page Live Builder Plan, Part 1](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md) and
  [Part 2](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN_P2.md) — the shipped live authoring surface.
- [Reader Block and Layout Customization Plan](READER_BLOCK_AND_LAYOUT_CUSTOMIZATION_PLAN.md) —
  reader ownership, display modes, columns, and responsive layout.
- [Builder Inspector Menu UI Plan](BUILDER_INSPECTOR_MENU_UI_PLAN.md) — completed inspector density
  and accessibility work.
- [Panel / Column Settings Consolidation Plan](PANEL_COLUMN_SETTINGS_CONSOLIDATION_PLAN.md) —
  column-owned panel settings, migrations, and release QA.
- [Builder Incremental Improvement Plan](BUILDER_INCREMENTAL_IMPROVEMENT_PLAN.md) — page-end,
  duplicate-module, and droppable-empty-column improvements.
- [Builder Customization Roadmap](BUILDER_CUSTOMIZATION_ROADMAP.md) — customization Phases 0–7 and
  the 0.8.5 corrective QA closeout.
- [Builder Refactor Plan](BUILDER_REFACTOR_PLAN.md) — completed structural cleanup Phases A–G.
- [Builder Page Snapshot and Backup/Restore Hardening Plan](BUILDER_PAGE_SNAPSHOT_AND_BACKUP_HARDENING_PLAN.md)
  — transactional page recovery, validated off-primary-disk artifacts, schedules, and isolated
  restore-drill closeout.

Active or proposed builder work stays in the parent `docs/` directory, including the
[Polish Backlog](../POLISH_BACKLOG_PLAN.md), [Builder Stripe Store Plan](../BUILDER_STRIPE_STORE_PLAN.md),
and [Live Canvas Editor Corrective Plan](../LIVE_CANVAS_EDITOR_CORRECTIVE_PLAN.md).
