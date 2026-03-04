.DEFAULT_GOAL := up

ENV_FILE ?= .env.local

.PHONY: up dev build start env deps clean lint format typecheck docker-up docker-down

env:
	@if [ ! -f "$(ENV_FILE)" ] && [ ! -f ".env" ]; then \
		cp .env.example "$(ENV_FILE)"; \
		echo "Created $(ENV_FILE) from .env.example. Update values as needed."; \
	fi

deps: node_modules

node_modules: package.json package-lock.json
	npm install

up: env node_modules
	npm run dev

dev: up

build: env node_modules
	npm run build

start: env node_modules
	npm run start

lint: node_modules
	npm run lint

format: node_modules
	npm run format

typecheck: node_modules
	npm run typecheck

clean:
	npm run clean

docker-up:
	@if [ -z "$$NEXT_PUBLIC_SITE_URL" ]; then \
		echo "NEXT_PUBLIC_SITE_URL is required (e.g. NEXT_PUBLIC_SITE_URL=https://example.com)"; \
		exit 1; \
	fi
	docker compose -f deploy/docker-compose.yml up -d --build

docker-down:
	docker compose -f deploy/docker-compose.yml down
