.PHONY: help env check-env up down restart ps logs api-logs db-logs migrate api-sh psql backup-runtime backup backup-db backup-files backup-production backup-db-production backup-files-production restore-db restore-files up-analytics analytics-up analytics-stop analytics-logs chat-up chat-stop chat-logs

ENV_FILE ?= deploy/bwondercomics.env
COMPOSE_FILE ?= deploy/bwondercomics-compose.yml
COMPOSE = docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE)

BACKUP_DIR ?= var/backups
BACKUP_ENGINE = ./.venv/bin/python scripts/backup_artifacts.py
BACKUP_RUNTIME_DIR ?= .backup-venv
override PRODUCTION_BACKUP_DIR := /mnt/archive/backups/bwondercomics
override PRODUCTION_BACKUP_STATUS_DIR := /srv/bw-quality/var/diagnostics/backups
override PRODUCTION_BACKUP_ENGINE := /srv/bw-quality/.backup-venv/bin/python /srv/bw-quality/scripts/backup_artifacts.py

help:
	@echo "BWonderComics shortcuts"
	@echo ""
	@echo "  make up              Start/rebuild stack"
	@echo "  make up-analytics     Start stack + Umami"
	@echo "  make chat-up          Start Stoat chat profile services"
	@echo "  make migrate         Run DB migrations"
	@echo "  make logs            Tail all logs"
	@echo "  make api-logs         Tail API logs"
	@echo "  make analytics-logs   Tail Umami logs"
	@echo "  make chat-logs        Tail Stoat chat logs"
	@echo "  make ps              Show container status"
	@echo ""
	@echo "  make backup           Backup DB + files to $(BACKUP_DIR)/"
	@echo "  make backup-runtime   Provision the pinned production backup Python runtime"
	@echo "  make backup-production  Validated DB + files backup to /mnt/archive"
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

up-analytics: check-env
	$(COMPOSE) --profile analytics up -d --build

analytics-up: check-env
	$(COMPOSE) --profile analytics up -d umami umami-db

analytics-stop: check-env
	$(COMPOSE) stop umami umami-db

chat-up: check-env
	$(COMPOSE) --profile chat up -d stoat-mongodb stoat-redis stoat-rabbitmq stoat-api stoat-events stoat-web

chat-stop: check-env
	$(COMPOSE) stop stoat-web stoat-events stoat-delta stoat-api stoat-rabbitmq stoat-redis stoat-mongodb

chat-logs: check-env
	$(COMPOSE) logs -f --tail=200 stoat-web stoat-events stoat-delta stoat-api stoat-rabbitmq

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

analytics-logs: check-env
	$(COMPOSE) logs -f --tail=200 umami

db-logs: check-env
	$(COMPOSE) logs -f --tail=200 bwondercomics-db

migrate: check-env
	$(COMPOSE) exec -T bwondercomics-api alembic -c backend/alembic.ini upgrade head

api-sh: check-env
	$(COMPOSE) exec bwondercomics-api sh

psql: check-env
	$(COMPOSE) exec bwondercomics-db sh -c 'PGPASSWORD=$$POSTGRES_PASSWORD psql -h localhost -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

backup-runtime:
	@test -x "$(BACKUP_RUNTIME_DIR)/bin/python" || python3 -m venv "$(BACKUP_RUNTIME_DIR)"
	"$(BACKUP_RUNTIME_DIR)/bin/python" -m pip install --disable-pip-version-check --requirement scripts/backup-requirements.txt

backup: check-env
	BACKUP_DIR="$(BACKUP_DIR)" REQUIRE_ARCHIVE_MOUNT=0 ENV_FILE="$(abspath $(ENV_FILE))" COMPOSE_FILE="$(abspath $(COMPOSE_FILE))" $(BACKUP_ENGINE) all

backup-db: check-env
	BACKUP_DIR="$(BACKUP_DIR)" REQUIRE_ARCHIVE_MOUNT=0 ENV_FILE="$(abspath $(ENV_FILE))" COMPOSE_FILE="$(abspath $(COMPOSE_FILE))" $(BACKUP_ENGINE) database

backup-files:
	BACKUP_DIR="$(BACKUP_DIR)" REQUIRE_ARCHIVE_MOUNT=0 ENV_FILE="$(abspath $(ENV_FILE))" COMPOSE_FILE="$(abspath $(COMPOSE_FILE))" $(BACKUP_ENGINE) files

backup-production: check-env
	BWC_REPO_ROOT="$(CURDIR)" BACKUP_DIR="$(PRODUCTION_BACKUP_DIR)" REQUIRE_ARCHIVE_MOUNT=1 BACKUP_STATUS_DIR="$(PRODUCTION_BACKUP_STATUS_DIR)" ENV_FILE="$(abspath $(ENV_FILE))" COMPOSE_FILE="$(abspath $(COMPOSE_FILE))" $(PRODUCTION_BACKUP_ENGINE) all

backup-db-production: check-env
	BWC_REPO_ROOT="$(CURDIR)" BACKUP_DIR="$(PRODUCTION_BACKUP_DIR)" REQUIRE_ARCHIVE_MOUNT=1 BACKUP_STATUS_DIR="$(PRODUCTION_BACKUP_STATUS_DIR)" ENV_FILE="$(abspath $(ENV_FILE))" COMPOSE_FILE="$(abspath $(COMPOSE_FILE))" $(PRODUCTION_BACKUP_ENGINE) database

backup-files-production:
	BWC_REPO_ROOT="$(CURDIR)" BACKUP_DIR="$(PRODUCTION_BACKUP_DIR)" REQUIRE_ARCHIVE_MOUNT=1 BACKUP_STATUS_DIR="$(PRODUCTION_BACKUP_STATUS_DIR)" ENV_FILE="$(abspath $(ENV_FILE))" COMPOSE_FILE="$(abspath $(COMPOSE_FILE))" $(PRODUCTION_BACKUP_ENGINE) files

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
