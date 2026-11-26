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

**Санкционированный обход (канон) — настоящий `xunit.console`** из пакета
`xunit.runner.console`, запущенный напрямую по собранным артефактам:

```bash
dotnet tool install -g xunit.runner.console   # или из пакета в packages/
xunit.console src/{Context}.Domain.Tests/bin/Release/net8.0/{Context}.Domain.Tests.dll
```

xunit.console работает без testhost-родителя, поэтому песочница ему не мешает, и это
та же самая машина xUnit, что используется в CI — результаты сопоставимы 1:1.

**Самодельные раннеры (reflection / XunitFrontController) — только фолбэк**, когда
xunit.console недоступен. Их результат считается неполным доказательством: они могут
расходиться с настоящим xunit в резолве зависимостей и конфигурации. Объявлять «тесты
зелёные» допустимо только по прогону xunit.console или `dotnet test` вне песочницы
(CI), а фолбэк-прогон помечай как «неофициальный» в отчёте.

### Резолв тестовых сборок: ProjectReference на Domain.Tests

xunit.console и `dotnet test` запускают сборку по её `deps.json`. Если IntegrationTests
использует типы из `{Context}.Domain.Tests` (например, тестовый composition root с
`AggregateCompletion`), без **ProjectReference** на Domain.Tests сборка падает вне
testhost: `deps.json` не резолвит зависимость. Явная ссылка + регистрация в тестовом
composition root чинит это (найдено в BE-156, Journal).

### Локальный feed пакетов устаревает молча

Снапшот пакетов в локальной папке (`_scratch\pkgs` и т.п.) — это копия на момент
создания: новые версии DTF в неё **не попадают**. Restore из такой папки фиксирует
старые версии без предупреждения (случай аудита: feed от 22:09 не содержал 0.9.x,
агент запинил 0.8.0 в `Directory.Build.props`).

**Правило:** версии пинятся ТОЛЬКО по ответу nuget.org
(`https://api.nuget.org/v3-flatcontainer/<id>/index.json` — последняя версия из списка).
Локальная папка — только фолбэк доставки (когда пакет не опубликован), и тогда:
(1) версия всё равно сверяется с nuget.org; (2) расхождение фиксируется в `docs/`
строкой «использована X вместо последней Y + причина». «В feed не было новее» — не
оправдание: feed не источник версий.
