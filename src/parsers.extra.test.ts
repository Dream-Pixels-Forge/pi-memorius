/**
 * Tests for the CLI text output parsers — search, context, factcheck, stats.
 */
import { describe, expect, it } from "vitest";
import {
	parseContextOutput,
	parseFactcheckOutput,
	parseSearchResults,
	parseStatsOutput,
} from "./parsers.js";

// ─── Search Results ──────────────────────────────────────────────────────────

describe("parseSearchResults", () => {
	it("parses a single search result", () => {
		const output = [
			'Search: "test query"',
			"Results: 1",
			"",
			"1. [main/default/default]",
			"   This is a test memory",
		].join("\n");

		const results = parseSearchResults(output);
		expect(results).toHaveLength(1);
		expect(results[0].content).toBe("This is a test memory");
		expect(results[0].vault).toBe("main");
		expect(results[0].shelf).toBe("default");
		expect(results[0].folder).toBe("default");
	});

	it("returns empty array for no results", () => {
		const output = ['Search: "nothing"', "Results: 0"].join("\n");
		expect(parseSearchResults(output)).toHaveLength(0);
	});

	it("parses multiple results", () => {
		const output = [
			'Search: "query"',
			"Results: 2",
			"",
			"1. [vault1/shelf1/folder1]",
			"   First result",
			"",
			"2. [vault2/shelf2/folder2]",
			"   Second result",
		].join("\n");

		const results = parseSearchResults(output);
		expect(results).toHaveLength(2);
		expect(results[0].content).toBe("First result");
		expect(results[1].content).toBe("Second result");
	});

	it("handles multi-line content", () => {
		const output = [
			'Search: "multi"',
			"Results: 1",
			"",
			"1. [main/default/default]",
			"   Line one",
			"   Line two",
		].join("\n");

		const results = parseSearchResults(output);
		expect(results).toHaveLength(1);
		expect(results[0].content).toBe("Line one Line two");
	});
});

// ─── Context Output ──────────────────────────────────────────────────────────

describe("parseContextOutput", () => {
	it("parses context blocks with confidence", () => {
		const output = [
			"### [memory]",
			"Relevant memory title",
			"Confidence: 85%",
			"- **some metadata",
			"Detailed content",
		].join("\n");

		const results = parseContextOutput(output);
		expect(results).toHaveLength(1);
		expect(results[0].relevance).toBeCloseTo(0.85);
	});

	it("defaults to 0.5 confidence when none found", () => {
		const output = "### [memory]\nSimple content";
		const results = parseContextOutput(output);
		expect(results[0].relevance).toBeCloseTo(0.5);
	});

	it("returns empty for no blocks", () => {
		expect(parseContextOutput("")).toHaveLength(0);
	});
});

// ─── Fact Check Output ───────────────────────────────────────────────────────

describe("parseFactcheckOutput", () => {
	it("parses supported status", () => {
		const output = [
			"✅ SUPPORTED",
			"Confidence: 90%",
			"Found 2 supporting memories",
			"1. Evidence one",
			"2. Evidence two",
		].join("\n");

		const result = parseFactcheckOutput(output);
		expect(result.status).toBe("supported");
		expect(result.confidence).toBeCloseTo(0.9);
		expect(result.evidence).toHaveLength(2);
	});

	it("parses contradicted status", () => {
		const output = [
			"⚠️  CONTRADICTED",
			"Confidence: 75%",
			"1. Contradicting evidence",
		].join("\n");

		const result = parseFactcheckOutput(output);
		expect(result.status).toBe("contradicted");
		expect(result.evidence).toHaveLength(1);
	});

	it("parses unknown status", () => {
		const output = "❓ No matching memories found.";
		const result = parseFactcheckOutput(output);
		expect(result.status).toBe("unknown");
	});
});

// ─── Stats Output ────────────────────────────────────────────────────────────

describe("parseStatsOutput", () => {
	it("parses vault and memory counts", () => {
		const output = [
			"Vaults: 2",
			"Memories: 10",
			"ChromaDefaultProvider dim=384",
			"Total: 10",
			"Active: 8",
			"Archived: 2",
			"  main: 6 memories",
			"  work: 4 memories",
			"Nodes: 15",
			"Edges: 8",
			"  depends_on: 5",
		].join("\n");

		const stats = parseStatsOutput(output);
		expect(stats.vaults).toBe(2);
		expect(stats.memories).toBe(10);
		expect(stats.tracking.total).toBe(10);
		expect(stats.tracking.active).toBe(8);
		expect(stats.tracking.archived).toBe(2);
		expect(stats.tracking.byVault.main).toBe(6);
		expect(stats.tracking.byVault.work).toBe(4);
		expect(stats.embeddings.provider).toBe("ChromaDefaultProvider");
		expect(stats.embeddings.dim).toBe(384);
		expect(stats.graph.nodes).toBe(15);
		expect(stats.graph.edges).toBe(8);
		expect(stats.graph.relations.depends_on).toBe(5);
	});

	it("returns defaults for empty input", () => {
		const stats = parseStatsOutput("");
		expect(stats.vaults).toBe(0);
		expect(stats.memories).toBe(0);
		expect(stats.graph.nodes).toBe(0);
	});
});
