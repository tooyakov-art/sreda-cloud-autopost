# Operations

## 1. Роли репозиториев

- Приватный `sreda-smm-context` — источник истины: правила, бренд, исходники, согласования и статусы.
- Этот публичный репозиторий — только production runner, расписание и зашифрованные утверждённые материалы.

Public repo не является местом для черновиков или согласования.

## 2. Единственный production scheduler

Активен workflow `SREDA Cloud Autopost`. Другие механизмы должны быть выключены:

- Windows Scheduled Task;
- ChatGPT heartbeat;
- GitHub Actions workflow в private context repo;
- ручные браузерные публикации как параллельная автоматизация.

Это правило предотвращает дубли.

## 3. Secrets

В `Settings → Secrets and variables → Actions` должны существовать:

- `SREDA_IG_ACCESS_TOKEN`
- `SREDA_IG_USER_ID`
- `SREDA_THREADS_ACCESS_TOKEN`
- `SREDA_THREADS_USERNAME`
- `SREDA_ASSETS_PASSWORD`

Проверяется только наличие. Значения никогда не копируются в issue, PR, commit, workflow YAML, команды или чат.

## 4. Расписание и часовой пояс

GitHub cron работает в UTC. Проект работает в `Asia/Qyzylorda`, UTC+5.

| Cron UTC | Локально | Возможное действие |
|---:|---:|---|
| 03:00 | 08:00 | Story |
| 06:00 | 11:00 | Carousel |
| 06:30 | 11:30 | Story |
| 09:30 | 14:30 | Story |
| 13:00 | 18:00 | Carousel |
| 13:30 | 18:30 | Story |
| 16:00 | 21:00 | Story |

Автопубликация Threads отключена: её cron-слоты удалены, а runner по умолчанию блокирует публикацию Threads.

GitHub может запустить cron позже указанной минуты. Workflow передаёт runner намеренный локальный слот через `--scheduled-local-time`, поэтому небольшой lag не меняет материал.

## 5. Что делает scheduled job

1. Checkout кода.
2. Установка Node.js и зависимостей.
3. Установка `cloudflared`.
4. Расшифровка `content/*.enc` во временную файловую систему runner.
5. Перевод cron в локальный слот.
6. Поиск точного действия в `schedule.mjs`.
7. Сверка Instagram/Threads аккаунта.
8. Для Instagram — временный Cloudflare Quick Tunnel, ожидание DNS/health и публикация через Meta API.
9. Для Threads — публикация текста через официальный Threads API.
10. Завершение runner; расшифрованные файлы и временный staging исчезают.

## 6. Ручная проверка без публикации

`Actions → SREDA Cloud Autopost → Run workflow` запускает только job `verify`.

Она проверяет:

- доступ к Instagram `sreda.astana`;
- доступ к Threads `sreda.astana`;
- доступность временного HTTPS staging.

Ручной dispatch ничего не публикует. Это безопасная проверка после обновления tokens, кода или staging.

## 7. Тесты перед push

Из `tools/sreda-instagram-publisher/`:

```bash
npm ci
npm test
```

В обычном public checkout asset-тесты будут отмечены `SKIP`, потому что открытых медиа в Git нет. Для полной проверки файлов сначала расшифровать утверждённые пакеты во временный каталог и передать его через `SREDA_CURRENT_ROOT`; не добавлять этот каталог в Git.

До push также проверить:

```bash
git diff --check
git status --short
```

Незашифрованные `.png`, `.jpg`, `.mp4`, токены и `.runtime` не должны попасть в diff.

## 8. Обновление расписания

1. Получить утверждённый план из private source of truth.
2. Обновить `schedule.mjs` и подписи.
3. При появлении нового времени добавить UTC cron и mapping в workflow.
4. Обновить период в README/docs.
5. Добавить новый зашифрованный медиапакет.
6. Запустить тесты.
7. Push.
8. Запустить ручной `verify`.
9. Проверить первый live-слот в Actions и публичном профиле.

Старый период нельзя автоматически копировать на следующий месяц.

## 9. Дубли и повторные запуски

Runner создаёт уникальный ключ для каждого слота, а workflow использует одну concurrency group. Но GitHub-hosted runner временный: локальный ledger не сохраняется между job.

Поэтому:

- не нажимать `Re-run jobs` для scheduled live-run вслепую;
- сначала проверить Instagram/Threads;
- если публикация уже есть, повтор запрещён;
- если статус Meta неясен, зафиксировать run URL и media/container ID, затем разбираться без нового publish.

## 10. Диагностика

| Симптом | Проверка | Действие |
|---|---|---|
| Workflow не запускается | Actions enabled, GitHub status, default branch | Не включать локальный дубль; восстановить cloud workflow |
| `permission` / token error | Meta permissions и expiry | Обновить Secret, затем ручной `verify` |
| staging/DNS timeout | Лог шага verify/publish | Запустить только `verify`; live повторять после проверки профиля |
| файл/папка отсутствует | Структура после расшифровки и тесты | Пересобрать `.enc`, не коммитить открытые файлы |
| Meta container timeout | Публичный профиль и Graph API | Не повторять автоматически |
| Неверный материал опубликован | Media ID и подтверждённый план | Не удалять автоматически; эскалировать Диасу |

## 11. Direct

Direct не входит в production workflow. Присутствующий код остаётся read-only/dry-run. Live-отправка требует отдельного OAuth, теста запросов, cutover и прямого разрешения.
