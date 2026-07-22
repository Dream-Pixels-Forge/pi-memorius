/**
 * pi-memorius — Slash Command Registrations
 *
 * Registers 14 slash commands for interactive memory management.
 */
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { MemoriusConfig } from "./config.js";
import type { DiaryManager } from "./diary.js";
import { formatInsights } from "./format.js";
import type { GraphManager } from "./graph.js";
import type { MemoriusStore } from "./store.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse command arguments, handling quoted strings and --flags.
 * Content before the first --flag is the main argument.
 * Flags are key-value pairs: --key value
 */
function parseArgs(args: string): {
	content: string;
	flags: Record<string, string>;
} {
	const flags: Record<string, string> = {};
	let content = args;

	// Match --key value patterns, respecting quoted values
	const flagRegex = / --(\w+)\s+(?:"([^"]*)"|([^\s]+))/g;
	let match: RegExpExecArray | null = flagRegex.exec(args);

	while (match !== null) {
		const key = match[1];
		const val = match[2] ?? match[3];
		if (key && val) {
			flags[key] = val;
		}
		match = flagRegex.exec(args);
	}

	// Content is everything before the first --flag
	const firstFlagIndex = args.indexOf(" --");
	if (firstFlagIndex > 0) {
		content = args.slice(0, firstFlagIndex).trim();
	}

	return { content: content.trim(), flags };
}

