# SREDA Cloud Autopost

Production-автопубликатор `@sreda.astana` через официальные Instagram Content Publishing API и Threads API.

Он работает в GitHub Actions и не зависит от включённого компьютера. Текущий календарь Stories: **29 августа — 30 сентября 2026**, часовой пояс **Asia/Qyzylorda (UTC+5)**.

## Что здесь находится

- `tools/sreda-instagram-publisher/` — проверяемый Node.js runner и тесты.
- `.github/workflows/sreda-cloud-autopost.yml` — production workflow Stories с точным deadline и durable ledger.
- `content/*.enc` — только AES-256-зашифрованные утверждённые медиапакеты.
- Тексты Threads сохранены в исходниках runner, но их автопубликация отключена.

Токенов, паролей, открытых клиентских изображений, WhatsApp и личных данных в репозитории нет.

## Как работает публикация

`Codex prewarm watchdog / GitHub cron → точный локальный слот UTC+5 → подготовка Meta-контейнера → durable checkpoint → durable бронь одной попытки → Meta media_publish → финальный checkpoint`

Если для даты и времени нет точного действия, job завершается без публикации. Ручной `Run workflow` по умолчанию запускает безопасный `verify`; выбор конкретного Story-слота разрешён только watchdog и публикует лишь сегодняшний слот внутри жёсткого 15-минутного окна.

## Активные слоты

| Локально | Канал |
|---:|---|
| 08:00 | Stories |
| 11:30 | Stories |
| 14:30 | Stories |
| 18:30 | Stories |
| 21:00 | Stories |

Автопубликация Threads отключена 27 августа 2026 года. Даже при ручном вызове runner не публикует Threads без отдельного значения `SREDA_THREADS_AUTOPUBLISH_ENABLED=true`.

## Документация

- [Operations: настройка, обновление, проверка и сбои](docs/OPERATIONS.md)
- [Чек-лист добавления контента](docs/CONTENT_UPDATE_CHECKLIST.md)
- [Правила безопасности](SECURITY.md)

## Главные запреты

- Не коммитить secrets и незашифрованные медиа.
- Не включать второй внешний dispatcher: разрешён только heartbeat `SREDA Stories — watchdog`, который запускает этот же защищённый workflow и сам в Meta не публикует.
- Не публиковать Story через локальный CLI: live-команда заблокирована, потому что только workflow умеет сохранить durable pre-POST бронь.
- Не перезапускать scheduled live-job, пока Instagram/Threads не проверен на уже созданную публикацию.
- Не менять контент без статуса `APPROVED` в приватном источнике истины.
