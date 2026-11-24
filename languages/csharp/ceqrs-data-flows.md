# CEQRS — потоки данных

## Архитектура

CEQRS (Command Event Query Responsibility Segregation) — три деплоймента одного микросервиса.
Шина событий — центральный порт. БД — адаптер. Событие — источник истины.

## Деплоймент 1: Command (приём и исполнение команд)

```
Client → Command API
  → Command Handler
    → AggregateProvider.GetAggregateWithCompletionAsync(id)
      → Event Store replay → Aggregate + Notifier
    → aggregate.BusinessMethod(...) — синхронно
      → Notifier → BusAdapter.PublishAsync(domainEvent)
        → Event Bus
          → 1. EventStoreHandler.HandleAsync — durable WRITE, await
          → 2. ProjectionHandler — MV только после успешного сохранения, async
    → await completion — завершено после durable-записи
  → 200 OK / ошибка
```

**Критично:** BusAdapter только публикует. Event Store и MV — подписчики шины.
Rejected/Exception события не сохраняются и не проецируются. Ошибка Event Store
пробрасывается вызывающему; ошибка проекции допустима только при работающем Rebuild.

## Деплоймент 2: Event (обработка событий)

```
EventBus → DomainEvent (async)
  → ProjectionHandler.HandleEvent(ctx, event)
    ├── 1. Read Model Projector → Upsert → Read Store (WRITE)
    └── 2. Outbound Handler → HTTP / Saga / другие микросервисы (если нужно)
```

**Проецирование:** событие распаковывается → changedVOs → applyEvent → upsert в Read Store.

## Деплоймент 3: Query (чтение проекций)

```
Client → GET /api/{context}/{id}
  → {Context}Controller.GetById([FromRoute] Guid id)
    → Get{Context}ByIdHandler.Handle(query, ct)
      → IReadRepository.GetByIdAsync(id) → Read Store (READ)
  → 200 OK (Response DTO)
```

**Критично:** Query Side читает только Read Store — НЕ Domain и НЕ Event Store.

## Сериализация Value Objects

Типизированная сериализация — через `DigiTFactory.Libraries.SeedWorks.Serialization`:

- `IValueObjectSerializer` — единый порт: `Serialize(IDictionary<string,IValueObject>)` / `Deserialize`.
- `ValueObjectSerializerFactory.Create(format, registry)` — выбор формата; `CreateDefault()` = JSON-envelope.
- `ValueObjectTypeRegistry.Register<T>(alias)` — стабильные дискриминаторы типов.

**Выбор формата:**

| Формат | Где применять |
|--------|---------------|
| `JsonEnvelope` (default) | PostgreSQL JSONB (Event Store), InMemory-шина — читаемый, нативный JSONB |
| `Protobuf` | Kafka/шина, где важен размер |
| `MessagePack` | компромисс JSON↔Protobuf, тоже для шины |

Правило: Event Store и InMemory-шина — всегда JSON-envelope; бинарные форматы — только
для межпроцессной шины, и лишь если размер стал узким местом.

## Версия события и оптимистичная блокировка

У события две разные версии — не путать:

| Поле | Смысл | Использование |
|------|-------|---------------|
| `DomainEvent.Version` | версия агрегата, **над которой выполнялась команда** (acted-on) | оптимистичная блокировка |
| `DomainEvent.Command.Version` | = `CommandToAggregate.Version` = timestamp момента прохождения api gw | **новая** версия агрегата после процессинга события |

Правила работы:

1. Handler загружает агрегат с его **текущей** версией и передаёт эту версию как
   «acted-on» в команду. Если агрегат за это время изменился — это конфликт версии,
   команда отклоняется.
2. `CommandToAggregate.Version` — это `DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()`
   на границе api gw; именно он становится новой версией агрегата после применения события.
3. Event Store пишет строку события с версией = `Command.Version`; уникальность — `(Id, Command.Version)`.
   НЕ вычислять версию через `GetEventCountAsync(id) + 1` — это ломает семантику acted-on.
4. Replay сортирует события по `Command.Version`.
5. Первая команда: acted-on `Version == 0` (или default), `Command.Version > 0`.
6. Нарушение уникальности `(Id, Command.Version)` = конфликт версии — превращать в явную
   ошибку (typed version-conflict exception), а не в generic DB error.

## Реализации инфраструктуры

### Event Bus

| Реализация | DI-метод | Назначение |
|-----------|---------|-----------|
| InMemory | `AddEventBusInMemory()` | Dev, тесты |
| Kafka | `AddEventBusKafka(options)` | Продакшен, высокая нагрузка |
| Postgres | `AddEventBusPostgres(options)` | Dev/Single-фолбэк (outbox), не основной профиль |

### Command DB (Event Store)

| Реализация | DI-метод | Стратегии |
|-----------|---------|----------|
| PostgreSQL | `AddEventStorePostgres<T,M>(conn, options)` | FullEventSourcing, SnapshotAfterN, StateOnly |
| MongoDB | `AddEventStoreMongo<T,M>(options)` | FullEventSourcing, SnapshotAfterN, StateOnly |

### Read Store

| Реализация | DI-метод | Назначение |
|-----------|---------|-----------|
| PostgreSQL | `AddReadStorePostgres<T,M,Ctx>(conn, options)` | SQL, JOIN, транзакции |
| Redis | `AddReadStoreRedis<T,M>(options)` | Key-value, TTL, субмс |
| Scylla | `AddReadStoreScylla<T,M>(options)` | Горизонтальное масштабирование |

## PACELC и eventual consistency

При разделении на деплойменты — eventual consistency между Command и Query.
Стратегии митигации:
- Оптимистичная блокировка через acted-on `Version`; новая версия события — `Command.Version`
- Идемпотентность проекций (version check)