export function registerCommands(
	pi: ExtensionAPI,
	store: MemoriusStore,
	graph: GraphManager,
	diary: DiaryManager,
	config: MemoriusConfig,
): void {
	// ── /memorius-store ──────────────────────────────────────────────────────
	pi.registerCommand("memorius-store", {
		description: "Store a memory in the vault",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const parts = args.split(" --");
			const content = parts[0]?.trim();
			if (!content) {
				ctx.ui.notify(
					"Usage: /memorius-store <content> [--shelf X] [--folder Y]",
					"warning",
				);
				return;
			}

			let shelf = "default";
			let folder = "default";
			for (let i = 1; i < parts.length; i++) {
				const [key, ...vals] = parts[i].split(" ");
				const val = vals.join(" ").trim();
				if (key === "shelf" && val) shelf = val;
				if (key === "folder" && val) folder = val;
			}

			await store.store(content, { vault: config.vault, shelf, folder });
			ctx.ui.notify(`✅ Stored: "${content.slice(0, 80)}..."`, "info");
		},
	});

	// ── /memorius-search ──────────────────────────────────────────────────────
	pi.registerCommand("memorius-search", {
		description: "Semantic search across memories",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			if (!args.trim()) {
				ctx.ui.notify(
					"Usage: /memorius-search <query> [--n 10] [--shelf X]",
					"warning",
				);
				return;
			}

			const { content: query, flags } = parseArgs(args);
			const n = flags.n
				? parseInt(flags.n, 10) || config.maxSearchResults
				: config.maxSearchResults;
			const shelf = flags.shelf;

			const results = await store.search(query, n, config.vault, shelf);
			if (!results || results.length === 0) {
				ctx.ui.notify("🔍 No relevant memories found.", "info");
				return;
			}

			const output = results
				.map(
					(r, i) =>
						`${i + 1}. [${r.score !== undefined ? `${(r.score * 100).toFixed(0)}%` : "?"}] ${r.content.slice(0, 120)}`,
				)
				.join("\n");

			ctx.ui.notify(`🔍 Found ${results.length} results:\n${output}`, "info");
		},
	});

	// ── /memorius-context ─────────────────────────────────────────────────────
	pi.registerCommand("memorius-context", {
		description: "Get relevant context for injection",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			if (!args.trim()) {
				ctx.ui.notify("Usage: /memorius-context <topic> [--max 5]", "warning");
				return;
			}

			const { content: topic, flags } = parseArgs(args);
			const max = flags.max
				? parseInt(flags.max, 10) || config.maxContextItems
				: config.maxContextItems;

			const results = await store.context(topic, max, config.vault);
			if (!results || results.length === 0) {
				ctx.ui.notify("No relevant context found.", "info");
				return;
			}

			const output = results
				.map(
					(r, i) =>
						`${i + 1}. (relevance: ${(r.relevance * 100).toFixed(0)}%) ${r.content.slice(0, 120)}`,
				)
				.join("\n");

			ctx.ui.notify(`📋 Context for "${topic}":\n${output}`, "info");
		},
	});

	// ── /memorius-factcheck ───────────────────────────────────────────────────
	pi.registerCommand("memorius-factcheck", {
		description: "Check a statement against stored facts",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			if (!args.trim()) {
				ctx.ui.notify("Usage: /memorius-factcheck <statement>", "warning");
				return;
			}

			const result = await store.factcheck(args.trim());
			if (result.status === "supported") {
				ctx.ui.notify(
					`✅ Supported (${(result.confidence * 100).toFixed(0)}%)\n${result.evidence.join("\n")}`,
					"info",
				);
			} else if (result.status === "contradicted") {
				ctx.ui.notify(
					`⚠️  Contradicted (${(result.confidence * 100).toFixed(0)}%)\n${result.evidence.join("\n")}`,
					"warning",
				);
			} else {
				ctx.ui.notify(
					"❓ Unknown — no supporting or contradicting memories.",
					"info",
				);
			}
		},
	});

	// ── /memorius-insights ────────────────────────────────────────────────────
	pi.registerCommand("memorius-insights", {
		description: "Show vault overview and stats",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const output = await formatInsights(store, graph);
			ctx.ui.notify(output, "info");
		},
	});

	// ── /memorius-stats ───────────────────────────────────────────────────────
	pi.registerCommand("memorius-stats", {
		description: "Show memory and graph statistics",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			try {
				const stats = await store.stats();
				const graphStats = graph.getStats();
				const output = [
					"📊 Memory Stats:",
					`  Total: ${stats.tracking.total}`,
					`  Active: ${stats.tracking.active}`,
					`  Archived: ${stats.tracking.archived}`,
					`  Embeddings: ${stats.embeddings.provider} (dim=${stats.embeddings.dim})`,
					"",
					"📊 Graph Stats:",
					`  Nodes: ${graphStats.nodes}`,
					`  Edges: ${graphStats.edges}`,
					`  By Type:`,
					...Object.entries(graphStats.byType).map(
						([t, c]) => `    ${t}: ${c}`,
					),
					`  Relations:`,
					...Object.entries(graphStats.relations).map(
						([r, c]) => `    ${r}: ${c}`,
					),
				].join("\n");
				ctx.ui.notify(output, "info");
			} catch (e) {
				console.debug(
					"[memorius] stats command failed:",
					e instanceof Error ? e.message : String(e),
				);
				ctx.ui.notify("Failed to get stats.", "error");
			}
		},
	});

	// ── /memorius-graph ──────────────────────────────────────────────────────
	pi.registerCommand("memorius-graph", {
		description: "Show knowledge graph",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			ctx.ui.notify(graph.formatStats(), "info");
		},
	});

	// ── /memorius-diary ──────────────────────────────────────────────────────
	pi.registerCommand("memorius-diary", {
		description: "Write a session diary entry",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			if (!args.trim()) {
				ctx.ui.notify(
					"Usage: /memorius-diary <title> --summary <text> [--content <text>] [--exchange-count N]",
					"warning",
				);
				return;
			}

			const { content: title, flags } = parseArgs(args);
			const summary = flags.summary ?? "";
			const content = flags.content ?? "";
			const exchangeCount = flags["exchange-count"]
				? parseInt(flags["exchange-count"], 10)
				: undefined;

			const sessionId = `session-${Date.now()}`;
			await diary.writeDiary(
				sessionId,
				title,
				summary || title,
				content || summary || title,
				exchangeCount,
			);

			ctx.ui.notify(`📔 Diary created: "${title}" (${sessionId})`, "info");
		},
	});

	// ── /memorius-diaries ─────────────────────────────────────────────────────
	pi.registerCommand("memorius-diaries", {
		description: "List recent diary entries",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const limit = parseInt(args.trim(), 10) || 10;
			const entries = await diary.listDiaries(limit);
			ctx.ui.notify(diary.formatDiaries(entries), "info");
		},
	});

	// ── /memorius-consolidate ─────────────────────────────────────────────────
	pi.registerCommand("memorius-consolidate", {
		description: "Merge similar memories",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const dryRun = args.trim() === "--dry-run";
			const result = await store.consolidate(
				config.vault,
				config.consolidationThreshold,
				dryRun,
			);
			ctx.ui.notify(
				dryRun ? `🔀 Preview:\n${result}` : `🔀 Done:\n${result}`,
				"info",
			);
		},
	});

	// ── /memorius-ls ─────────────────────────────────────────────────────────
	pi.registerCommand("memorius-ls", {
		description: "List vault structure",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const vault = args.trim() || config.vault;
			const output = await store.ls(vault);
			ctx.ui.notify(output, "info");
		},
	});

	// ── /memorius-mine ────────────────────────────────────────────────────────
	pi.registerCommand("memorius-mine", {
		description: "Extract memories from recent session",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const transcript = args.trim();
			if (!transcript) {
				ctx.ui.notify(
					"Usage: /memorius-mine <transcript text or summary>",
					"warning",
				);
				return;
			}
			const result = await store.mine(transcript, config.vault);
			ctx.ui.notify(`⛏️ ${result}`, "info");
		},
	});

	// ── /memorius-sync-obsidian ──────────────────────────────────────────────
	pi.registerCommand("memorius-sync-obsidian", {
		description: "Sync with Obsidian vault (import or export)",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const action = args.trim().toLowerCase();
			try {
				if (action === "import") {
					const result = await store.obsidianImport(config.vault);
					ctx.ui.notify(`📥 ${result}`, "info");
				} else if (action === "export") {
					const result = await store.obsidianExport(config.vault);
					ctx.ui.notify(`📤 ${result}`, "info");
				} else {
					ctx.ui.notify(
						"Usage: /memorius-sync-obsidian import|export",
						"warning",
					);
				}
			} catch (e) {
				console.debug(
					"[memorius] obsidian sync failed:",
					e instanceof Error ? e.message : String(e),
				);
				ctx.ui.notify(
					"Obsidian sync failed. Is obsidian CLI configured?",
					"error",
				);
			}
		},
	});

	// ── /memorius-extract ────────────────────────────────────────────────────
	pi.registerCommand("memorius-extract", {
		description: "Extract structured memories from text",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const text = args.trim();
			if (!text) {
				ctx.ui.notify(
					"Usage: /memorius-extract <text to extract from>",
					"warning",
				);
				return;
			}
			const vault = config.vault;
			const result = await store.extract(text, vault);
			ctx.ui.notify(`📤 ${result}`, "info");
		},
	});

	// ── /memorius-interview ───────────────────────────────────────────────────
	pi.registerCommand("memorius-interview", {
		description: "Pre-fill user profile via interview",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			ctx.ui.notify(
				"Starting memorius interview... (use memorius CLI: memorius profile new)",
				"info",
			);
		},
	});
}
