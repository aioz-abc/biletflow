# BiletFlow

Учебная платформа событий и билетов для Казахстана. Backend: Django + DRF +
PostgreSQL. Backend MVP реализует регистрацию/JWT, события, типы билетов,
резервирование, симуляцию оплаты, QR-билеты и check-in.

Актуальные маршруты, JSON-примеры и ограничения: [Backend MVP API](docs/BACKEND_MVP_API.md).

## Быстрый запуск

Нужен запущенный Docker Desktop с Docker Compose.

```bash
docker compose up --build -d --wait
curl http://localhost:8000/api/health
```

Ожидаемый ответ: `{"status":"ok","database":"ok"}`.
При первом запуске Docker скачает образы и Python-зависимости. Compose
дождётся PostgreSQL и применит миграции перед запуском Django.

- API health: [localhost:8000/api/health](http://localhost:8000/api/health)
- Внутренняя Django admin: [localhost:8000/admin/](http://localhost:8000/admin/)
- Логи: `docker compose logs -f web`
- Состояние: `docker compose ps`
- Остановка с сохранением данных: `docker compose down`

Web привязан к `127.0.0.1`; PostgreSQL не публикуется на порту компьютера.
Данные остаются в Docker volume между запусками. Не используйте `down -v`,
если хотите сохранить локальную базу.

Для входа во внутреннюю админку создайте свой аккаунт:

```bash
docker compose exec web python manage.py createsuperuser
```

Логин — email, пароль задаётся интерактивно. Готовых административных
аккаунтов нет. Django admin — инструмент backend-разработчика; отдельное
React-приложение Мират разрабатывает в своей части проекта.

## Настройки

Локальные значения уже заданы в Compose, поэтому `.env` необязателен.
Чтобы изменить порт или настройки, скопируйте `.env.example` в `.env` в
корне проекта и отредактируйте нужные значения. `.env` исключён из Git.

Если порт 8000 занят:

```bash
BACKEND_PORT=8001 docker compose up -d --wait
```

Тогда откройте `http://localhost:8001/api/health`. После изменения Python-
зависимостей повторите запуск с `--build`. Изменения кода видны контейнеру
через bind mount, Django автоматически перезапускается.

Пример предназначен для локальной разработки: демонстрационные пароли,
`DEBUG=1`, Django development server и console email. Для публичного
развёртывания потребуются отдельные настройки, TLS и секреты. Если база
уже создана, изменение POSTGRES_PASSWORD в `.env` не меняет пароль внутри
существующей базы автоматически.

## Проверки

```bash
docker compose exec web python manage.py check
docker compose exec web python manage.py makemigrations --check --dry-run
docker compose exec web python manage.py test
docker compose exec web ruff check .
docker compose exec web ruff format --check .
```

Тесты создают отдельную PostgreSQL-базу `test_biletflow` (или `test_<POSTGRES_DB>`)
и удаляют её после завершения. Пользователь PostgreSQL в локальном Compose
имеет права для этого. Не направляйте тестовые настройки на production.
GitHub Actions повторяет сборку, запуск и эти проверки для backend PR.

Локальное окружение Python необязательно; вся проверка выполняется в Docker.
Если используете IDE, версия Python — 3.11, зависимости находятся в
`backend/requirements-dev.txt`. Настройки читаются из окружения; Django сам
не загружает корневой `.env` — это делает Compose при подстановке переменных.

## Что готово и что дальше

| Сейчас реализовано | Следующие этапы |
| --- | --- |
| JWT register/login/refresh/logout/me, роли и права владельца | Email verification, password reset и отдельные сотрудники событий |
| События, типы билетов, остатки и временные резервы | Рассадка, промокоды и расширенная аналитика |
| Симуляция checkout, QR-билеты и однократный check-in | Реальная оплата, возвраты и PDF |
| PostgreSQL, миграции, Docker, API/конкурентные тесты и CI | Подключение frontend и публичный production-деплой |

Полная проверка через реальный HTTP API:

```bash
docker compose exec -T web python demo_mvp.py
```

Команда создаёт свежие demo-аккаунты и событие, покупает билет и проверяет
однократный проход. Demo-записи сохраняются в локальной БД. Оплата — только
симуляция; реальных списаний нет. Старые документы первого этапа сохранены
как история, актуальный контракт находится в `docs/BACKEND_MVP_API.md`.

## Документация

- [Инструкция по подключению frontend](docs/FRONTEND_INTEGRATION.md)
- [Актуальный API backend MVP](docs/BACKEND_MVP_API.md)

- [Архитектура и обоснование стека](docs/ARCHITECTURE.md)
- [Модель данных](docs/DATA_MODEL.md)
- [API-контракт](docs/API_CONTRACT.md)
- [Команда](docs/TEAM.md)
- [Общий план](docs/TIMELINE.md)
- [План Нурсата](docs/PLAN_Nursat.md)
- [Отчёт по первому этапу](docs/REPORT_Nursat_Phase1.md)
