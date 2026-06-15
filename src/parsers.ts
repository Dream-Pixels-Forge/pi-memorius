/**
 * pi-memorius — Text Output Parsers
 *
 * Parses memorius CLI text output into typed structures.
 * The CLI outputs plain text with no JSON flag.
 */
import type {
	ContextResult,
	DiaryEntry,
	SearchResult,
	VaultStats,
} from "./types.js";

// ─── Search Results ──────────────────────────────────────────────────────────

/**
 * Parse search results from text output like:
 * Search: "query"\nResults: N\n\n1. [vault/shelf/folder/note]\n   content...
 */
export function parseSearchResults(output: string): SearchResult[] {
	const results: SearchResult[] = [];
	const lines = output.split("\n");
	let current: Partial<SearchResult> | null = null;

	for (const line of lines) {
		// Match numbered entry: "1. [vault/shelf/folder/note]"
		const headerMatch = line.match(/^\s*\d+\.\s+\[([^\]]+)\]\s*$/);
		if (headerMatch) {
			if (current?.content) {
				results.push({
					content: current.content,
					vault: current.vault,
					shelf: current.shelf,
					folder: current.folder,
					note: current.note,
				});
			}
			const path = headerMatch[1].split("/");
			current = {
				vault: path[0] || undefined,
				shelf: path[1] || undefined,
				folder: path[2] || undefined,
				note: path[3] || undefined,
				content: "",
			};
			continue;
		}

		// Match content lines (indented)
		if (
			current &&
			line.trim() &&
			!line.startsWith("Search:") &&
			!line.startsWith("Results:")
		) {
			const content = line.trim();
			if (content) {
				current.content += (current.content ? " " : "") + content;
			}
		}
	}

	if (current?.content) {
		results.push({
			content: current.content,
			vault: current.vault,
			shelf: current.shelf,
			folder: current.folder,
			note: current.note,
		});
	}

	return results;
}

// ─── Context Output ──────────────────────────────────────────────────────────

/**
 * Parse context output into structured results.
 */
export function parseContextOutput(output: string): ContextResult[] {
	const results: ContextResult[] = [];

	// Split by ### [memory] blocks
	const blocks = output.split("### [memory]");
	for (const block of blocks) {
		const trimmed = block.trim();
		if (!trimmed) continue;

		const lines = trimmed.split("\n");
		const title = lines[0]?.trim() ?? "";
		let content = title;
		let confidence = 0.5;

		for (const line of lines) {
			const confMatch = line.match(/Confidence:\s*(\d+)%/);
			if (confMatch) {
				confidence = parseInt(confMatch[1], 10) / 100;
			}
			// Skip metadata lines
			if (line.startsWith("- **")) continue;
			if (line.startsWith("###")) continue;
			if (line === title) continue;
			const text = line.trim();
			if (text) content += ` ${text}`;
		}

		results.push({ content: content.slice(0, 300), relevance: confidence });
	}

	return results;
}

// ─── Fact Check Output ───────────────────────────────────────────────────────

/**
 * Parse factcheck output into structured result.
 */
export function parseFactcheckOutput(output: string): {
	status: "supported" | "contradicted" | "unknown";
	evidence: string[];
	confidence: number;
} {
	const lines = output.split("\n");
	let status: "supported" | "contradicted" | "unknown" = "unknown";
	let confidence = 0;
	const evidence: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (
			trimmed.startsWith("✅ SUPPORTED") ||
			trimmed.startsWith("✓ SUPPORTED")
		) {
			status = "supported";
		} else if (
			trimmed.startsWith("⚠️  CONTRADICTED") ||
			trimmed.startsWith("⚠ CONTRA")
		) {
			status = "contradicted";
		} else if (trimmed.startsWith("⚠️ UNCERTAIN") || trimmed.startsWith("❓")) {
			status = "unknown";
		}

		const confMatch = trimmed.match(/Confidence:\s*(\d+)%/);
		if (confMatch) {
			confidence = parseInt(confMatch[1], 10) / 100;
		}

		if (
			trimmed &&
			!trimmed.startsWith("⚠") &&
			!trimmed.startsWith("✅") &&
			!trimmed.startsWith("✓") &&
			!trimmed.startsWith("❓") &&
			!trimmed.startsWith("Confidence") &&
			!trimmed.startsWith("Found") &&
			!trimmed.startsWith("Statement")
		) {
			const text = trimmed.replace(/^\d+\.\s*/, "");
			if (text && text.length > 3) evidence.push(text);
		}
	}

	return { status, evidence, confidence };
}

