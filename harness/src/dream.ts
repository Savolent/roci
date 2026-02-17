#!/usr/bin/env bun
/**
 * dream.ts — Unified dream system for diary and secrets compression
 *
 * Every dream type processes BOTH diary and secrets with different emotional framing.
 * Two separate LLM calls per dream — one for diary, one for secrets — each with
 * its own prompt tuned for that file and that dream type.
 *
 * Dream types:
 *   normal    — neutral tidying of both files
 *   good      — warm, affirming framing; adds dream description to diary
 *   nightmare — harsh, honest framing; adds nightmare description to diary;
 *               prunes secrets aggressively (fewer, sharper — not shorter)
 *
 * Usage: bun run src/dream.ts <credentials-file> [--diary-limit <lines>]
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
import { parseCredentialsFile } from "./context/prompt-builder.js";

type DreamType = "normal" | "good" | "nightmare";

async function main() {
	const args = process.argv.slice(2);

	let credFile: string | undefined;
	let diaryLimit = 200;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--diary-limit" && args[i + 1]) {
			diaryLimit = Number(args[++i]);
		} else if (!credFile) {
			credFile = args[i];
		}
	}

	if (!credFile) {
		console.error("Usage: bun run dream.ts <credentials-file> [--diary-limit <lines>]");
		process.exit(1);
	}

	const meDir = dirname(credFile);
	const diaryPath = join(meDir, "DIARY.md");
	const secretsPath = join(meDir, "SECRETS.md");
	const backgroundPath = join(meDir, "background.md");

	const dreamType = determineDreamType(secretsPath);
	console.error(`=== Dream roll -> ${dreamType} ===`);

	await runDream(dreamType, diaryPath, secretsPath, backgroundPath);
}

function determineDreamType(secretsPath: string): DreamType {
	let nightmareChance = 0;
	if (existsSync(secretsPath)) {
		const secretsLines = readFileSync(secretsPath, "utf-8").split("\n").length;
		nightmareChance = Math.min(Math.floor(secretsLines / 6), 15);
	}

	const roll = Math.floor(Math.random() * 100);
	console.error(
		`=== Dream roll: ${roll} (nightmare <${nightmareChance}, good >=94) ===`,
	);

	if (roll < nightmareChance) return "nightmare";
	if (roll >= 94) return "good";
	return "normal";
}

function readIfExists(path: string): string {
	return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function promptPath(filename: string): string {
	return `/opt/devcontainer/${filename}`;
}

function runLlmCompress(systemPrompt: string, input: string): string {
	return execSync(
		`claude -p --model opus --system-prompt ${JSON.stringify(systemPrompt)}`,
		{
			input,
			encoding: "utf-8",
			timeout: 120000,
			maxBuffer: 1024 * 1024,
		},
	).trim();
}

async function runDream(
	dreamType: DreamType,
	diaryPath: string,
	secretsPath: string,
	backgroundPath: string,
): Promise<void> {
	const background = readIfExists(backgroundPath);
	const diary = readIfExists(diaryPath);
	const secrets = readIfExists(secretsPath);

	// --- Call 1: Diary compression ---
	if (diary) {
		const diaryPromptFile = promptPath(`${dreamType === "normal" ? "dream" : dreamType === "good" ? "good-dream" : "nightmare"}-diary-prompt.txt`);
		if (!existsSync(diaryPromptFile)) {
			console.error(`Error: ${diaryPromptFile} not found`);
			process.exit(1);
		}

		const diaryLines = diary.split("\n").length;
		console.error(`=== ${dreamType} dream — diary (${diaryLines} lines) ===`);

		const diaryPrompt = readFileSync(diaryPromptFile, "utf-8");
		// Feed: prompt + background (context) + secrets (read-only context) + diary
		const diaryInput = `${diaryPrompt}\n\nCharacter background (read-only context):\n${background}\n\nSecrets (read-only context — do NOT include these in diary output):\n${secrets}\n\nDiary to compress:\n${diary}`;

		try {
			const compressed = runLlmCompress(
				"You are a diary compressor. Output only the compressed diary text. Do not use tools or take any other actions.",
				diaryInput,
			);
			writeFileSync(diaryPath, compressed + "\n");
			console.error(`=== ${dreamType} dream — diary complete ===`);
		} catch (err) {
			console.error(`Diary compression failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	} else {
		console.error("=== No diary file, skipping diary compression ===");
	}

	// --- Call 2: Secrets compression ---
	if (secrets) {
		const secretsPromptFile = promptPath(`${dreamType === "normal" ? "dream" : dreamType === "good" ? "good-dream" : "nightmare"}-secrets-prompt.txt`);
		if (!existsSync(secretsPromptFile)) {
			console.error(`Error: ${secretsPromptFile} not found`);
			process.exit(1);
		}

		const secretsLines = secrets.split("\n").length;
		console.error(`=== ${dreamType} dream — secrets (${secretsLines} lines) ===`);

		const secretsPrompt = readFileSync(secretsPromptFile, "utf-8");
		// Feed: prompt + background (context) + diary (read-only context) + secrets
		// Re-read diary in case it was just compressed
		const currentDiary = readIfExists(diaryPath);
		const secretsInput = `${secretsPrompt}\n\nCharacter background (read-only context):\n${background}\n\nDiary (read-only context — do NOT include diary content in secrets output):\n${currentDiary}\n\nSecrets to compress:\n${secrets}`;

		try {
			const compressed = runLlmCompress(
				"You are a secrets compressor. Output only the compressed secrets text. Do not use tools or take any other actions.",
				secretsInput,
			);
			writeFileSync(secretsPath, compressed + "\n");
			console.error(`=== ${dreamType} dream — secrets complete ===`);
		} catch (err) {
			console.error(`Secrets compression failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	} else {
		console.error("=== No secrets file, skipping secrets compression ===");
	}
}

main().catch((err) => {
	console.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
});
