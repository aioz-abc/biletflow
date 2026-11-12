# BiletFlow

Учебная платформа событий и билетов для Казахстана. Backend: Django + DRF +
PostgreSQL, frontend: React + Vite + Tailwind, мобильный сканер: React Native
(`mobile/`). Одна команда поднимает базу, API и веб-приложение вместе.

Актуальные маршруты, JSON-примеры и ограничения: [Backend MVP API](docs/BACKEND_MVP_API.md).

## Быстрый запуск

Нужен запущенный Docker Desktop с Docker Compose.

```bash
docker compose up --build -d --wait
docker compose exec -T web python manage.py seed_demo
```

Затем откройте [localhost:5173](http://localhost:5173) — веб-приложение для
посетителей и организаторов; админка Мирата — [localhost:5173/admin](http://localhost:5173/admin).
`seed_demo` печатает демо-аккаунты (пароль `Demo-pass-2026!`) и события.
При первом запуске Docker скачает образы, Python- и npm-зависимости (до пары
минут). Compose дождётся PostgreSQL, применит миграции и запустит Django, а
затем Vite dev server, который проксирует `/api` и ссылки Campaign QR `/c/` в
backend.

- Веб-приложение: [localhost:5173](http://localhost:5173)
- API health: [localhost:8000/api/health](http://localhost:8000/api/health), ответ `{"status":"ok","database":"ok"}`
- Внутренняя Django admin: [localhost:8000/django-admin/](http://localhost:8000/django-admin/) (`/admin` занят админкой Мирата во фронтенде)
- Логи: `docker compose logs -f web` (письма тоже здесь) и `docker compose logs -f frontend`
- Состояние: `docker compose ps`
- Остановка с сохранением данных: `docker compose down`

Web и frontend привязаны к `127.0.0.1`; PostgreSQL не публикуется на порту компьютера.
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

Если порт 8000 или 5173 занят:

```bash
BACKEND_PORT=8001 FRONTEND_PORT=5174 docker compose up -d --wait
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
| JWT, подтверждение email, восстановление пароля и роли, включая сотрудников события | UI подтверждения email |
| События, типы билетов, промокоды и Campaign QR, возвраты, временные резервы, поддержка | Рассадка (по SRS вырезается первой) |
| Активация платных продаж, симуляция checkout, имя посетителя на билете, письма, PDF-билеты, однократный check-in | Реальная оплата (вне рамок MVP) |
| Сводка продаж и аналитика события по дням (`/events/{id}/analytics`); админка: пользователи, события, активации | Дашборд аналитики Мирата на этом API |
| PostgreSQL, миграции, Docker Compose со всеми сервисами, API/конкурентные тесты и CI | Публичный production-деплой |

Полная проверка через реальный HTTP API:

```bash
docker compose exec -T web python demo_mvp.py
```

Готовые демо-данные для всей команды (аккаунты, три события, промокод
`DEMO10`, оформленные заказы); повторный запуск ничего не дублирует:

```bash
docker compose exec -T web python manage.py seed_demo
```

Команда создаёт свежие demo-аккаунты и событие, покупает билет и проверяет
однократный проход. Demo-записи сохраняются в локальной БД. Оплата — только
симуляция; реальных списаний нет. Старые документы первого этапа сохранены
как история, актуальный контракт находится в `docs/BACKEND_MVP_API.md`.

## Деплой на Heroku

Живое демо: <https://begemot-b8b43e7ea8ea.herokuapp.com> (приложение `begemot`,
регион EU, Basic dyno + Postgres Essential-0, ~$12/мес из студенческих кредитов).

Production-сборка — один контейнер (`Dockerfile.heroku`): Vite собирает React,
Django + WhiteNoise отдают его с того же домена, что и `/api`, gunicorn обслуживает
запросы. Django admin — на `/django-admin/`, `/admin` — админка Мирата во фронтенде.
Config vars: `DATABASE_URL` (от аддона), `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`,
`FRONTEND_BASE_URL`, `DEMO_PASSWORD`.

Новая версия (нужны Docker, Heroku CLI и `heroku login`). Образ собирается локально
и загружается в Heroku Container Registry: `git push heroku` с git из Xcode на macOS
не работает (известная ошибка Apple Git-146).

```bash
heroku container:login
docker buildx build --platform linux/amd64 --provenance=false --sbom=false \
  -f Dockerfile.heroku -t registry.heroku.com/begemot/web \
  --output type=registry,oci-mediatypes=false .
heroku container:release web -a begemot
heroku run:detached -a begemot -- python manage.py migrate --noinput
```

С обычным git (Linux, git с git-scm.com) работает и `git push heroku <ветка>:main`:
тогда `heroku.yml` собирает тот же образ и сам запускает миграции.

Демо-данные (пароль демо-аккаунтов хранится только в config var `DEMO_PASSWORD`,
посмотреть: `heroku config:get DEMO_PASSWORD -a begemot`):

```bash
heroku run:detached -a begemot -- 'sh -c "python manage.py seed_demo --password \"$DEMO_PASSWORD\""'
```

Остановить расходы: `heroku ps:scale web=0 -a begemot` (dyno не тарифицируется);
база Essential-0 списывает до $5/мес, пока не удалена — перед удалением
`heroku pg:backups:capture`. Письма — симуляция, видны в `heroku logs --tail`.
Мобильному приложению нужно указать адрес Heroku вместо `localhost:8000`.

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
- [Отчёт по второму этапу](docs/REPORT_Nursat_Phase2.md)
