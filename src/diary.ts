/**
 * pi-memorius — Session Diary Manager
 *
 * Manages structured session diary entries stored via the memorius CLI
 * and also tracked locally for quick access.
 */
import type { MemoriusStore } from "./store.js";
import type { DiaryEntry } from "./types.js";

// ─── Diary Manager ───────────────────────────────────────────────────────────

export class DiaryManager {
	constructor(private store: MemoriusStore) {}

	/**
	 * Write a diary entry for the current session.
	 */
	async writeDiary(
		sessionId: string,
		title: string,
		summary: string,
		content: string,
		exchangeCount?: number,
	): Promise<string> {
		return this.store.diary(sessionId, title, summary, content, exchangeCount);
	}

	/**
	 * List recent diary entries.
	 */
	async listDiaries(limit = 10): Promise<DiaryEntry[]> {
		return this.store.listDiaries(limit);
	}

	/**
	 * Format diary entries for display.
	 */
	formatDiaries(entries: DiaryEntry[]): string {
		if (entries.length === 0) {
			return "No diary entries found.";
		}

		const lines: string[] = [
			"╔══════════════════════════════════════╗",
			"║        📔 Session Diaries             ║",
			"╚══════════════════════════════════════╝",
			"",
		];

		for (const entry of entries) {
			const date = new Date(entry.timestamp).toLocaleString();
			lines.push(`  [${date}] ${entry.title}`);
			lines.push(`  Session: ${entry.session_id}`);
			lines.push(`  ${entry.summary}`);
			lines.push("");
		}

		return lines.join("\n");
	}
}
