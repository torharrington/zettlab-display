# NAS LCD Dashboard — task shortcuts.
# Run `make help` for the list.

IMAGE       ?= nas-lcd-dashboard:latest
COMPOSE     ?= docker compose
# For deploying/testing on a NAS over SSH (override as needed):
NAS_HOST    ?= tor@192.168.30.216
NAS_DIR     ?= ~/nas-lcd-dashboard

.DEFAULT_GOAL := help

## help: show this help
.PHONY: help
help:
	@echo "NAS LCD Dashboard — make targets:"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /'

## preview: build docs/preview.html (open in a browser to iterate on design, no NAS)
.PHONY: preview
preview:
	node docs/preview.js

## preview-open: build the preview and open it in the default browser
.PHONY: preview-open
preview-open:
	node docs/preview.js --open

## render: regenerate docs/dashboard-example.png from the current UI (headless Chrome)
.PHONY: render
render:
	node docs/render.js

## build: build the Docker image
.PHONY: build
build:
	$(COMPOSE) build

## up: build + start the dashboard container (serves 127.0.0.1:8080)
.PHONY: up
up:
	$(COMPOSE) up -d --build

## down: stop and remove the dashboard container
.PHONY: down
down:
	$(COMPOSE) down

## logs: follow the container logs
.PHONY: logs
logs:
	$(COMPOSE) logs -f

## stats: fetch the live /api/stats JSON (needs the container running)
.PHONY: stats
stats:
	@curl -s http://127.0.0.1:8080/api/stats | (python3 -m json.tool 2>/dev/null || cat)

## deploy: copy the project to the NAS over SSH (NAS_HOST, NAS_DIR)
.PHONY: deploy
deploy:
	tar czf - app.py static docker-compose.yml Dockerfile | \
		ssh $(NAS_HOST) 'mkdir -p $(NAS_DIR) && tar xzf - -C $(NAS_DIR) && \
		cd $(NAS_DIR) && $(COMPOSE) up -d --build'

## clean: remove generated preview/render artefacts (keeps committed PNG)
.PHONY: clean
clean:
	rm -f docs/preview.html docs/_render.html
