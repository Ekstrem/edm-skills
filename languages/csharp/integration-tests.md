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

Минимальный набор (эталон — DSv4FwQSwSAbyL и ACO5.5; каждый пункт — реально выполняемый
тест, а не наличие файла):

| QG | Группа | Что проверяет |
|----|--------|---------------|
| QG-706 | command endpoints | **каждый** command: happy-path + негатив (невалидные входные данные, 400/409) |
| QG-706 | query endpoints | **каждый** query: happy-path + отсутствующий/чужой id |
| QG-706 | transport/auth | 401/403 на каждый endpoint, malformed token/JSON, 405, UTF-8 |
| QG-706 | владелец | owner только из token; `clientId` в теле игнорируется; чужие записи не видны |
| QG-707 | проекции | идемпотентность (повторная доставка), rebuild == incremental, stale/version-conflict не меняет MV |
| QG-704 | full lifecycle | Command → Event Store → replay → projection → Query; Manual + Garmin |
| QG-705 | event identity/version | ID записи не пустой; новая версия увеличивается ровно один раз |
| QG-601 | traceability | Command → endpoint → aggregate → event → VO → MV → Query DTO |

Дополнительно к обязательному — то, что не должен терять текущий BC-Journal при
выравнивании с эталоном:

- durable publish + `await completion` (журнал завершения);
- регрессия `Command.Version`;
- DI composition + runtime host smoke;
- создание схемы на свежем Postgres + сквозная проверка read model на реальной БД;
- контракт soft delete с сохранением разрешимости истории.

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

В DSH-песочнице `dotnet test` падает (`testhost`, Win32Exception 5). Используй
in-process раннер `DigiTFactory.Libraries.TestRunner` (обход S6 из library-known-issues):

```bash
dotnet run --project tools/TestRunner -- src/{Context}.IntegrationTests/bin/Release/net8.0/{Context}.IntegrationTests.dll
```

Не объявляй тесты зелёными без фактического прогона раннером.
