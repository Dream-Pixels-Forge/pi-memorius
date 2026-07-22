/**
 * Additional parser tests for edge cases.
 */
import { describe, expect, it } from "vitest";
import {
	parseContextOutput,
	parseDiaryOutput,
	parseFactcheckOutput,
	parseSearchResults,
	parseStatsOutput,
} from "./parsers.js";

describe("parseSearchResults edge cases", () => {
	it("handles empty output", () => {
		expect(parseSearchResults("")).toEqual([]);
	});

	it("handles output with no results", () => {
		expect(parseSearchResults('Search: "test"\nResults: 0')).toEqual([]);
	});

	it("handles single result", () => {
		const output = `Search: "test"
Results: 1

1. [main/bugs/project-x]
   Redis uses single-threaded event loop`;
		const results = parseSearchResults(output);
		expect(results).toHaveLength(1);
		expect(results[0].content).toContain("Redis");
		expect(results[0].vault).toBe("main");
		expect(results[0].shelf).toBe("bugs");
	});
});

describe("parseContextOutput edge cases", () => {
	it("handles empty output", () => {
		expect(parseContextOutput("")).toEqual([]);
	});

	it("handles output with confidence", () => {
		const output = `### [memory]
User prefers dark mode
Confidence: 85%`;
		const results = parseContextOutput(output);
		expect(results).toHaveLength(1);
		expect(results[0].relevance).toBe(0.85);
	});
});

describe("parseFactcheckOutput edge cases", () => {
	it("handles empty output", () => {
		const result = parseFactcheckOutput("");
		expect(result.status).toBe("unknown");
		expect(result.evidence).toEqual([]);
	});

	it("detects supported status", () => {
		const output = `✅ SUPPORTED
Confidence: 90%
- Evidence 1
- Evidence 2`;
		const result = parseFactcheckOutput(output);
		expect(result.status).toBe("supported");
		expect(result.confidence).toBe(0.9);
		expect(result.evidence).toHaveLength(2);
	});

	it("detects contradicted status", () => {
		const output = `⚠️  CONTRADICTED
Confidence: 75%
- Contradicting evidence`;
		const result = parseFactcheckOutput(output);
		expect(result.status).toBe("contradicted");
		expect(result.confidence).toBe(0.75);
	});
});

describe("parseDiaryOutput edge cases", () => {
	it("handles empty output", () => {
		expect(parseDiaryOutput("")).toEqual([]);
	});

	it("handles output with multiple entries", () => {
		const output = `[2024-01-01T00:00:00Z] First Session
Session: session-1
Summary: Did something

[2024-01-02T00:00:00Z] Second Session
Session: session-2
Summary: Did more`;
		const entries = parseDiaryOutput(output);
		expect(entries).toHaveLength(2);
		expect(entries[0].title).toBe("First Session");
		expect(entries[1].title).toBe("Second Session");
	});
});

describe("parseStatsOutput edge cases", () => {
	it("handles empty output", () => {
		const stats = parseStatsOutput("");
		expect(stats.vaults).toBe(0);
		expect(stats.memories).toBe(0);
	});

	it("parses all fields", () => {
		const output = `Vaults: 2
Memories: 150
ChromaDefaultProvider dim=384
Total: 200
Active: 150
Archived: 50
main: 100 memories
bugs: 50 memories
Nodes: 25
Edges: 40
depends_on: 15
uses: 25`;
		const stats = parseStatsOutput(output);
		expect(stats.vaults).toBe(2);
		expect(stats.memories).toBe(150);
		expect(stats.tracking.total).toBe(200);
		expect(stats.tracking.active).toBe(150);
		expect(stats.tracking.byVault.main).toBe(100);
		expect(stats.graph.nodes).toBe(25);
		expect(stats.graph.edges).toBe(40);
	});
});