// ─── Diary Output ────────────────────────────────────────────────────────────

/**
 * Parse diary entries from text output.
 */
export function parseDiaryOutput(output: string): DiaryEntry[] {
	const entries: DiaryEntry[] = [];
	const blocks = output.split("\n\n");

	for (const block of blocks) {
		const trimmed = block.trim();
		if (!trimmed) continue;

		const lines = trimmed.split("\n");
		let sessionId = "";
		let title = "";
		let summary = "";
		let timestamp = "";

		for (const line of lines) {
			const tsMatch = line.match(/^\[([^\]]+)\]\s+(.+)/);
			if (tsMatch) {
				timestamp = tsMatch[1];
				title = tsMatch[2].trim();
				continue;
			}
			const sessionMatch = line.match(/Session:\s*(\S+)/);
			if (sessionMatch) {
				sessionId = sessionMatch[1];
				continue;
			}
			const summaryMatch = line.match(/Summary:\s*(.+)/);
			if (summaryMatch) {
				summary = summaryMatch[1].trim();
				continue;
			}
			// First non-metadata line after header is the summary if no "Summary:" prefix
			if (
				!summary &&
				!line.startsWith("Session:") &&
				!line.startsWith("[") &&
				line.trim()
			) {
				summary = line.trim();
			}
		}

		if (title && sessionId) {
			entries.push({
				session_id: sessionId,
				title,
				summary,
				content: trimmed,
				timestamp,
			});
		}
	}

	return entries;
}

// ─── Stats Output ────────────────────────────────────────────────────────────

/**
 * Parse stats from text output.
 */
export function parseStatsOutput(output: string): VaultStats {
	const stats: VaultStats = {
		vaults: 0,
		memories: 0,
		embeddings: { provider: "ChromaDefaultProvider", dim: 384 },
		tracking: { total: 0, active: 0, archived: 0, byVault: {} },
		graph: { nodes: 0, edges: 0, relations: {} },
	};

	const lines = output.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();

		const vaultsMatch = trimmed.match(/Vaults:\s*(\d+)/);
		if (vaultsMatch) stats.vaults = parseInt(vaultsMatch[1], 10);

		const memoriesMatch = trimmed.match(/Memories:\s*(\d+)/);
		if (memoriesMatch) stats.memories = parseInt(memoriesMatch[1], 10);

		const providerMatch = trimmed.match(/Chroma\w*Provider/);
		if (providerMatch) stats.embeddings.provider = providerMatch[0];

		const dimMatch = trimmed.match(/dim=(\d+)/);
		if (dimMatch) stats.embeddings.dim = parseInt(dimMatch[1], 10);

		const totalMatch = trimmed.match(/Total:\s*(\d+)/);
		if (totalMatch) stats.tracking.total = parseInt(totalMatch[1], 10);

		const activeMatch = trimmed.match(/Active:\s*(\d+)/);
		if (activeMatch) stats.tracking.active = parseInt(activeMatch[1], 10);

		const archivedMatch = trimmed.match(/Archived:\s*(\d+)/);
		if (archivedMatch) stats.tracking.archived = parseInt(archivedMatch[1], 10);

		const byVaultMatch = trimmed.match(/^\s*(\w[\w-]*):\s*(\d+)\s*memories?/);
		if (byVaultMatch)
			stats.tracking.byVault[byVaultMatch[1]] = parseInt(byVaultMatch[2], 10);

		const nodesMatch = trimmed.match(/Nodes:\s*(\d+)/);
		if (nodesMatch) stats.graph.nodes = parseInt(nodesMatch[1], 10);

		const edgesMatch = trimmed.match(/Edges:\s*(\d+)/);
		if (edgesMatch) stats.graph.edges = parseInt(edgesMatch[1], 10);

		const relMatch = trimmed.match(/^\s*(\w[\w -]*):\s*(\d+)$/);
		if (relMatch && !trimmed.includes("Vault") && !trimmed.includes("By")) {
			stats.graph.relations[relMatch[1].trim()] = parseInt(relMatch[2], 10);
		}
	}

	return stats;
}
