/**
 * pi-memorius — Memorius CLI wrapper
 *
 * Provides a typed async interface to the memorius Python CLI for all core operations.
 * Delegates CLI execution to cli.ts and text parsing to parsers.ts.
 * All methods accept an optional AbortSignal for cancellation.
 */

import { execCliAsync, execCliAsyncWithStdin } from "./cli.js";
import type { MemoriusConfig } from "./config.js";
import {
	parseContextOutput,
	parseDiaryOutput,
	parseFactcheckOutput,
	parseSearchResults,
	parseStatsOutput,
} from "./parsers.js";
import type {
	ContextResult,
	DiaryEntry,
	FactCheckResult,
	SearchResult,
	StoreOptions,
	VaultStats,
} from "./types.js";

// ─── Validation ──────────────────────────────────────────────────────────────

/** Allowed characters for vault/shelf/folder/note identifiers */
const IDENTIFIER_RE = /^[a-zA-Z0-9_\-./]+$/;

function validateIdentifier(value: string, name: string): void {
	if (!value) {
		throw new Error(`${name} cannot be empty`);
	}
	if (!IDENTIFIER_RE.test(value)) {
		throw new Error(
			`Invalid ${name}: "${value}". Only letters, numbers, hyphens, underscores, dots, and slashes allowed.`,
		);
	}
}

// ─── Simple TTL Cache ──────────────────────────────────────────────────────────

class TtlCache<T> {
	private value: T | null = null;
	private expiry = 0;
	private pending: Promise<T> | null = null;

	constructor(private ttlMs: number) {}

	async get(fetch: () => Promise<T>): Promise<T> {
		const now = Date.now();
		if (this.value !== null && now < this.expiry) {
			return this.value;
		}
		// Deduplicate concurrent requests
		if (this.pending) {
			return this.pending;
		}
		this.pending = fetch()
			.then((result) => {
				this.value = result;
				this.expiry = now + this.ttlMs;
				this.pending = null;
				return result;
			})
			.catch((err) => {
				this.pending = null;
				throw err;
			});
		return this.pending;
	}

	invalidate(): void {
		this.value = null;
		this.expiry = 0;
	}
}

// ─── Store Class ──────────────────────────────────────────────────────────────

export class MemoriusStore {
	private cli: string;
	private statsCache = new TtlCache<VaultStats>(5000);
	private statusCache = new TtlCache<string>(5000);

	constructor(config: MemoriusConfig) {
		this.cli = config.memoriusCliPath;
	}

	// ─── Store ─────────────────────────────────────────────────────────────────

	/** Store a memory. Accepts optional AbortSignal. */
	async store(
		content: string,
		options: StoreOptions = {},
		signal?: AbortSignal,
	): Promise<string> {
		const args = ["store"];
		if (options.vault) {
			validateIdentifier(options.vault, "vault");
			args.push("--vault", options.vault);
		}
		if (options.shelf) {
			validateIdentifier(options.shelf, "shelf");
			args.push("--shelf", options.shelf);
		}
		if (options.folder) {
			validateIdentifier(options.folder, "folder");
			args.push("--folder", options.folder);
		}
		if (options.note) {
			validateIdentifier(options.note, "note");
			args.push("--note", options.note);
		}
		args.push(content);
		const result = await execCliAsync(this.cli, args, signal);
		this.statsCache.invalidate();
		this.statusCache.invalidate();
		return result;
	}

	// ─── Search ────────────────────────────────────────────────────────────────

	/** Semantic vector search across memories. Accepts optional AbortSignal. */
	async search(
		query: string,
		n?: number,
		vault?: string,
		shelf?: string,
		signal?: AbortSignal,
	): Promise<SearchResult[]> {
		const args = ["search"];
		if (n) args.push("--n", String(n));
		if (vault) {
			validateIdentifier(vault, "vault");
			args.push("--vault", vault);
		}
		if (shelf) {
			validateIdentifier(shelf, "shelf");
			args.push("--shelf", shelf);
		}
		args.push(query);
		return parseSearchResults(await execCliAsync(this.cli, args, signal));
	}

	// ─── Context ───────────────────────────────────────────────────────────────

	/** Get relevant context for injection. Accepts optional AbortSignal. */
	async context(
		query: string,
		maxItems?: number,
		vault?: string,
		signal?: AbortSignal,
	): Promise<ContextResult[]> {
		const args = ["context"];
		if (maxItems) args.push("--max", String(maxItems));
		if (vault) {
			validateIdentifier(vault, "vault");
			args.push("--vault", vault);
		}
		args.push(query);
		return parseContextOutput(await execCliAsync(this.cli, args, signal));
	}

	// ─── Fact Check ────────────────────────────────────────────────────────────

