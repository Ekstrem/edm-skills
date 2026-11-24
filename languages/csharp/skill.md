---
name: edm-net
description: "Use when designing or implementing an event-driven microservice on .NET/C# with DDD, Event Sourcing and CEQRS on DigiTFactory.Libraries (событийно-управляемые микросервисы на .NET). Covers the five design canvases, Command/Query API, Materialized Views, layer and namespace rules, deployment profiles, Kubernetes, CI/CD and the improvement roadmap."
---

# EDM .NET — событийно-управляемые микросервисы на .NET

Навык ведёт микросервис от предметной области до задеплоенного кода. Пять этапов
проектирования платформонезависимы, дальше — .NET-специфика.

Платформа: **.NET 8, C#, ASP.NET Core, MediatR, EF Core, Autofac, DigiTFactory.Libraries**.

Reference-проект: [Chat](https://github.com/Ekstrem/Chat)

## Маршрут по этапам

| # | Шаг | Читай |
|---|-----|-------|
| 1 | Bounded Context Canvas — границы контекста, inbound/outbound, ubiquitous language | `references/bounded-context-canvas.md` |
| 2 | Aggregate Design Canvas — состояние, инварианты, handled commands, created events | `references/aggregate-design-canvas.md` |
| 3 | Command API — POST-эндпоинты, Request/Response DTO, цепочка Request → Command → Aggregate → Event | `references/command-api.md` |
| 4 | Query API — GET-эндпоинты и Response DTO строго из колонок Materialized View | `references/query-api.md` |
| 5 | Materialized Views — таблицы Read Store и правила проекции событий | `references/materialized-views.md` |
| 6 | Реализация на C# — слои, пространства имён, шаблоны кода | `references/implementation-guide.md` |
| 7 | Известные дефекты библиотеки — санкционированные обходы | `references/library-known-issues.md` |
| 8 | Quality Gates — каталог QG и эталонные решения | `references/quality-gates.md` |
| 9 | Инфраструктура и потоки данных — Command DB, Event Store, Read Store, шина | `references/ceqrs-data-flows.md` |
| 10 | Профили деплоймента — Single → BudgetCqrs → Cqrs → Ceqrs, Dockerfile | `references/deployment-profiles.md` |
| 11 | Kubernetes — Kustomize-манифесты под выбранный профиль | `references/kubernetes.md` |
| 12 | CI/CD — `.github/workflows/ci.yml`, сборка, тесты, образ в GHCR | `references/github-actions.md` |
| 13 | Тесты домена — unit на каждый метод: happy-path + провал инварианта + state machine | `references/domain-tests.md` |
| 14 | Integration-тесты — lifecycle-проекция, replay, idempotency | `references/integration-tests.md` |
| 15 | Roadmap улучшений CEQRS — обсуждение, не для генерации кода | `references/roadmap.md` |

Читай `references/*.md` по мере надобности, а не все сразу: файлы крупные, и каждый
относится к своему этапу. Пути резолвь от каталога навыка.

## Шаг 0 — установление домена

1. Прежде чем проектировать — проверь рабочую папку на существующие канвасы
   (`Docs/Discovery/*.md` или любые `*-canvas.md`). Найденные канвасы — это ТЗ:
   читай их обязательно и следуй им.
2. Домен не выдумывай: предметная область, ubiquitous language, инварианты и события
   берутся из канвасов пользователя, а не из догадок.
3. При конфликте или неоднозначности в канвасах — задай **один** уточняющий вопрос и
   дождись ответа. Не выбирай трактовку «по-своему».

## Порядок работы

1. Определи, на каком этапе пользователь: он описывает предметную область (этап 1),
   есть канвас контекста (2), есть канвас агрегата (3), нужен код (6), инфраструктура (7+).
2. Не перескакивай через проектирование: без канвасов код получится нерелевантным.
   Исключение — явная просьба «просто покажи пример».
3. Артефакты проектирования сохраняй в `Docs/Discovery/` репозитория микросервиса
   (`1-bounded-context-canvas.md` … `5-materialized-views.md`).
4. Названия и атрибуты коррелируют по всей цепочке: канвас → Command API → событие →
   проекция → колонка БД → поле Response DTO. Расхождение — баг проектирования.
5. Перед коммитом сгенерированного кода собери и прогони тесты
   (`dotnet build`, `dotnet test`), при ошибках исправь и повтори, а не предлагай
   коммитить как есть.

## Core первой генерации

Обязательны: канвасы, агрегат с инвариантами и state machine, Command/Query API,
сохранение событий, replay, проекции, Rebuild и тесты этих сценариев.
Авторизация, ownership, идемпотентность команд, optimistic concurrency, outbox,
распределённые профили и snapshots подключаются только если явно выбраны канвасами
или эксплуатационным профилем. Их отсутствие не является core-дефектом.

## Definition of Done первой генерации

Первая генерация считается готовой только когда ВСЁ перечисленное выполнено:

- все команды и queries из канвасов реализованы (каждая Handled Command → эндпоинт,
  каждый сценарий чтения → Query API);
- Rebuild работает и совпадает с incremental-проекцией;
- `dotnet build -warnaserror` проходит с 0 ошибок и 0 предупреждений;
- тесты зелёные (`dotnet test` без падений);
- миграции накатываются на чистую БД;
- Dockerfile собирается и запускается;
- CI (`.github/workflows/ci.yml`) проходит: restore → build → unit → integration.

Запрещено объявлять готовность при красных тестах или падающей сборке: исправь и
перезапусти, а не отчитывайся «почти готово».

## Ключевые принципы

1. **Домен в центре.** Domain зависит ТОЛЬКО от `DigiTFactory.Libraries.SeedWorks`.
2. **Событие — источник истины.** Шина событий — центральный порт, БД — адаптер.
3. **Иммутабельность.** Приватные конструкторы и фабричные методы, никаких установщиков.
4. **CEQRS — три потока.** Command → Event Bus; Event Bus → Command DB + Read Store + outbound;
   Query → только Read Store.
5. **Трёхуровневая валидация.** Assertions → Validators → Success/Exception/Warnings.
6. **Никаких самодельных реализаций** `IEventBus`, `IAnemicModelRepository`, `IReadRepository`,
   обёрток и заглушек вокруг SeedWorks. Всё инфраструктурное берётся из NuGet-пакетов
   `DigiTFactory.Libraries.*`: `EventBus.InMemory`/`Kafka`/`Postgres`,
   `CommandRepository.Postgres`/`Mongo`, `ReadRepository.Postgres`/`Redis`/`Scylla`.
   Пакеты опубликованы на nuget.org, `dotnet restore` работает без токена.
   Единственное санкционированное исключение — обходы из
   `references/library-known-issues.md`; всё прочее — запрещено.
7. **Своё пишем только уникальное для контекста**: `I{Context}`/`{Context}`, VO, агрегат,
   anemic model, спецификации, команды/запросы MediatR, контроллеры, DTO, read models,
   проекции, тесты. Точные пространства имён — в `references/implementation-guide.md`.
