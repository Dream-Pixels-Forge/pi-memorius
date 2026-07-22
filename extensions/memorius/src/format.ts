/**
 * pi-memorius — Display Formatting Helpers
 *
 * Pure formatting functions for rendering structured data
 * as human-readable strings in slash commands and status displays.
 */

import type { GraphManager } from "./graph.js";
import type { MemoriusStore } from "./store.js";

/**
 * Format comprehensive vault insights with memory stats, embedding info,
 * vault breakdowns, and graph statistics.
 * Eliminates redundant `store.status()` call — all info is in `store.stats()`.
 */
export async function formatInsights(
	store: MemoriusStore,
	graph: GraphManager,
): Promise<string> {
	try {
		const stats = await store.stats();
		const graphStats = graph.formatStats();
		const lines = [
			"╔══════════════════════════════════════╗",
			"║        🧠 Memorius Insights          ║",
			"╚══════════════════════════════════════╝",
			"",
			`📊 Memory Stats:`,
			`  Total: ${stats.tracking.total}`,
			`  Active: ${stats.tracking.active}`,
			`  Archived: ${stats.tracking.archived}`,
			`  Embeddings: ${stats.embeddings.provider} (dim=${stats.embeddings.dim})`,
			"",
			`📈 Vaults: ${stats.vaults}`,
			...Object.entries(stats.tracking.byVault).map(
				([v, c]) => `  ${v}: ${c} memories`,
			),
			"",
			graphStats,
		];
		return lines.join("\n");
	} catch (e) {
		console.debug(
			"[memorius] formatInsights failed:",
			e instanceof Error ? e.message : String(e),
		);
		return "Failed to get insights. Is memorius CLI installed and initialized?";
	}
}
