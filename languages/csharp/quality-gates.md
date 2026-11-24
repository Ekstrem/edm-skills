# Quality Gates — каталог и эталонные решения

> Справочник QG (Quality Gates) с краткими эталонными решениями. QG проверяются
> анализаторами пакетов `DigiTFactory.Libraries.*`. Сверяй каждое решение с этим каталогом.

## Правило подключения анализаторов

Анализаторы не «текут» через `ProjectReference`: если Domain ссылается на DomainServices,
анализатор SeedWorks в DomainServices не проверяет код Domain. Поэтому в **каждый** слой
добавляй прямой `PackageReference` на `DigiTFactory.Libraries.SeedWorks`, даже если пакет
уже доступен транзитивно. После подключения проверь анализатор **намеренным нарушением** —
он обязан упасть на сборке; если не упал — анализатор не подключён.

## Каталог QG

| QG | Требование | Эталонное решение |
|----|-----------|-------------------|
| QG-103 | Notifier — и агрегат, и наблюдаемый | `Notifier` реализует `I{Context}Aggregate` + `IObservable<AggregateResult<I{Context}, I{Context}AnemicModel>>` |
| QG-104 | BusAdapter не пишет в БД | `BusAdapter` только публикует (`IObserver<AggregateResult>` → `IEventBus`); запись в Event Store — отдельный `EventStoreHandler` |
| QG-110 | Команда дожидается durable-publish | команда идёт через `IAggregateProviderWithCompletion`; `await completion` до ответа 200 |
| QG-213 | Handler не собирает модель | Handler загружает агрегат и передаёт входные VO/примитивы; сборку `AnemicModel`/`Root`/state выполняет сам бизнес-метод |
| QG-305 | Идемпотентность проекций | идемпотентность по `Version`: повторное или старое событие не меняет MV |
| QG-307 | Rebuild == incremental | `EventStoreRebuildService` + `IEventProjector`; результат Rebuild обязан совпадать с incremental-проекцией |
| QG-311 | Типизированная сериализация VO | `IValueObjectSerializer` вместо `JsonSerializer.Serialize` |
| QG-612 | Без sync-over-async | никаких `.Result` / `.Wait()` / `.GetAwaiter().GetResult()` — только `async`/`await` |
| QG-701 | Нейминг тестов | имя теста `Method_When_Should` (минимум два `_`) |
| QG-702 | Покрытие агрегата | `AggregateCoverage.Verify<T>` + `VerifyInvariants` в Domain.Tests |
| QG-209 | Actor из авторизации, не из тела | `ClientId`/actor берётся из JWT `sub` (`IClientContext`), не из Request DTO |
| QG-306 | Проекция пишет/читает через store | проекция пишет через `IReadModelStore.UpsertAsync`, читает через `IReadRepository.GetByIdAsync`; surrogate `Id` (не composite PK) |
| QG-706 | Self-hosted API suite | анализатор QG706 (наличие `WebApplicationFactory`): каждый command/query endpoint happy + негатив, owner из token |
| QG-707 | Поведение проекций | анализатор QG707 + `ProjectionCoverage.VerifyRebuildEquivalence`/`VerifyIdempotency` в IntegrationTests |
| QG-614 | Health check | `AddHealthChecks()` + `MapHealthChecks("/health")` вместо самодельного эндпоинта |
