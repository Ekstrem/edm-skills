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
- Оптимистичная блокировка через Version (составной ключ Id + Version)
- Идемпотентность проекций (version check)
