/**
 * Tests for the CLI text output parsers.
 * These are pure functions with no dependencies — ideal for unit testing.
 */
import { describe, expect, it } from "vitest";
import { parseDiaryOutput } from "./parsers.js";

describe("parseDiaryOutput", () => {
	it("parses a single diary entry", () => {
		const output = [
			"[2026-06-15 10:00:00] My Session Title",
			"Session: session-20260615",
			"Summary: A productive session",
			"",
			"Some detailed content here",
			"",
		].join("\n");

		const entries = parseDiaryOutput(output);
		expect(entries).toHaveLength(1);
		expect(entries[0].session_id).toBe("session-20260615");
		expect(entries[0].title).toBe("My Session Title");
		expect(entries[0].summary).toBe("A productive session");
	});

	it("returns empty array for empty input", () => {
		expect(parseDiaryOutput("")).toHaveLength(0);
		expect(parseDiaryOutput("   ")).toHaveLength(0);
	});

	it("returns empty array for malformed input without session id", () => {
		const output = ["[2026-06-15] Orphan Entry", "No session field here"].join(
			"\n",
		);
		expect(parseDiaryOutput(output)).toHaveLength(0);
	});

	it("parses multiple diary entries separated by blank lines", () => {
		const output = [
			"[2026-06-15 10:00] First Session",
			"Session: session-001",
			"Summary: First session",
			"",
			"",
			"[2026-06-15 14:00] Second Session",
			"Session: session-002",
			"Summary: Second session",
		].join("\n");

		const entries = parseDiaryOutput(output);
		expect(entries).toHaveLength(2);
		expect(entries[0].session_id).toBe("session-001");
		expect(entries[1].session_id).toBe("session-002");
	});

	it("falls back to first content line as summary when no Summary: prefix", () => {
		const output = [
			"[2026-06-15] My Title",
			"Session: session-123",
			"This is the first content line that becomes the summary",
			"More details here",
		].join("\n");

		const [entry] = parseDiaryOutput(output);
		expect(entry.summary).toBe(
			"This is the first content line that becomes the summary",
		);
	});
});
