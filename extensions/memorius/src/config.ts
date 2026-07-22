/**
 * pi-memorius — Configuration management
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface MemoriusConfig {
	/** Default vault name */
	vault: string;
	/** Auto-store notable facts from conversations */
	autoStore: boolean;
	/** Auto-inject relevant memories as context */
	autoInject: boolean;
	/** Turns between auto-reviews */
	nudgeInterval: number;
	/** Tool calls between auto-reviews (OR with turns) */
	nudgeToolCalls: number;
	/** Enable/disable background review loop */
	reviewEnabled: boolean;
	/** Enable/disable knowledge graph */
	graphEnabled: boolean;
	/** Similarity threshold for consolidation (0-1) */
	consolidationThreshold: number;
	/** Max results for memory search */
	maxSearchResults: number;
	/** Max items for context injection */
	maxContextItems: number;
	/** Path to memorius CLI */
	memoriusCliPath: string;
}

const isWindows = process.platform === "win32";

export const DEFAULT_CONFIG: MemoriusConfig = {
	vault: "main",
	autoStore: true,
	autoInject: true,
	nudgeInterval: 10,
	nudgeToolCalls: 15,
	reviewEnabled: true,
	graphEnabled: true,
	consolidationThreshold: 0.85,
	maxSearchResults: 10,
	maxContextItems: 5,
	memoriusCliPath: isWindows
		? join(homedir(), ".local", "bin", "memorius.exe")
		: join(homedir(), ".local", "bin", "memorius"),
};

const AGENT_ROOT = join(homedir(), ".pi/agent");
export const EXTENSION_DIR = join(AGENT_ROOT, "pi-memorius");
export const CONFIG_PATH = join(AGENT_ROOT, "memorius-config.json");
export const GRAPH_PATH = join(EXTENSION_DIR, "graph.json");
export const SESSIONS_DB_PATH = join(EXTENSION_DIR, "sessions.db");

/**
 * Load configuration from disk, merging with defaults.
 */
export function loadConfig(): MemoriusConfig {
	// Ensure extension dir exists
	if (!existsSync(EXTENSION_DIR)) {
		mkdirSync(EXTENSION_DIR, { recursive: true });
	}

	try {
		if (existsSync(CONFIG_PATH)) {
			const raw = readFileSync(CONFIG_PATH, "utf8");
			const user = JSON.parse(raw) as Partial<MemoriusConfig>;
			return { ...DEFAULT_CONFIG, ...user };
		}
	} catch (e) {
		console.debug(
			"[memorius] config load failed, using defaults:",
			e instanceof Error ? e.message : String(e),
		);
	}

	return { ...DEFAULT_CONFIG };
}

/**
 * Save configuration to disk.
 */
export function saveConfig(config: MemoriusConfig): void {
	writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}
