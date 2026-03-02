import type { ApiResponse, ApiSession, Credentials } from "../types.js";

const MAX_RECONNECT_ATTEMPTS = 6;
const RECONNECT_BASE_DELAY_MS = 5000;
const SESSION_RENEWAL_BUFFER_MS = 60_000;

/**
 * SpaceMolt REST API client for the harness sensing layer.
 * Used for pre-session state collection (read-only queries).
 * The actual game actions are still handled by Claude Code via MCP tools.
 */
export class SpaceMoltAPI {
	private session: ApiSession | null = null;
	private credentials: Credentials | null = null;
	private baseUrl: string;

	constructor(baseUrl: string) {
		this.baseUrl = baseUrl.replace(/\/$/, "");
	}

	setCredentials(credentials: Credentials): void {
		this.credentials = credentials;
	}

	isAuthenticated(): boolean {
		return this.session?.player_id != null;
	}

	async execute<T = unknown>(
		command: string,
		payload?: Record<string, unknown>,
	): Promise<ApiResponse<T>> {
		await this.ensureSession();

		try {
			const resp = await this.doRequest<T>(command, payload);
			return this.handleResponse(command, resp, payload);
		} catch {
			// Network error — try reconnecting once
			this.session = null;
			await this.ensureSession();
			const resp = await this.doRequest<T>(command, payload);
			return this.handleResponse(command, resp, payload);
		}
	}

	private async handleResponse<T>(
		command: string,
		resp: ApiResponse<T>,
		payload?: Record<string, unknown>,
	): Promise<ApiResponse<T>> {
		if (!resp.error) return resp;

		const code = resp.error.code;

		// Rate limited — wait and retry
		if (code === "rate_limited") {
			const waitMs = (resp.error.wait_seconds ?? 10) * 1000;
			await sleep(waitMs);
			return this.execute(command, payload);
		}

		// Session expired — refresh and retry
		if (code === "session_invalid" || code === "session_expired" || code === "not_authenticated") {
			this.session = null;
			await this.ensureSession();
			return this.doRequest(command, payload);
		}

		return resp;
	}

	private async ensureSession(): Promise<void> {
		if (this.session && !this.isSessionExpiring()) return;

		for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
			try {
				const resp = await fetch(`${this.baseUrl}/session`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
				});

				const data = (await resp.json()) as ApiResponse;
				if (data.session) {
					this.session = data.session;

					// Re-authenticate if we have credentials
					if (this.credentials) {
						await this.doRequest("login", {
							username: this.credentials.username,
							password: this.credentials.password,
						});
					}
					return;
				}
			} catch {
				// Connection failed — backoff and retry
			}

			const delay = RECONNECT_BASE_DELAY_MS * 2 ** attempt;
			await sleep(delay);
		}

		throw new Error(`Failed to establish session after ${MAX_RECONNECT_ATTEMPTS} attempts`);
	}

	private isSessionExpiring(): boolean {
		if (!this.session) return true;
		const expiresAt = new Date(this.session.expires_at).getTime();
		return expiresAt - Date.now() < SESSION_RENEWAL_BUFFER_MS;
	}

	private async doRequest<T = unknown>(
		command: string,
		payload?: Record<string, unknown>,
	): Promise<ApiResponse<T>> {
		const url = `${this.baseUrl}/${command}`;
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		if (this.session) {
			headers["X-Session-Id"] = this.session.id;
		}

		const resp = await fetch(url, {
			method: "POST",
			headers,
			body: payload ? JSON.stringify(payload) : undefined,
		});

		const data = (await resp.json()) as ApiResponse<T>;

		// Update session from response if present
		if (data.session) {
			this.session = data.session;
		}

		return data;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
