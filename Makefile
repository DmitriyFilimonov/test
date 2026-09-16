COMPOSE := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

.PHONY: up down build clean

up:
	$(COMPOSE) rm -sf
	$(COMPOSE) build
	$(COMPOSE) up

down:
	$(COMPOSE) down

build:
	$(COMPOSE) build

clean:
	$(COMPOSE) down -v --rmi local --remove-orphans
