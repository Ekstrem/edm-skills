# Известные дефекты DigiTFactory.Libraries и санкционированные обходы

> Реестр известных дефектов пакетов `DigiTFactory.Libraries.*` и разрешённых обходов.
> **Правило:** обход из этого файла — санкционирован; всё прочее — запрещено
> (это смягчение принципа №6 из `skill.md`: «никаких самодельных реализаций»).
> Если проблема здесь не описана — не изобретай обход, используй библиотеку как есть.

## Уже починено в библиотеке

Следующее уже есть в пакетах «из коробки» — не пиши под это костыли, бери штатный API:

- **Full ES replay** — `IEventStreamRehydrator` выполняет полный replay из Event Store.
- **Typed `DbContextOptions`** — типизированные настройки контекста, без строковых ключей.
- **`IQueryableReadRepository`** — чтение через IQueryable из коробки.
- **Versioned upsert** — идемпотентный upsert по `Version` в Read Store.
- **`IValueObjectSerializer` + фабрика** — `ValueObjectSerializerFactory.Create(format, registry)` с форматами JSON / ProtoBuf / MessagePack.
- **`EventBus.InMemory`** — async durable (событие считается опубликованным после durable-записи).
- **`EventStoreRebuildService`** — перестройка проекций из Event Store.

## Ещё актуально

Действующие дефекты. Используй ТОЛЬКО описанные ниже обходы.

### Mongo replay

Mongo-репозиторий (`AddEventStoreMongo`) не гарантирует тот же порядок и полноту replay,
что Postgres. При профилях Cqrs/Ceqrs replay/rebuild проверяй на реальном хранилище
(Testcontainers или временная Mongo), а не на InMemory.

### `DomainEvent.Version` — семантика

`DomainEvent.Version` — это версия агрегата, **над которой выполнялась команда**
(acted-on), а не новая версия. Новую версию агрегата бери из `Command.Version`
(= `CommandToAggregate.Version` = timestamp на границе api gw). Не вычисляй новую версию
через `GetEventCountAsync(id) + 1`.

### `CommandName` / `SubjectName`

Эти поля события не заполняются автоматически. Передавай `CommandToAggregate` в доменную
модель (бизнес-метод принимает `CommandToAggregate` вторым параметром), чтобы имя команды
и субъект попали в событие.

### `EventBus.Postgres` consumer

Consumer `EventBus.Postgres` — experimental. Для продакшена используй `EventBus.Kafka`;
Postgres-outbox держи как dev/Single/Cqrs-фолбэк.

### `ValueObjectHelper` опасен

`ValueObjectHelper.GetValueObjects` (рефлексия) хрупок. Value Object делай `record` с
явным методом `GetValueObjects()` — без рефлексии.

### `ChangedValueObjects` — диф

`ChangedValueObjects` заполняй вручную как диф (было → стало), а не списком всех полей.
Без корректного диф проекция не поймёт, что именно изменилось.

### Paging — 1-based

Пагинация в `IReadRepository` / `IQueryableReadRepository` — 1-based (первая страница = 1),
не 0-based.

### Npgsql UTC

Npgsql трактует `DateTime`/`DateTimeOffset` в локальной зоне. Всегда пиши и читай UTC:
`DateTime.UtcNow` / `DateTimeOffset.UtcNow`, `Kind = Utc`.

### EF InMemory не поддерживает `ExecuteDeleteAsync`

EF Core InMemory-провайдер не реализует `ExecuteDeleteAsync`/`ExecuteUpdateAsync`.
В тестах на InMemory не вызывай bulk-операции: используй обычный `Remove` + `SaveChanges`
или реальную СУБД (Testcontainers).

### `dotnet test` падает в песочнице (testhost, Win32Exception 5)

`dotnet test` в DSH-песочнице не доходит до выполнения: testhost падает с
`Win32Exception (5)` при `Process.OpenProcess` (запрет открывать handle родительского
процесса). Это ограничение среды, не дефект проекта.

**Санкционированный обход:** собственный минимальный console-раннер (`Journal.TestRunner`
или `tools/testrunner`), который грузит тестовую сборку и прогоняет xUnit напрямую
(без testhost). В CI вне песочницы — обычный `dotnet test`. Не объявляй «тесты зелёные»
без фактического прогона раннером.
