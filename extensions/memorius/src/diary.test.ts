/**
 * Tests for the diary manager.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiaryManager } from "./diary.js";
import type { MemoriusStore } from "./store.js";
import type { DiaryEntry } from "./types.js";

function createMockStore(): MemoriusStore {
	return {
		diary: vi.fn().mockResolvedValue("diary created"),
		listDiaries: vi.fn().mockResolvedValue([]),
	} as unknown as MemoriusStore;
}

describe("DiaryManager", () => {
	let store: MemoriusStore;
	let diary: DiaryManager;

	beforeEach(() => {
		store = createMockStore();
		diary = new DiaryManager(store);
	});

	it("writes a diary entry", async () => {
		const result = await diary.writeDiary(
			"session-123",
			"Test Session",
			"Summary",
			"Content",
			5,
		);
		expect(result).toBe("diary created");
		expect(store.diary).toHaveBeenCalledWith(
			"session-123",
			"Test Session",
			"Summary",
			"Content",
			5,
		);
	});

	it("lists diary entries", async () => {
		const entries: DiaryEntry[] = [
			{
				session_id: "session-1",
				title: "First Session",
				summary: "Did something",
				content: "Details",
				timestamp: "2024-01-01T00:00:00Z",
			},
		];
		(store.listDiaries as ReturnType<typeof vi.fn>).mockResolvedValue(entries);

		const result = await diary.listDiaries(5);
		expect(result).toEqual(entries);
		expect(store.listDiaries).toHaveBeenCalledWith(5);
	});

	it("formats empty diary list", () => {
		const output = diary.formatDiaries([]);
		expect(output).toBe("No diary entries found.");
	});

	it("formats diary entries", () => {
		const entries: DiaryEntry[] = [
			{
				session_id: "session-1",
				title: "First Session",
				summary: "Did something",
				content: "Details",
				timestamp: "2024-01-01T00:00:00Z",
			},
			{
				session_id: "session-2",
				title: "Second Session",
				summary: "Did more",
				content: "More details",
				timestamp: "2024-01-02T00:00:00Z",
			},
		];

		const output = diary.formatDiaries(entries);
		expect(output).toContain("Session Diaries");
		expect(output).toContain("First Session");
		expect(output).toContain("Second Session");
		expect(output).toContain("session-1");
		expect(output).toContain("session-2");
	});
});
