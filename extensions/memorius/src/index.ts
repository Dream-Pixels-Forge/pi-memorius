/**
 * pi-memorius — Vector-Powered Memory Vault for Pi
 *
 * A better version of pi-hermes-memory that provides:
 * - Vector/semantic search (via memorius CLI + ChromaDB embeddings)
 * - Knowledge graph (entity relationship tracking)
 * - Fact checking (contradiction detection)
 * - Memory mining (auto-extract from conversations)
 * - Session diaries (structured session documentation)
 * - Smart context injection (auto-inject relevant memories)
 * - Hierarchical vault organization (vault/shelf/folder/note)
 * - Obsidian sync (import/export)
 * - Rich TUI components
 * - Background learning loop
 *
 * Backed by the memorius CLI (Python + ChromaDB) for vector operations.
 *
 * Installation:
 *   pi install git:github:Dream-Pixels-Forge/pi-memorius
 *   # or
 *   pi install /path/to/pi-memorius
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCommands } from "./commands.js";
import { loadConfig } from "./config.js";
import { DiaryManager } from "./diary.js";
import { registerEventHandlers } from "./events.js";
import { GraphManager } from "./graph.js";
import { MemoriusStore } from "./store.js";
import { registerTools } from "./tools.js";

export default function (pi: ExtensionAPI) {
	// ── Load Configuration ──────────────────────────────────────────────────
	const config = loadConfig();

	// ── Initialize Core Services ────────────────────────────────────────────
	const store = new MemoriusStore(config);
	const graph = new GraphManager();
	const diary = new DiaryManager(store);

	// ── Register Tools (LLM-callable) ───────────────────────────────────────
	registerTools(pi, store, graph, diary, config);

	// ── Register Commands (slash commands) ──────────────────────────────────
	registerCommands(pi, store, graph, diary, config);

	// ── Register Event Handlers ─────────────────────────────────────────────
	registerEventHandlers(pi, store, graph, diary, config);

	// ── Startup Notification ────────────────────────────────────────────────
	pi.on("session_start", async (_event, ctx) => {
		try {
			const stats = await store.stats();
			ctx.ui.setStatus("memorius", `🧠 ${stats.tracking.active} memories`);
			ctx.ui.setStatus("graph", `🕸️  ${graph.getStats().nodes} nodes`);
		} catch (e) {
			console.debug(
				"[memorius] startup status failed:",
				e instanceof Error ? e.message : String(e),
			);
			ctx.ui.setStatus("memorius", "🧠 memorius ready");
		}
	});
}
