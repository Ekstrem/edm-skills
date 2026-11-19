# Тесты домена (.NET/C#)

Unit-тесты проверяют бизнес-логику агрегата без инфраструктуры. Файлы — в проекте
`src/{Context}.Domain.Tests/` (папка сервиса, ADR-028).

## Правило покрытия (QG-702)

Каждый публичный метод агрегата, возвращающий `AggregateResult`, обязан иметь хотя бы
один тест. Это покрытие, а не синтаксис — его проверяет рефлексивный coverage-assertion
из `DigiTFactory.Libraries.Testing`, а не Roslyn-анализатор:

```csharp
using System.Reflection;
using DigiTFactory.Libraries.Testing;
using Xunit;

public class AggregateCoverageTests
{
    [Fact]
    public void EveryBusinessMethod_HasTest()
        => AggregateCoverage.Verify<Aggregate>(
            Assembly.GetExecutingAssembly(),
            m => m.GetCustomAttributes(typeof(FactAttribute), true).Length > 0
              || m.GetCustomAttributes(typeof(TheoryAttribute), true).Length > 0);
}
```

## Хелперы

Паттерн «шаг» — каждая команда создаёт новый агрегат из модели предыдущего шага:

```csharp
private static I{Context}AnemicModel Step(
    I{Context}AnemicModel model,
    Func<Aggregate, AggregateResult<I{Context}, I{Context}AnemicModel>> command)
{
    var result = command(Aggregate.CreateInstance(model));
    Assert.Equal(DomainOperationResultEnum.Success, result.Result);
    return result.Model();
}

private static I{Context}AnemicModel Start()
    => Aggregate.CreateInstance(new AnemicModel()).StartManualEntry(Guid.NewGuid()).Model();
```

## Обязательные сценарии

### 1. Happy path каждой команды

По одному тесту на каждый handled command из Aggregate Canvas (секция 6):

```csharp
[Fact]
public void SpecifyWhen_SetsStartedAt()
{
    var result = Aggregate.CreateInstance(Start()).SpecifyWhen("2026-10-29T21:00");
    Assert.Equal(DomainOperationResultEnum.Success, result.Result);
    Assert.NotEqual(default, result.Model().Root.StartedAt);
}
```

### 2. Провал каждого инварианта

Каждый `IBusinessOperationValidator`/`IBusinessOperationAssertion` (секция 4 канваса)
→ тест на отказ, не только happy path:

```csharp
[Fact]
public void SpecifyWhen_NonIso_Rejected()
{
    var result = Aggregate.CreateInstance(Start()).SpecifyWhen("не дата");
    Assert.NotEqual(DomainOperationResultEnum.Success, result.Result);
}

[Fact]
public void SpecifyDuration_Zero_Rejected()
{
    var result = Aggregate.CreateInstance(Start()).SpecifyDuration(0);
    Assert.NotEqual(DomainOperationResultEnum.Success, result.Result);
}
```

### 3. Цепочка операций (state machine)

Сквозной тест переходов состояний (секция 3 канваса):

```csharp
[Fact]
public void FullLifecycle_StartToComplete_Succeeds()
{
    var model = Start();
    model = Step(model, a => a.SpecifyWhen("2026-10-29T21:00"));
    model = Step(model, a => a.AddPartner("partner-1"));
    model = Step(model, a => a.Complete());
    Assert.Equal(RecordState.Recorded, model.State);
}
```

## Нейминг (QG-701)

Имя теста — `Method_When_Should` (минимум два `_`), чтобы из имени был виден бизнес-метод
и сценарий: `Complete_WithoutStartedAt_Fails`, `AddPartner_Duplicate_DoesNotDuplicate`.

## Запуск

```bash
dotnet test src/{Context}.Domain.Tests
```
