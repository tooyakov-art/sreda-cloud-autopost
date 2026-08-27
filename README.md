# SREDA Cloud Autopost

Production-автопубликатор `@sreda.astana` через официальные Instagram Content Publishing API и Threads API.

Он работает в GitHub Actions и не зависит от включённого компьютера. Текущий период расписания: **23–31 августа 2026**, часовой пояс **Asia/Qyzylorda (UTC+5)**.

## Что здесь находится

- `tools/sreda-instagram-publisher/` — проверяемый Node.js runner и тесты.
- `.github/workflows/sreda-cloud-autopost.yml` — единственный production scheduler.
- `content/*.enc` — только AES-256-зашифрованные утверждённые медиапакеты.
- Тексты Threads сохранены в исходниках runner, но их автопубликация отключена.

Токенов, паролей, открытых клиентских изображений, WhatsApp и личных данных в репозитории нет.

## Как работает публикация

`GitHub cron → локальный слот UTC+5 → расшифровка во временном runner → временный HTTPS staging → Meta API → проверка ответа → уничтожение runner`

Если для даты и времени нет точного действия, job завершается без публикации. Ручной `Run workflow` запускает только безопасную проверку аккаунтов и staging — ничего не публикует.

## Активные слоты

| Локально | Канал |
|---:|---|
| 08:00 | Stories |
| 11:00 | Instagram-карусель, если запланирована |
| 11:30 | Stories |
| 14:30 | Stories |
| 18:00 | Instagram-карусель, если запланирована |
| 18:30 | Stories |
| 21:00 | Stories |

Автопубликация Threads отключена 27 августа 2026 года. Даже при ручном вызове runner не публикует Threads без отдельного значения `SREDA_THREADS_AUTOPUBLISH_ENABLED=true`.

## Документация

- [Operations: настройка, обновление, проверка и сбои](docs/OPERATIONS.md)
- [Чек-лист добавления контента](docs/CONTENT_UPDATE_CHECKLIST.md)
- [Правила безопасности](SECURITY.md)

## Главные запреты

- Не коммитить secrets и незашифрованные медиа.
- Не включать второй scheduler: Windows Task, ChatGPT heartbeat и private workflow должны оставаться выключенными.
- Не перезапускать scheduled live-job, пока Instagram/Threads не проверен на уже созданную публикацию.
- Не менять контент без статуса `APPROVED` в приватном источнике истины.
