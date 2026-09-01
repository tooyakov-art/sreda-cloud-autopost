# SREDA Cloud Autopost

Production-автопубликатор `@sreda.astana` через официальные Instagram Content Publishing API и Threads API.

Он работает в GitHub Actions и не зависит от включённого компьютера. Текущий Story-релиз — одноразовая утверждённая последовательность из пяти кадров на **1 сентября 2026**, часовой пояс **Asia/Qyzylorda (UTC+5)**.

## Что здесь находится

- `tools/sreda-instagram-publisher/` — проверяемый Node.js runner и тесты.
- `.github/workflows/sreda-cloud-autopost.yml` — production workflow Stories с точным deadline и durable ledger.
- `content/*.enc` — только AES-256-зашифрованные утверждённые медиапакеты.
- Тексты Threads сохранены в исходниках runner, но их автопубликация отключена.

Токенов, паролей, открытых клиентских изображений, WhatsApp и личных данных в репозитории нет.

## Как работает публикация

`Точный ручной cloud-dispatch → локальный слот UTC+5 → подготовка Meta-контейнера → durable checkpoint → durable бронь одной попытки → Meta media_publish → финальный checkpoint`

Если для даты и времени нет точного действия, job завершается без публикации. Ручной `Run workflow` по умолчанию запускает безопасный `verify`; live-входы ограничены пятью утверждёнными слотами 1 сентября и жёстким 15-минутным окном.

## Активные слоты

| Локально | Канал |
|---:|---|
| 15:20 | Story 01 |
| 15:40 | Story 02 |
| 16:00 | Story 03 |
| 16:20 | Story 04 |
| 16:40 | Story 05 |

Автопубликация Threads отключена 27 августа 2026 года. Даже при ручном вызове runner не публикует Threads без отдельного значения `SREDA_THREADS_AUTOPUBLISH_ENABLED=true`.

## Документация

- [Operations: настройка, обновление, проверка и сбои](docs/OPERATIONS.md)
- [Одноразовый Story-релиз 1 сентября](docs/stories-2026-09-01-v2-release.md)
- [Чек-лист добавления контента](docs/CONTENT_UPDATE_CHECKLIST.md)
- [Правила безопасности](SECURITY.md)

## Главные запреты

- Не коммитить secrets и незашифрованные медиа.
- Не включать второй publisher или внешний dispatcher; этот одноразовый Story workflow после пяти подтверждённых публикаций снова выключается.
- Не публиковать Story через локальный CLI: live-команда заблокирована, потому что только workflow умеет сохранить durable pre-POST бронь.
- Не перезапускать scheduled live-job, пока Instagram/Threads не проверен на уже созданную публикацию.
- Не менять контент без статуса `APPROVED` в приватном источнике истины.
