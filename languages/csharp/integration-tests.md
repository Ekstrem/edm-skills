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

| Тест | Что проверяет |
|------|---------------|
| lifecycle-проекция | каждый шаг доехал до read-модели |
| event replay | состояние восстанавливается из событий (ES) |
| round-trip | сериализация VO туда-обратно |
| idempotency | повтор события не дублирует проекцию (Version) |
| state machine | запрещённые переходы состояний |

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
