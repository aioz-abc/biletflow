# Нурсат — второй этап, отчёт к 28 сентября

Подготовлено 24 сентября 2026 года. Ветка реализации: `codex/auth-phase2`.

## Результат

- Работают регистрация, подтверждение email, вход, обновление и отзыв JWT,
  восстановление пароля и `/api/auth/me`.
- Письма с одноразовыми токенами в локальной разработке отправляются через
  Django console email. Токены не возвращаются в API. Повторная выдача
  отменяет старый токен; подтверждение email действует 24 часа, сброс пароля
  — 1 час. Смена пароля делает прежние access и refresh JWT недействительными.
- Роли `attendee`, `organizer`, `event_admin` и `platform_admin` вычисляются из
  текущей БД. Организатор назначает администратора для одного события через
  `/api/events/{id}/staff`. Назначение даёт доступ к списку посетителей и
  проверке/отметке QR только этого события, без права менять событие.
- Docker Compose запускает Django и PostgreSQL, применяет миграции и
  проверяет `/api/health`. GitHub Actions запускает Compose, Django tests,
  проверку миграций и Ruff на backend PR.

## Командная интеграция

- Проверены и объединены [PR #8](https://github.com/aioz-abc/biletflow/pull/8)
  с распределением ответственности, [PR #6](https://github.com/aioz-abc/biletflow/pull/6)
  с полями и видимостью событий, [PR #7](https://github.com/aioz-abc/biletflow/pull/7)
  с возвратами, промокодами, аудитом и Campaign QR. Все три объединены в `dev`
  после успешной backend CI.
- Для Campaign QR проверен браузерный путь: ссылка открывает событие с
  промокодом, предварительный расчёт показывает скидку, тестовая оплата
  выдаёт билет и QR. Страница `/events/:id` реализует этот путь.
- `backend/demo_mvp.py` создаёт демо-аккаунты и событие, оформляет билет и
  проверяет однократный check-in через HTTP API.

## Проверка

Команды выполнялись на PostgreSQL в отдельном локальном Compose-проекте:

```sh
docker compose exec -T web python manage.py check
docker compose exec -T web python manage.py makemigrations --check --dry-run
docker compose exec -T web python manage.py test --noinput
docker compose exec -T web ruff check .
docker compose exec -T web ruff format --check .
docker compose exec -T web python demo_mvp.py
```

Полный набор: **57 тестов**, включая сценарии подтверждения email, сброса
пароля и отзыва JWT, права назначенного администратора события, конкурентный
промокод и миграцию старых заказов. Реальный HTTP smoke test подтвердил
`register` 201, `login` 200, `/auth/me` 200 и запрос сброса пароля 200.

## Демо 28 сентября

1. Запустить `docker compose up --build -d --wait` и открыть `/api/health`.
2. Зарегистрировать посетителя через `/api/auth/register`; в
   `docker compose logs web` найти проверочный токен для этого локального
   аккаунта и отправить его в `/api/auth/verify-email`.
3. Выполнить login и `/api/auth/me`; показать роли. Запросить восстановление
   пароля, подтвердить его токеном из console email и показать, что прежний
   JWT больше не работает.
4. Запустить `docker compose exec -T web python demo_mvp.py` для оформления
   билета и проверки входа. Назначить администратора одного события через
   `/api/events/{id}/staff`; показать разрешённый check-in и 404 для другого
   события.
5. Показать успешную CI для backend PR и браузерный Campaign QR сценарий.

Платёж и возврат остаются симуляцией без внешнего платёжного провайдера.
Верификация email хранится отдельно от блокировки аккаунта; для этого
учебного MVP публикация события не требует подтверждённого email.
