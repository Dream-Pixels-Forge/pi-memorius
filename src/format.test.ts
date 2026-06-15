/**
 * Tests for display formatting helpers.
 */
import { describe, expect, it, vi } from "vitest";
import type { GraphManager } from "./graph.js";
import type { MemoriusStore } from "./store.js";
import type { VaultStats } from "./types.js";

describe("formatInsights", () => {
	it("returns failure message when store throws", async () => {
		const { formatInsights } = await import("./format.js");

		const mockStore = {
			stats: vi.fn().mockRejectedValue(new Error("CLI not found")),
		} as unknown as MemoriusStore;

		const mockGraph = {} as unknown as GraphManager;

		const result = await formatInsights(mockStore, mockGraph);
		expect(result).toBe(
			"Failed to get insights. Is memorius CLI installed and initialized?",
		);
	});

	it("formats insights when store works", async () => {
		const { formatInsights } = await import("./format.js");

		const mockStore = {
			stats: vi.fn().mockResolvedValue({
				vaults: 2,
				memories: 10,
				embeddings: { provider: "ChromaDefaultProvider", dim: 384 },
				tracking: {
					total: 10,
					active: 8,
					archived: 2,
					byVault: { main: 6, work: 4 },
				},
				graph: { nodes: 5, edges: 3, relations: {} },
			} satisfies VaultStats),
		} as unknown as MemoriusStore;

		const mockGraph = {
			formatStats: vi.fn().mockReturnValue("Graph: 5 nodes"),
		} as unknown as GraphManager;

		const result = await formatInsights(mockStore, mockGraph);
		expect(result).toContain("Memorius Insights");
		expect(result).toContain("Total: 10");
		expect(result).toContain("main: 6 memories");
		expect(result).toContain("Graph: 5 nodes");
	});
});
