# Command API — проектирование

> API и события, вызывающие изменения состояния агрегата.
> Вход: секция 6 (Handled Commands) Aggregate Design Canvas.
> Атрибуты Request DTO коррелируют с входными Value Objects команды.

## Маппинг команд канваса на эндпоинты

| Тип команды | HTTP-метод | URI-паттерн |
|------------|-----------|-------------|
| Создание агрегата | `POST` | `/api/{context}` |
| Действие над агрегатом | `POST` | `/api/{context}/{id}/{action}` |

Входящие команды из шины (от других сервисов) не имеют HTTP-эндпоинта — обрабатываются Event Consumer.

## Request DTO

Определяются из входных Value Objects команды (колонка «Входные VO» секции 6 канваса).

**Правила:**
- Плоская структура, НЕ повторяет доменные Value Objects
- camelCase в JSON — ASP.NET Core отдаёт camelCase по умолчанию (`System.Text.Json`)
- Enum-ы как строки
- AggregateId для действий берётся из URI (`[FromRoute] string id`), не из тела
- Actor для авторизованных действий берётся из контекста авторизации

## Response DTO (единый для всех команд)

```csharp
// src/{Context}.Api/Dto/{Context}OperationResponse.cs
public class {Context}OperationResponse
{
    public Guid AggregateId { get; init; }
    public long Version { get; init; }
    public string Result { get; init; }     // "Success" | "Exception" | "WithWarnings"
    public string[] Reasons { get; init; }
    public bool IsSuccess { get; init; }
}
```

HTTP-статусы: 200 OK (Success/Warnings), 400 Bad Request (Exception).

## Цепочка корреляции имён

```
Request DTO             → Command              → метод агрегата              → доменное событие
SubscriberRequest-      → SubscriberRequest-   → aggregate.Subscriber-       → ChatSession-
  QuestionRequest         QuestionCommand        RequestQuestion(model, command)   Created
```

## Версионирование

В ASP.NET Core используется prefix `/api/{context}`. При breaking change — `/api/v2/{context}`.

## Шаблон артефакта

```markdown
# Command API: {Context}

## HTTP-эндпоинты

| # | Метод | URI | Команда агрегата | Request DTO | Состояние |
|---|-------|-----|-----------------|-------------|-----------|
| 1 | POST | /api/{ctx} | {CreateCommand} | {Create}Request | New |
| 2 | POST | /api/{ctx}/{id}/{act} | {ActionCommand} | {Action}Request | {State} |

## Входящие события из шины

| # | Событие | Команда агрегата | Источник |
|---|---------|-----------------|---------|

## Request DTO

### {Create}Request
{ /* поля из входных VO */ }

## Response DTO
{Context}OperationResponse (единый)
```

## Как заполнять через диалог

Для каждой Handled Command из секции 6 канваса:
1. «Эта команда создаёт новый агрегат или действует над существующим?»
2. «Какие данные нужны на входе? Из каких Value Objects?»
3. «Кто вызывает эту команду — UI, другой сервис, триггер?»
4. «Нужна ли авторизация? Откуда берётся Actor?»
