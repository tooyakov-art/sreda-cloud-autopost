# Operations

## 1. Роли репозиториев

- Приватный `sreda-smm-context` — источник истины: правила, бренд, исходники, согласования и статусы.
- Этот публичный репозиторий — только production runner, расписание и зашифрованные утверждённые материалы.

Public repo не является местом для черновиков или согласования.

## 2. Production scheduler

Stories публикует только workflow `SREDA Cloud Autopost`. Для одноразового релиза 1 сентября используются пять точных ручных cloud-dispatch; recurring Story cron и внешний watchdog отсутствуют. После подтверждения всех пяти публикаций workflow снова выключается.

Другие механизмы должны быть выключены:

- Windows Scheduled Task;
- ChatGPT/Codex automations для Stories;
- GitHub Actions workflow в private context repo;
- ручные браузерные публикации как параллельная автоматизация.

Это правило предотвращает дубли.

## 3. Secrets

В `Settings → Secrets and variables → Actions` должны существовать:

- `SREDA_IG_ACCESS_TOKEN`
- `SREDA_IG_USER_ID`
- `SREDA_THREADS_ACCESS_TOKEN`
- `SREDA_THREADS_USERNAME`
- `SREDA_STORIES_ASSETS_PASSWORD`

Проверяется только наличие. Значения никогда не копируются в issue, PR, commit, workflow YAML, команды или чат.

## 4. Одноразовые слоты и часовой пояс

GitHub cron работает в UTC. Проект работает в `Asia/Qyzylorda`, UTC+5.

| Dispatch input | Локально | Действие |
|---:|---:|---|
| `15:20` | 15:20 | Story 01 |
| `15:40` | 15:40 | Story 02 |
| `16:00` | 16:00 | Story 03 |
| `16:20` | 16:20 | Story 04 |
| `16:40` | 16:40 | Story 05 |

Автопубликация Threads отключена: её cron-слоты удалены, а runner по умолчанию блокирует публикацию Threads.

Каждый run dispatch'ится заранее, ждёт свой точный локальный слот и после публикации проверяется по `kind=story`, `localSlot` и числовому Meta publication ID. Workflow откажется от фактического `media_publish` после +15 минут и полностью блокируется на любой дате кроме 1 сентября 2026.

## 5. Что делает scheduled job

1. Checkout кода.
2. Установка Node.js и зависимостей.
3. Установка `cloudflared`.
4. Расшифровка `content/*.enc` во временную файловую систему runner.
5. Перевод cron в локальный слот.
6. Поиск точного действия в `schedule.mjs`.
7. Обязательная сверка Instagram user ID и username `sreda.astana`.
8. Подготовка Story-контейнера через временный Cloudflare Quick Tunnel без публикации.
9. Сохранение prepared checkpoint, затем отдельной durable-брони единственного `media_publish`.
10. Meta POST запускается только после успешного сохранения брони; затем сохраняется final/uncertain state.
11. Завершение runner; расшифрованные файлы и временный staging исчезают.

## 6. Ручной dispatch

`Actions → SREDA Cloud Autopost → Run workflow` с оставленным значением `verify` запускает только проверку.

Она проверяет:

- доступ к Instagram `sreda.astana`;
- доступ к Threads `sreda.astana`;
- доступность временного HTTPS staging.

Значения `15:20`, `15:40`, `16:00`, `16:20`, `16:40` являются live-входами только для утверждённой последовательности 1 сентября. Workflow блокирует другую дату, запуск позднее +15 минут и использует durable ledger против дублей.

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

Runner создаёт уникальный ключ для каждого слота, а live concurrency разделена по логическому Story-слоту; `verify` и задержавшийся другой слот не могут вытеснить pending rescue. Ledger сохраняется между временными GitHub runners в версионированных cache-записях с restore-prefix.

Поэтому:

- не нажимать `Re-run jobs` для scheduled live-run вслепую;
- до `media_publish` workflow отдельно сохраняет prepared checkpoint и durable `publishAttemptedAt`; если сохранение брони не подтвердилось, Meta POST вообще не запускается;
- незавершённый контейнер до POST не сохраняется как durable publication state;
- Meta propagation `media … cannot be found` проверяется повторными безопасными GET;
- сразу перед POST повторно проверяется абсолютный deadline +15 минут;
- сначала проверить Instagram и логи workflow;
- если публикация уже есть, повтор запрещён;
- если статус Meta неясен, зафиксировать run URL и media/container ID, затем разбираться без нового publish.

## 10. Диагностика

| Симптом | Проверка | Действие |
|---|---|---|
| Workflow не запускается | Actions enabled, GitHub status, default branch | Исправить/повторить только до дедлайна конкретного слота; не включать иной publisher |
| `permission` / token error | Meta permissions и expiry | Обновить Secret, затем ручной `verify` |
| staging/DNS timeout | Лог шага verify/publish | Запустить только `verify`; live повторять после проверки профиля |
| файл/папка отсутствует | Структура после расшифровки и тесты | Пересобрать `.enc`, не коммитить открытые файлы |
| Meta container timeout | Публичный профиль и Graph API | Не повторять автоматически |
| Неверный материал опубликован | Media ID и подтверждённый план | Не удалять автоматически; эскалировать Диасу |

## 11. Direct

Direct не входит в production workflow. Присутствующий код остаётся read-only/dry-run. Live-отправка требует отдельного OAuth, теста запросов, cutover и прямого разрешения.