	/** Check a statement against stored memories. Accepts optional AbortSignal. */
	async factcheck(
		statement: string,
		signal?: AbortSignal,
	): Promise<FactCheckResult> {
		const output = await execCliAsync(
			this.cli,
			["factcheck", statement],
			signal,
		);
		// Try JSON first (newer CLI versions might support it)
		try {
			const parsed = JSON.parse(output);
			if (parsed.status) return parsed as FactCheckResult;
		} catch {
			// Not JSON — use text parser
		}
		return parseFactcheckOutput(output);
	}

	// ─── Mine ──────────────────────────────────────────────────────────────────

	/** Extract structured memories from transcript. Accepts optional AbortSignal. */
	async mine(
		transcript: string,
		vault?: string,
		signal?: AbortSignal,
	): Promise<string> {
		const args = ["mine"];
		if (vault) {
			validateIdentifier(vault, "vault");
			args.push("--vault", vault);
		}
		return execCliAsyncWithStdin(this.cli, args, transcript, signal);
	}

	// ─── Diary ─────────────────────────────────────────────────────────────────

	/** Write a session diary entry. Accepts optional AbortSignal. */
	async diary(
		sessionId: string,
		title: string,
		summary: string,
		content: string,
		exchangeCount?: number,
		signal?: AbortSignal,
	): Promise<string> {
		const args = ["diary", sessionId, "--title", title, "--summary", summary];
		if (exchangeCount) args.push("--exchange-count", String(exchangeCount));
		return execCliAsyncWithStdin(this.cli, args, content, signal);
	}

	/** List recent diary entries. Accepts optional AbortSignal. */
	async listDiaries(
		limit?: number,
		signal?: AbortSignal,
	): Promise<DiaryEntry[]> {
		const args = ["diaries"];
		if (limit) args.push("--limit", String(limit));
		return parseDiaryOutput(await execCliAsync(this.cli, args, signal));
	}

	// ─── Consolidate ───────────────────────────────────────────────────────────

	/** Consolidate similar memories. Accepts optional AbortSignal. */
	async consolidate(
		vault?: string,
		threshold?: number,
		dryRun?: boolean,
		signal?: AbortSignal,
	): Promise<string> {
		const args = ["consolidate"];
		if (vault) {
			validateIdentifier(vault, "vault");
			args.push("--vault", vault);
		}
		if (threshold) args.push("--threshold", String(threshold));
		if (dryRun) args.push("--dry-run");
		const result = await execCliAsync(this.cli, args, signal);
		if (!dryRun) {
			this.statsCache.invalidate();
			this.statusCache.invalidate();
		}
		return result;
	}

	// ─── Extract ───────────────────────────────────────────────────────────────

	/** Extract structured memories from conversation. Accepts optional AbortSignal. */
	async extract(
		conversation: string,
		vault?: string,
		signal?: AbortSignal,
	): Promise<string> {
		const args = ["extract"];
		if (vault) {
			validateIdentifier(vault, "vault");
			args.push("--vault", vault);
		}
		return execCliAsyncWithStdin(this.cli, args, conversation, signal);
	}

	// ─── Status / Stats ────────────────────────────────────────────────────────

	/** Get vault status overview (cached for 5s). Accepts optional AbortSignal. */
	async status(signal?: AbortSignal): Promise<string> {
		return this.statusCache.get(async () =>
			execCliAsync(this.cli, ["status"], signal),
		);
	}

	/** Get memory statistics (cached for 5s). Accepts optional AbortSignal. */
	async stats(signal?: AbortSignal): Promise<VaultStats> {
		return this.statsCache.get(async () =>
			parseStatsOutput(await execCliAsync(this.cli, ["stats"], signal)),
		);
	}

	// ─── List Vault Structure ──────────────────────────────────────────────────

	/** List vault hierarchy. Accepts optional AbortSignal. */
	async ls(vault?: string, signal?: AbortSignal): Promise<string> {
		const args = ["ls"];
		if (vault) {
			validateIdentifier(vault, "vault");
			args.push("--vault", vault);
		}
		return execCliAsync(this.cli, args, signal);
	}

	// ─── Obsidian Sync ─────────────────────────────────────────────────────────

	/** Import from Obsidian vault. Accepts optional AbortSignal. */
	async obsidianImport(vault?: string, signal?: AbortSignal): Promise<string> {
		const args = ["obsidian", "import"];
		if (vault) {
			validateIdentifier(vault, "vault");
			args.push("--vault", vault);
		}
		return execCliAsync(this.cli, args, signal);
	}

	/** Export memories to Obsidian vault. Accepts optional AbortSignal. */
	async obsidianExport(vault?: string, signal?: AbortSignal): Promise<string> {
		const args = ["obsidian", "export"];
		if (vault) {
			validateIdentifier(vault, "vault");
			args.push("--vault", vault);
		}
		return execCliAsync(this.cli, args, signal);
	}
}
