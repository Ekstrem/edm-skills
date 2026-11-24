# Integration Tests (.NET/C#)

Интеграционные тесты проверяют полный поток **Command → Event → Read Store** без моков
инфраструктуры. Файлы — в проекте `src/{Context}.IntegrationTests/` (папка сервиса, ADR-028).

## Lifecycle-проекция (главный тест)

Один тест обходит все состояния агрегата от начала до конца и проверяет, что каждое
изменение спроецировалось на read-модель. Это ловит «команда пришла, но в МВ не долетела»:

```csharp
[Fact]
public void Full_Lifecycle_Command_Then_Query_ReturnsAllFields()
{
    var model = Start();
    model = Step(model, a => a.SpecifyWhen("2026-10-29T21:00"));
    model = Step(model, a => a.AddPartner("partner-1"));
    model = Step(model, a => a.Complete());

    var read = ToReadModel(model);   // {Context}ReadModelBuilder: model → read model

    Assert.Equal("2026-10-29T21:00", read.StartedAt);
    Assert.Equal(new[] { "partner-1" }, read.Partners);
}
```

## Обязательные интеграционные тесты

| QG | Тест | Что проверяет |
|----|------|---------------|
| QG-704 | full lifecycle Manual + Garmin | Command → Event Store → replay → projection → Query; каждый шаг доехал до read-модели |
| QG-307 | incremental == rebuild | Rebuild даёт то же состояние, что incremental projection |
| QG-308/309 | round-trip каждого VO | типизированная сериализация туда-обратно, никаких `{}` |
| QG-305 | idempotency/versioning | повторное или старое событие не меняет MV |
| QG-705 | event identity/version | ID записи не пустой; новая версия увеличивается ровно один раз |
| QG-601 | traceability | Command → endpoint → aggregate → event → VO → MV → Query DTO |
| — | state machine | запрещённые переходы состояний |

Перед merge нужен фактический `dotnet test` с TRX/логом и хотя бы один прогон на настоящей
СУБД (Testcontainers или временная локальная БД). InMemory остаётся быстрым локальным контуром,
но не заменяет приёмочный прогон.

## Хелпер чтения

Read-модель строится из anemic model напрямую (без Event Store) — это и есть проекция:

```csharp
private static {Context}ReadModel ToReadModel(I{Context}AnemicModel model)
    => {Context}ReadModelBuilder.ToReadModel(model);
```

## Запуск

```bash
dotnet test src/{Context}.IntegrationTests
```
