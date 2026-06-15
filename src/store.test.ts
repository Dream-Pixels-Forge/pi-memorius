/**
 * Tests for validation and error handling in store.
 */
import { describe, expect, it } from "vitest";
import type { MemoriusConfig } from "./config.js";
import { MemoriusStore } from "./store.js";

describe("MemoriusStore constructor", () => {
	it("accepts valid config", () => {
		const store = new MemoriusStore({
			memoriusCliPath: "/usr/bin/echo",
		} as unknown as MemoriusConfig);
		expect(store).toBeDefined();
	});
});

describe("Store validation", () => {
	function makeStore(): MemoriusStore {
		// Use /usr/bin/echo as a valid executable that won't throw ENOENT
		return new MemoriusStore({
			memoriusCliPath: "/usr/bin/echo",
		} as unknown as MemoriusConfig);
	}

	it("rejects vault names with spaces", async () => {
		const store = makeStore();
		// Validation happens synchronously before any await, so reject is immediate
		await expect(
			store.search("test", 5, "my vault with spaces"),
		).rejects.toThrow(/Invalid vault/);
	});

	it("rejects shelf names with special characters", async () => {
		const store = makeStore();
		await expect(
			store.store("content", { shelf: "shelf; rm -rf" }),
		).rejects.toThrow(/Invalid shelf/);
	});

	it("rejects folder names with shell metacharacters", async () => {
		const store = makeStore();
		await expect(
			store.store("content", { folder: "$(whoami)" }),
		).rejects.toThrow(/Invalid folder/);
		await expect(
			store.store("content", { folder: "backtick`" }),
		).rejects.toThrow(/Invalid folder/);
	});

	it("accepts valid identifiers", async () => {
		const store = makeStore();
		// These should pass validation (even though echo CLI output is meaningless)
		// The important thing is they don't throw IdentifierError before the CLI call
		const result = await store.ls("main");
		expect(typeof result).toBe("string"); // CLI ran, returned something
	});
});
