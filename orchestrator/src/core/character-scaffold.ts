import { Effect } from "effect"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import * as path from "node:path"

const BACKGROUND_TEMPLATE = `# Background

<!-- Write your character's background here. This is their identity narrative —
     who they are, how they think, what drives them. The AI reads this on every
     planning cycle to stay in character. -->
`

const VALUES_TEMPLATE = `# Values

<!-- Write your character's working values here. These define how the character
     operates — their priorities, principles, and decision-making framework. -->
`

const DIARY_TEMPLATE = `# Diary
`

const SECRETS_TEMPLATE = `# Secrets
`

/**
 * Scaffold a new character's generic identity files.
 *
 * Creates `players/<name>/me/` and writes the four standard files
 * (background.md, VALUES.md, DIARY.md, SECRETS.md). Existing files are
 * never overwritten — they are skipped and noted in the returned list
 * with a "skipped:" prefix.
 *
 * @returns list of messages indicating created or skipped file paths
 */
export const scaffoldCharacter = (opts: {
  projectRoot: string
  characterName: string
  identityTemplate?: {
    backgroundHints: string
    valuesHints: string
  }
}): Effect.Effect<string[], never, never> =>
  Effect.sync(() => {
    const { projectRoot, characterName, identityTemplate } = opts
    const charDir = path.resolve(projectRoot, "players", characterName, "me")
    const results: string[] = []

    // Ensure directory exists
    if (!existsSync(charDir)) {
      mkdirSync(charDir, { recursive: true })
      results.push(`created directory: ${charDir}`)
    }

    // Build file contents
    const backgroundContent = identityTemplate
      ? BACKGROUND_TEMPLATE + `\n## Domain Context\n\n${identityTemplate.backgroundHints}\n`
      : BACKGROUND_TEMPLATE

    const valuesContent = identityTemplate
      ? VALUES_TEMPLATE + `\n## Domain Context\n\n${identityTemplate.valuesHints}\n`
      : VALUES_TEMPLATE

    const files: Array<{ name: string; content: string }> = [
      { name: "background.md", content: backgroundContent },
      { name: "VALUES.md", content: valuesContent },
      { name: "DIARY.md", content: DIARY_TEMPLATE },
      { name: "SECRETS.md", content: SECRETS_TEMPLATE },
    ]

    for (const file of files) {
      const filePath = path.resolve(charDir, file.name)
      if (existsSync(filePath)) {
        results.push(`skipped: ${filePath} (already exists)`)
      } else {
        writeFileSync(filePath, file.content)
        results.push(`created: ${filePath}`)
      }
    }

    return results
  })
