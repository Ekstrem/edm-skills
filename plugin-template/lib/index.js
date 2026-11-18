// DSH skill plugin — registers the `__SKILL_NAME__` skill from assets/__SKILL_NAME__/SKILL.md.
//
// This is the minimal "skill provider" bundle: a cordis plugin that calls
// `ctx.skills.registerProvider` and reads the skill markdown from the package's
// own `assets/<name>/SKILL.md` (+ `assets/<name>/references/*.md`). Built by
// scripts/build.py from plugin-template/ + the assembled skill package.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import z from "@deepseek-ai/schemastery";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";

const SKILL_NAME = "__SKILL_NAME__";

const name = `skill-${SKILL_NAME}`;
const inject = ["skills"];

const Config = z.object({ assetRoot: z.string().min(1) });

function parseSkill(raw, path) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw);
  if (!fm?.[1]) throw new Error(`${SKILL_NAME}: ${path} has no YAML frontmatter`);
  const metadata = parse(fm[1]);
  const description =
    metadata && typeof metadata === "object" && "description" in metadata
      ? metadata.description
      : undefined;
  if (typeof description !== "string" || !description.length) {
    throw new Error(`${SKILL_NAME}: ${path} has no description`);
  }
  return { description, content: raw.slice(fm[0].length).trim() };
}

function apply(ctx, config = {}) {
  const assetRoot =
    config.assetRoot ?? fileURLToPath(new URL("../assets/", import.meta.url));
  const directory = join(assetRoot, SKILL_NAME);
  const locator = join(directory, "SKILL.md");
  const { description } = parseSkill(readFileSync(locator, "utf8"), locator);

  const candidate = {
    name: SKILL_NAME,
    description,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: SKILL_NAME,
    source: "bundled",
    rank: BUNDLED_SKILL_RANK,
    resourceBase: { kind: "directory", path: directory.split(sep).join("/") },
    locator,
  };

  const provider = {
    name: SKILL_NAME,
    list: () => Promise.resolve([candidate]),
    async get(c, options) {
      const { rank: _rank, locator: loc, ...summary } = c;
      const content = parseSkill(
        await readFile(loc, { encoding: "utf8", signal: options.signal }),
        loc,
      ).content;
      return { ...summary, content };
    },
  };

  ctx.skills.registerProvider(() => provider);
}

export { Config, apply, inject, name };
