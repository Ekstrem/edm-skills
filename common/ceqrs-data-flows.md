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
  → ChatHandler.Get{Context}ById(w, r)
    → GetChatByIdHandler.Handle(ctx, id)
      → eventStore.GetByID(ctx, id) → Event Store (READ)
  → 200 OK (массив событий)
```

**Критично:** Query Side читает только Read Store — НЕ Domain и НЕ Event Store.

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

| Реализация | Конструктор | Назначение |
|-----------|------------|-----------|
| InMemory | `inmemory.New(logger)` | Dev, тесты |
| Kafka | `kafka.New(options, logger)` | Продакшен, высокая нагрузка |
| Postgres | `postgres.New(pool, options, logger)` | Dev/Single-фолбэк (outbox), не основной профиль |

### Command DB (Event Store)

| Реализация | Конструктор | Стратегии |
|-----------|------------|----------|
| PostgreSQL | `cmdrepo.NewFullEventSourcingRepository(pool, opts, logger)` | FullEventSourcing, SnapshotAfterN, StateOnly |
| MongoDB | `mongorepo.NewFullEventSourcingRepository(db, opts, logger)` | FullEventSourcing, SnapshotAfterN, StateOnly |

### Read Store

| Реализация | Конструктор | Назначение |
|-----------|------------|-----------|
| PostgreSQL | `pgquery.NewReadRepository[T](pool, tableName, logger)` | SQL, JOIN, транзакции |
| Redis | `redisquery.NewReadRepository[T](client, keyPrefix, logger)` | Key-value, TTL, субмс |
| ScyllaDB | `scyllaquery.NewReadRepository[T](session, opts, modelType, logger)` | Горизонтальное масштабирование |

## PACELC и eventual consistency

При разделении на деплойменты — eventual consistency между Command и Query.
Стратегии митигации:
- Оптимистичная блокировка через acted-on `Version`; новая версия события — `Command.Version`
- Идемпотентность проекций (version check)
