#!/usr/bin/env bun
/**
 * gather-context.ts — TypeScript replacement for gather-context.sh
 *
 * Collects game state via REST API, classifies the situation, detects alerts,
 * generates a rich NL briefing, and outputs it to stdout.
 *
 * Usage: bun run src/gather-context.ts <credentials-file> [--api-url <url>]
 *
 * Outputs a markdown briefing to stdout. Diagnostics go to stderr.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { SpaceMoltAPI } from "./api/client.js";
import { collectGameState, collectSocialState, fetchGalaxyMap } from "./situation/state-collector.js";
import { classifySituation } from "./situation/classifier.js";
import { detectAlerts } from "./situation/alerts.js";
import { generateBriefing } from "./context/briefing.js";
import { buildSessionPrompt, parseCredentialsFile } from "./context/prompt-builder.js";
import { execSync } from "node:child_process";

const DEFAULT_API_URL = "https://game.spacemolt.com/api/v1";

async function main() {
	const args = process.argv.slice(2);

	// Parse arguments
	let credFile: string | undefined;
	let apiUrl = DEFAULT_API_URL;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--api-url" && args[i + 1]) {
			apiUrl = args[++i];
		} else if (!credFile) {
			credFile = args[i];
		}
	}

	if (!credFile) {
		console.error("Usage: bun run gather-context.ts <credentials-file> [--api-url <url>]");
		process.exit(1);
	}

	// Parse credentials
	const credentials = parseCredentialsFile(credFile);
	if (!credentials) {
		console.error(`Error: Could not parse credentials from ${credFile}`);
		process.exit(1);
	}

	// Initialize API client
	console.error(`Connecting to ${apiUrl}...`);
	const api = new SpaceMoltAPI(apiUrl);
	api.setCredentials(credentials);

	// Authenticate
	console.error(`Logging in as ${credentials.username}...`);
	const loginResp = await api.execute("login", {
		username: credentials.username,
		password: credentials.password,
	});

	if (loginResp.error) {
		console.error(`Login failed: ${loginResp.error.message}`);
		process.exit(1);
	}
	console.error(`Logged in as ${credentials.username}`);

	// Collect game state (parallel API queries)
	console.error("Collecting game state...");
	const state = await collectGameState(api);

	// Classify situation + detect alerts
	const situation = classifySituation(state);
	situation.alerts = detectAlerts(state, situation);
	console.error(`Situation: ${situation.type} (${situation.alerts.length} alerts)`);

	// Fetch galaxy map for system name resolution
	console.error("Loading galaxy map...");
	const galaxyMap = await fetchGalaxyMap(api);
	console.error(`Loaded ${galaxyMap.size} star systems`);

	// Generate briefing
	const briefing = generateBriefing(state, situation, galaxyMap);

	// Collect social data (chat + forum)
	console.error("Collecting social data...");
	const social = await collectSocialState(api);

	// Read values file (sibling of credentials)
	const meDir = dirname(credFile);
	const valuesPath = join(meDir, "VALUES.md");
	const values = existsSync(valuesPath) ? readFileSync(valuesPath, "utf-8") : "";

	// Get sm CLI help (if available)
	let smHelp = "";
	try {
		smHelp = execSync("sm --help 2>&1", { encoding: "utf-8", timeout: 5000 });
	} catch {
		// sm not available, skip
	}

	// Build full session prompt
	const prompt = buildSessionPrompt({
		briefing,
		situation,
		social,
		diary: "", // Diary is injected by entrypoint.sh separately
		values,
		smHelp,
	});

	// Output to stdout
	process.stdout.write(prompt);
}

main().catch((err) => {
	console.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
});
