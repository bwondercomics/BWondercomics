.PHONY: help env check-env up down restart ps logs api-logs db-logs migrate api-sh psql backup backup-db backup-files restore-db restore-files

ENV_FILE ?= deploy/bwondercomics.env
COMPOSE_FILE ?= deploy/bwondercomics-compose.yml
COMPOSE = docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE)

BACKUP_DIR ?= var/backups

help:
	@echo "BWonderComics shortcuts"
	@echo ""
	@echo "  make up              Start/rebuild stack"
	@echo "  make migrate         Run DB migrations"
	@echo "  make logs            Tail all logs"
	@echo "  make api-logs         Tail API logs"
	@echo "  make ps              Show container status"
	@echo ""
	@echo "  make backup           Backup DB + files to $(BACKUP_DIR)/"
	@echo "  make restore-db FILE=... CONFIRM=1"
	@echo "  make restore-files FILE=... CONFIRM=1"
	@echo ""
	@echo "Env/compose (override if needed):"
	@echo "  ENV_FILE=$(ENV_FILE)"
	@echo "  COMPOSE_FILE=$(COMPOSE_FILE)"

env:
	@test ! -f "$(ENV_FILE)" || (echo "ERROR: $(ENV_FILE) already exists"; exit 1)
	cp deploy/bwondercomics.env.example "$(ENV_FILE)"
	@echo "Created $(ENV_FILE). Fill in APP_SECRET and BWC_DB_PASSWORD, then run: make up && make migrate"

check-env:
	@test -f "$(ENV_FILE)" || (echo "ERROR: Missing $(ENV_FILE). Run: make env"; exit 1)

up: check-env
	$(COMPOSE) up -d --build

down: check-env
	$(COMPOSE) down

restart: check-env
	$(COMPOSE) restart

ps: check-env
	$(COMPOSE) ps

logs: check-env
	$(COMPOSE) logs -f --tail=200

api-logs: check-env
	$(COMPOSE) logs -f --tail=200 bwondercomics-api

db-logs: check-env
	$(COMPOSE) logs -f --tail=200 bwondercomics-db

migrate: check-env
	$(COMPOSE) exec -T bwondercomics-api alembic -c backend/alembic.ini upgrade head

api-sh: check-env
	$(COMPOSE) exec bwondercomics-api sh

psql: check-env
	$(COMPOSE) exec bwondercomics-db sh -c 'PGPASSWORD=$$POSTGRES_PASSWORD psql -h localhost -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

backup: backup-db backup-files

backup-db: check-env
	@mkdir -p "$(BACKUP_DIR)"
	@ts="$$(date +%Y%m%d-%H%M%S)"; \
	out="$(BACKUP_DIR)/db-$$ts.sql"; \
	echo "Writing $$out"; \
	$(COMPOSE) exec -T bwondercomics-db sh -c 'PGPASSWORD=$$POSTGRES_PASSWORD pg_dump -h localhost -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"' > "$$out"

backup-files:
	@mkdir -p "$(BACKUP_DIR)"
	@ts="$$(date +%Y%m%d-%H%M%S)"; \
	out="$(BACKUP_DIR)/files-$$ts.tar.gz"; \
	echo "Writing $$out"; \
	files="chapters comics media admin/page-config.json"; \
	# Include per-series page configs if present.
	if ls admin/series/*/page-config.json >/dev/null 2>&1; then files="$$files admin/series/*/page-config.json"; fi; \
	tar -czf "$$out" $$files

restore-db: check-env
	@test "$(CONFIRM)" = "1" || (echo "ERROR: Refusing to restore without CONFIRM=1"; exit 1)
	@test -n "$(FILE)" || (echo "ERROR: Usage: make restore-db FILE=path/to/db.sql CONFIRM=1"; exit 1)
	@test -f "$(FILE)" || (echo "ERROR: File not found: $(FILE)"; exit 1)
	@echo "Restoring DB from $(FILE)"
	$(COMPOSE) exec -T bwondercomics-db sh -c 'PGPASSWORD=$$POSTGRES_PASSWORD psql -h localhost -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"' < "$(FILE)"

restore-files:
	@test "$(CONFIRM)" = "1" || (echo "ERROR: Refusing to restore without CONFIRM=1"; exit 1)
	@test -n "$(FILE)" || (echo "ERROR: Usage: make restore-files FILE=path/to/files.tar.gz CONFIRM=1"; exit 1)
	@test -f "$(FILE)" || (echo "ERROR: File not found: $(FILE)"; exit 1)
	@echo "Restoring files from $(FILE)"
	tar -xzf "$(FILE)"
