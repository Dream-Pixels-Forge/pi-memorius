/**
 * pi-memorius — Shared Types
 *
 * Core type definitions shared across the extension.
 */
export interface StoreOptions {
	vault?: string;
	shelf?: string;
	folder?: string;
	note?: string;
}

export interface SearchResult {
	id?: string;
	content: string;
	score?: number;
	vault?: string;
	shelf?: string;
	folder?: string;
	note?: string;
}

export interface ContextResult {
	content: string;
	relevance: number;
}

export interface VaultStats {
	vaults: number;
	memories: number;
	embeddings: { provider: string; dim: number };
	tracking: {
		total: number;
		active: number;
		archived: number;
		byVault: Record<string, number>;
	};
	graph: { nodes: number; edges: number; relations: Record<string, number> };
}

export interface DiaryEntry {
	session_id: string;
	title: string;
	summary: string;
	content: string;
	timestamp: string;
}

export interface FactCheckResult {
	status: "supported" | "contradicted" | "unknown";
	evidence: string[];
	confidence: number;
}
