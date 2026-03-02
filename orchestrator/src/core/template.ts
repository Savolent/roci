import { Effect } from "effect"
import { FileSystem } from "@effect/platform"

/**
 * Strip YAML frontmatter (---…---) from the beginning of a string.
 * Returns the body after the closing `---`.
 */
export function stripFrontmatter(raw: string): string {
  const match = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/)
  return match ? match[1].trimStart() : raw
}

/**
 * Replace `{{key}}` placeholders with values from a record.
 * Unknown keys are replaced with the empty string.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "")
}

/**
 * Effect-based file read + frontmatter stripping.
 * Requires `FileSystem` from `@effect/platform`.
 */
export const loadTemplate = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const raw = yield* fs.readFileString(filePath)
    return stripFrontmatter(raw)
  })
