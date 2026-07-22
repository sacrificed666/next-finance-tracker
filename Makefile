# ==============================================================================
# 🧾 Finance tracker — orchestration
# ------------------------------------------------------------------------------
# Every environment = the base compose file + one overlay from ./docker.
# Run `make` (or `make help`) for the full command list.
# ==============================================================================

SHELL := /bin/bash
.DEFAULT_GOAL := help

# ─────────────────────────────── 🎨 formatting ────────────────────────────────
BOLD   := \033[1m
DIM    := \033[2m
RED    := \033[31m
GREEN  := \033[32m
YELLOW := \033[33m
BLUE   := \033[34m
CYAN   := \033[36m
RESET  := \033[0m

DEV_TAG   := $(BLUE)[DEV]$(RESET)
STAGE_TAG := $(YELLOW)[STAGE]$(RESET)
PROD_TAG  := $(RED)[PROD]$(RESET)

# ─────────────────────────────── ⚙️ compose wiring ────────────────────────────
COMPOSE      := docker compose
BASE_FILE    := docker-compose.yml
DEV_FILES    := -f $(BASE_FILE) -f docker/development.yml
STAGE_FILES  := -f $(BASE_FILE) -f docker/staging.yml
PROD_FILES   := -f $(BASE_FILE) -f docker/production.yml

# separate project names so environments can run side by side
DEV    := $(COMPOSE) -p finance-dev   $(DEV_FILES)
STAGE  := $(COMPOSE) -p finance-stage $(STAGE_FILES)
PROD   := $(COMPOSE) -p finance-prod  $(PROD_FILES)

# database credentials for psql/dump targets (read from .env, with fallbacks)
PG_USER := $(shell grep -E '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2-)
PG_DB   := $(shell grep -E '^POSTGRES_DB=' .env 2>/dev/null | cut -d= -f2-)
PG_USER := $(if $(PG_USER),$(PG_USER),finance)
PG_DB   := $(if $(PG_DB),$(PG_DB),finance_tracker)

BACKUP_DIR := backups
STAMP      := $(shell date +%Y%m%d-%H%M%S)

.PHONY: help env check doctor \
        dev-build dev-up dev-down dev-restart dev-logs dev-ps dev-shell dev-psql \
        dev-migrate dev-db-backup dev-db-restore dev-destroy dev-deploy \
        stage-build stage-up stage-down stage-restart stage-logs stage-ps stage-shell \
        stage-psql stage-migrate stage-db-backup stage-db-restore stage-destroy stage-deploy \
        prod-build prod-up prod-down prod-restart prod-logs prod-ps prod-shell prod-psql \
        prod-migrate prod-db-backup prod-db-restore prod-destroy prod-deploy \
        lint typecheck build config prune clean

# ==============================================================================
##@ ℹ️  General
# ==============================================================================

help: ## 📖 Show this help
	@printf "\n$(BOLD)🧾 Finance tracker$(RESET) $(DIM)— docker orchestration$(RESET)\n\n"
	@awk 'BEGIN {FS = ":.*##"} \
		/^##@/ { printf "\n$(BOLD)%s$(RESET)\n", substr($$0, 5); next } \
		/^[a-zA-Z0-9_-]+:.*?##/ { printf "  $(CYAN)%-20s$(RESET) %s\n", $$1, $$2 }' \
		$(MAKEFILE_LIST)
	@printf "\n$(DIM)Environments run side by side under separate compose projects:\n"
	@printf "  finance-dev · finance-stage · finance-prod$(RESET)\n\n"

env: .env ## 🔐 Create .env from .env.example when missing
	@printf "$(GREEN)✅ .env is ready$(RESET)\n"

# only runs when .env does not exist — never overwrites your local secrets
.env:
	@if [ ! -f .env.example ]; then \
		printf "$(RED)❌ .env.example is missing — cannot bootstrap .env$(RESET)\n"; exit 1; \
	fi
	@cp .env.example .env
	@printf "$(GREEN)🆕 Created .env from .env.example$(RESET)\n"
	@printf "$(YELLOW)⚠️ Review it and change POSTGRES_PASSWORD before staging/production!$(RESET)\n"

check: ## 🩺 Verify docker, compose and .env are in place
	@printf "$(BOLD)🩺 Environment check$(RESET)\n"
	@command -v docker >/dev/null 2>&1 \
		&& printf "  $(GREEN)✅ docker$(RESET)    %s\n" "$$(docker --version)" \
		|| { printf "  $(RED)❌ docker is not installed$(RESET)\n"; exit 1; }
	@docker compose version >/dev/null 2>&1 \
		&& printf "  $(GREEN)✅ compose$(RESET)   %s\n" "$$(docker compose version --short)" \
		|| { printf "  $(RED)❌ docker compose v2 is required$(RESET)\n"; exit 1; }
	@docker info >/dev/null 2>&1 \
		&& printf "  $(GREEN)✅ daemon$(RESET)    running\n" \
		|| { printf "  $(RED)❌ the docker daemon is not reachable$(RESET)\n"; exit 1; }
	@[ -f .env ] \
		&& printf "  $(GREEN)✅ .env$(RESET)      present\n" \
		|| printf "  $(YELLOW)⚠️ .env missing — run 'make env'$(RESET)\n"

doctor: check ## 🔎 Alias for check

config: env ## 🧾 Render the merged compose config of every environment
	@printf "$(DEV_TAG) 🧾 rendering merged config…\n";   $(DEV) config -q   && printf "  $(GREEN)✅ valid$(RESET)\n"
	@printf "$(STAGE_TAG) 🧾 rendering merged config…\n"; $(STAGE) config -q && printf "  $(GREEN)✅ valid$(RESET)\n"
	@printf "$(PROD_TAG) 🧾 rendering merged config…\n";  $(PROD) config -q  && printf "  $(GREEN)✅ valid$(RESET)\n"

# ==============================================================================
##@ 🛠️  Development [DEV]
# ==============================================================================

dev-build: env ## 🏗️  Build the dev image
	@printf "$(DEV_TAG) 🏗️  building image…\n"
	@$(DEV) build
	@printf "$(DEV_TAG) $(GREEN)✅ build finished$(RESET)\n"

dev-up: env ## 🚀 Start the dev stack (hot reload, detached)
	@printf "$(DEV_TAG) 🚀 starting stack…\n"
	@$(DEV) up -d --build
	@printf "$(DEV_TAG) $(GREEN)✅ up$(RESET) → $(BOLD)http://localhost:$${APP_PORT:-3000}$(RESET)\n"
	@printf "$(DEV_TAG) $(DIM)follow logs with: make dev-logs$(RESET)\n"

dev-down: ## 🛑 Stop the dev stack (data kept)
	@printf "$(DEV_TAG) 🛑 stopping…\n"
	@$(DEV) down
	@printf "$(DEV_TAG) $(GREEN)✅ stopped$(RESET)\n"

dev-restart: ## 🔄 Restart dev services
	@printf "$(DEV_TAG) 🔄 restarting…\n"
	@$(DEV) restart
	@printf "$(DEV_TAG) $(GREEN)✅ restarted$(RESET)\n"

dev-logs: ## 📜 Follow dev logs
	@printf "$(DEV_TAG) 📜 tailing logs (ctrl-c to stop)…\n"
	@$(DEV) logs -f --tail=100

dev-ps: ## 📋 Show dev containers
	@printf "$(DEV_TAG) 📋 containers\n"
	@$(DEV) ps

dev-shell: ## 🐚 Open a shell in the dev app container
	@printf "$(DEV_TAG) 🐚 opening shell…\n"
	@$(DEV) exec app sh

dev-psql: ## 🐘 Open psql against the dev database
	@printf "$(DEV_TAG) 🐘 psql → $(PG_DB)\n"
	@$(DEV) exec db psql -U $(PG_USER) -d $(PG_DB)

dev-migrate: ## 🧬 Apply db/schema.sql to the dev database
	@printf "$(DEV_TAG) 🧬 applying schema…\n"
	@$(DEV) exec -T db psql -v ON_ERROR_STOP=1 -U $(PG_USER) -d $(PG_DB) < db/schema.sql
	@printf "$(DEV_TAG) $(GREEN)✅ schema applied$(RESET)\n"

dev-db-backup: ## 💾 Dump the dev database into ./backups
	@mkdir -p $(BACKUP_DIR)
	@printf "$(DEV_TAG) 💾 dumping database…\n"
	@$(DEV) exec -T db pg_dump -U $(PG_USER) -d $(PG_DB) > $(BACKUP_DIR)/dev-$(STAMP).sql
	@printf "$(DEV_TAG) $(GREEN)✅ saved$(RESET) $(BACKUP_DIR)/dev-$(STAMP).sql\n"

dev-db-restore: ## ♻️  Restore the dev database (FILE=backups/dev-....sql)
	@[ -n "$(FILE)" ] || { printf "$(RED)❌ pass FILE=backups/dev-….sql$(RESET)\n"; exit 1; }
	@printf "$(DEV_TAG) ♻️  restoring from $(FILE)…\n"
	@$(DEV) exec -T db psql -v ON_ERROR_STOP=1 -U $(PG_USER) -d $(PG_DB) < $(FILE)
	@printf "$(DEV_TAG) $(GREEN)✅ restored$(RESET)\n"

dev-destroy: ## 💣 Stop the dev stack and delete its database volume
	@printf "$(DEV_TAG) $(RED)💣 removing containers and volumes…$(RESET)\n"
	@$(DEV) down -v
	@printf "$(DEV_TAG) $(GREEN)✅ destroyed$(RESET)\n"

dev-deploy: env dev-build dev-up dev-migrate ## 📦 Full dev roll-out (build → up → migrate)
	@printf "$(DEV_TAG) $(GREEN)🎉 deployment complete$(RESET)\n"

# ==============================================================================
##@ 🧪 Staging [STAGE]
# ==============================================================================

stage-build: env ## 🏗️  Build the staging image
	@printf "$(STAGE_TAG) 🏗️  building image…\n"
	@$(STAGE) build
	@printf "$(STAGE_TAG) $(GREEN)✅ build finished$(RESET)\n"

stage-up: env ## 🚀 Start the staging stack (detached)
	@printf "$(STAGE_TAG) 🚀 starting stack…\n"
	@$(STAGE) up -d --build
	@printf "$(STAGE_TAG) $(GREEN)✅ up$(RESET) → $(BOLD)http://localhost:$${APP_PORT:-3001}$(RESET)\n"

stage-down: ## 🛑 Stop the staging stack (data kept)
	@printf "$(STAGE_TAG) 🛑 stopping…\n"
	@$(STAGE) down
	@printf "$(STAGE_TAG) $(GREEN)✅ stopped$(RESET)\n"

stage-restart: ## 🔄 Restart staging services
	@printf "$(STAGE_TAG) 🔄 restarting…\n"
	@$(STAGE) restart
	@printf "$(STAGE_TAG) $(GREEN)✅ restarted$(RESET)\n"

stage-logs: ## 📜 Follow staging logs
	@printf "$(STAGE_TAG) 📜 tailing logs (ctrl-c to stop)…\n"
	@$(STAGE) logs -f --tail=100

stage-ps: ## 📋 Show staging containers
	@printf "$(STAGE_TAG) 📋 containers\n"
	@$(STAGE) ps

stage-shell: ## 🐚 Open a shell in the staging app container
	@printf "$(STAGE_TAG) 🐚 opening shell…\n"
	@$(STAGE) exec app sh

stage-psql: ## 🐘 Open psql against the staging database
	@printf "$(STAGE_TAG) 🐘 psql → $(PG_DB)\n"
	@$(STAGE) exec db psql -U $(PG_USER) -d $(PG_DB)

stage-migrate: ## 🧬 Apply db/schema.sql to the staging database
	@printf "$(STAGE_TAG) 🧬 applying schema…\n"
	@$(STAGE) exec -T db psql -v ON_ERROR_STOP=1 -U $(PG_USER) -d $(PG_DB) < db/schema.sql
	@printf "$(STAGE_TAG) $(GREEN)✅ schema applied$(RESET)\n"

stage-db-backup: ## 💾 Dump the staging database into ./backups
	@mkdir -p $(BACKUP_DIR)
	@printf "$(STAGE_TAG) 💾 dumping database…\n"
	@$(STAGE) exec -T db pg_dump -U $(PG_USER) -d $(PG_DB) > $(BACKUP_DIR)/stage-$(STAMP).sql
	@printf "$(STAGE_TAG) $(GREEN)✅ saved$(RESET) $(BACKUP_DIR)/stage-$(STAMP).sql\n"

stage-db-restore: ## ♻️  Restore the staging database (FILE=…)
	@[ -n "$(FILE)" ] || { printf "$(RED)❌ pass FILE=backups/stage-….sql$(RESET)\n"; exit 1; }
	@printf "$(STAGE_TAG) ♻️  restoring from $(FILE)…\n"
	@$(STAGE) exec -T db psql -v ON_ERROR_STOP=1 -U $(PG_USER) -d $(PG_DB) < $(FILE)
	@printf "$(STAGE_TAG) $(GREEN)✅ restored$(RESET)\n"

stage-destroy: ## 💣 Stop staging and delete its database volume
	@printf "$(STAGE_TAG) $(RED)💣 removing containers and volumes…$(RESET)\n"
	@$(STAGE) down -v
	@printf "$(STAGE_TAG) $(GREEN)✅ destroyed$(RESET)\n"

stage-deploy: env stage-build stage-up stage-migrate ## 📦 Full staging roll-out
	@printf "$(STAGE_TAG) $(GREEN)🎉 deployment complete$(RESET)\n"

# ==============================================================================
##@ 🚀 Production [PROD]
# ==============================================================================

prod-build: env ## 🏗️  Build the production image
	@printf "$(PROD_TAG) 🏗️  building image…\n"
	@$(PROD) build
	@printf "$(PROD_TAG) $(GREEN)✅ build finished$(RESET)\n"

prod-up: env ## 🚀 Start the production stack (detached)
	@printf "$(PROD_TAG) 🚀 starting stack…\n"
	@$(PROD) up -d --build
	@printf "$(PROD_TAG) $(GREEN)✅ up$(RESET) → $(BOLD)http://localhost:$${APP_PORT:-3000}$(RESET)\n"

prod-down: ## 🛑 Stop production (data kept)
	@printf "$(PROD_TAG) 🛑 stopping…\n"
	@$(PROD) down
	@printf "$(PROD_TAG) $(GREEN)✅ stopped$(RESET)\n"

prod-restart: ## 🔄 Restart production services
	@printf "$(PROD_TAG) 🔄 restarting…\n"
	@$(PROD) restart
	@printf "$(PROD_TAG) $(GREEN)✅ restarted$(RESET)\n"

prod-logs: ## 📜 Follow production logs
	@printf "$(PROD_TAG) 📜 tailing logs (ctrl-c to stop)…\n"
	@$(PROD) logs -f --tail=100

prod-ps: ## 📋 Show production containers
	@printf "$(PROD_TAG) 📋 containers\n"
	@$(PROD) ps

prod-shell: ## 🐚 Open a shell in the production app container
	@printf "$(PROD_TAG) 🐚 opening shell…\n"
	@$(PROD) exec app sh

prod-psql: ## 🐘 Open psql against the production database
	@printf "$(PROD_TAG) 🐘 psql → $(PG_DB)\n"
	@$(PROD) exec db psql -U $(PG_USER) -d $(PG_DB)

prod-migrate: ## 🧬 Apply db/schema.sql to the production database
	@printf "$(PROD_TAG) 🧬 applying schema…\n"
	@$(PROD) exec -T db psql -v ON_ERROR_STOP=1 -U $(PG_USER) -d $(PG_DB) < db/schema.sql
	@printf "$(PROD_TAG) $(GREEN)✅ schema applied$(RESET)\n"

prod-db-backup: ## 💾 Dump the production database into ./backups
	@mkdir -p $(BACKUP_DIR)
	@printf "$(PROD_TAG) 💾 dumping database…\n"
	@$(PROD) exec -T db pg_dump -U $(PG_USER) -d $(PG_DB) > $(BACKUP_DIR)/prod-$(STAMP).sql
	@printf "$(PROD_TAG) $(GREEN)✅ saved$(RESET) $(BACKUP_DIR)/prod-$(STAMP).sql\n"

prod-db-restore: ## ♻️  Restore the production database (FILE=…)
	@[ -n "$(FILE)" ] || { printf "$(RED)❌ pass FILE=backups/prod-….sql$(RESET)\n"; exit 1; }
	@printf "$(PROD_TAG) $(YELLOW)⚠️ restoring over live data from $(FILE)$(RESET)\n"
	@$(PROD) exec -T db psql -v ON_ERROR_STOP=1 -U $(PG_USER) -d $(PG_DB) < $(FILE)
	@printf "$(PROD_TAG) $(GREEN)✅ restored$(RESET)\n"

prod-destroy: ## 💣 Stop production and delete its database volume (asks first)
	@printf "$(PROD_TAG) $(RED)💣 this deletes the production database volume.$(RESET)\n"
	@read -p "   Type 'destroy production' to confirm: " answer; \
	 if [ "$$answer" = "destroy production" ]; then \
	   $(PROD) down -v; printf "$(PROD_TAG) $(GREEN)✅ destroyed$(RESET)\n"; \
	 else printf "$(PROD_TAG) $(GREEN)🛟 aborted — nothing was removed$(RESET)\n"; fi

prod-deploy: env prod-db-backup prod-build prod-up prod-migrate ## 📦 Full production roll-out (backup → build → up → migrate)
	@printf "$(PROD_TAG) $(GREEN)🎉 deployment complete$(RESET)\n"
	@$(PROD) ps

# ==============================================================================
##@ 🧰 Local tooling (no docker)
# ==============================================================================

lint: ## 🧹 Run ESLint
	@printf "🧹 linting…\n" && npx eslint .

typecheck: ## 🔍 Run the TypeScript compiler
	@printf "🔍 typechecking…\n" && npx tsc --noEmit

build: ## 📦 Build the app on the host
	@printf "📦 building…\n" && npm run build

# ==============================================================================
##@ 🧽 Housekeeping
# ==============================================================================

clean: ## 🧽 Remove local build artefacts
	@printf "🧽 removing .next and caches…\n"
	@rm -rf .next out
	@printf "$(GREEN)✅ clean$(RESET)\n"

prune: ## 🗑️  Prune dangling docker images, containers and networks
	@printf "🗑️  pruning docker leftovers…\n"
	@docker system prune -f
	@printf "$(GREEN)✅ pruned$(RESET)\n"
