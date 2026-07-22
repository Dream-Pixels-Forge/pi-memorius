/**
 * pi-memorius — Knowledge Graph
 *
 * Lightweight JSON-based knowledge graph for tracking entity relationships
 * between memories. Complements the memorius CLI's built-in graph.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { GRAPH_PATH } from "./config.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GraphNode {
	id: string;
	label: string;
	type: "memory" | "entity" | "concept" | "project" | "person" | "tool";
	created: number;
	updated: number;
	metadata?: Record<string, string>;
}

export interface GraphEdge {
	source: string;
	target: string;
	relation: string;
	weight: number;
	created: number;
}

export interface KnowledgeGraph {
	nodes: Record<string, GraphNode>;
	edges: GraphEdge[];
}

// ─── Graph Manager ───────────────────────────────────────────────────────────

export class GraphManager {
	private graph: KnowledgeGraph;
	private graphPath: string;

	/**
	 * @param graphPath Optional custom path for the graph file.
	 *                  Defaults to GRAPH_PATH from config.
	 */
	constructor(graphPath?: string) {
		this.graphPath = graphPath ?? GRAPH_PATH;
		this.graph = this.load();
	}

	private load(): KnowledgeGraph {
		try {
			if (existsSync(this.graphPath)) {
				const raw = readFileSync(this.graphPath, "utf8");
				return JSON.parse(raw) as KnowledgeGraph;
			}
		} catch (e) {
			console.debug(
				"[memorius] graph load failed, starting fresh:",
				e instanceof Error ? e.message : String(e),
			);
		}
		return { nodes: {}, edges: [] };
	}

	private saveTimeout: ReturnType<typeof setTimeout> | null = null;

	/** Atomic write: write to temp file, then rename to prevent corruption on crash */
	private writeAtomic(): void {
		const tmpPath = `${this.graphPath}.tmp`;
		writeFileSync(tmpPath, JSON.stringify(this.graph, null, 2), "utf8");
		renameSync(tmpPath, this.graphPath);
	}

	private scheduleSave(): void {
		if (this.saveTimeout) return;
		this.saveTimeout = setTimeout(() => {
			try {
				this.writeAtomic();
			} catch (e) {
				console.debug(
					"[memorius] graph save failed, will retry:",
					e instanceof Error ? e.message : String(e),
				);
			}
			this.saveTimeout = null;
		}, 2000);
	}

	/**
	 * Synchronously flush pending graph changes to disk.
	 * Call on shutdown to prevent data loss.
	 */
	flushSync(): void {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
		}
		try {
			this.writeAtomic();
		} catch {
			// Best-effort on shutdown
		}
	}

	// ─── Node Operations ─────────────────────────────────────────────────────

	/**
	 * Add or update a node in the graph.
	 */
	addNode(
		id: string,
		label: string,
		type: GraphNode["type"],
		metadata?: Record<string, string>,
	): GraphNode {
		const now = Date.now();
		if (this.graph.nodes[id]) {
			this.graph.nodes[id].label = label;
			this.graph.nodes[id].updated = now;
			if (metadata) {
				this.graph.nodes[id].metadata = {
					...this.graph.nodes[id].metadata,
					...metadata,
				};
			}
		} else {
			this.graph.nodes[id] = {
				id,
				label,
				type,
				created: now,
				updated: now,
				metadata,
			};
		}
		this.scheduleSave();
		return this.graph.nodes[id];
	}

	/**
	 * Get a node by ID.
	 */
	getNode(id: string): GraphNode | undefined {
		return this.graph.nodes[id];
	}

	/**
	 * Find nodes by label or type.
	 */
	findNodes(query: { label?: string; type?: GraphNode["type"] }): GraphNode[] {
		return Object.values(this.graph.nodes).filter((n) => {
			if (
				query.label &&
				!n.label.toLowerCase().includes(query.label.toLowerCase())
			)
				return false;
			if (query.type && n.type !== query.type) return false;
			return true;
		});
	}

	/**
	 * Remove a node and all its edges.
	 */
	removeNode(id: string): boolean {
		if (!this.graph.nodes[id]) return false;
		delete this.graph.nodes[id];
		this.graph.edges = this.graph.edges.filter(
			(e) => e.source !== id && e.target !== id,
		);
		this.scheduleSave();
		return true;
	}

	// ─── Pruning ─────────────────────────────────────────────────────────────

	/**
	 * Prune old memory nodes (mem_*) that haven't been updated recently.
	 * @param maxAgeMs Maximum age in milliseconds (default: 30 days)
	 * @param dryRun If true, return what would be pruned without modifying
	 */
	prune(
		maxAgeMs = 30 * 24 * 60 * 60 * 1000,
		dryRun = false,
	): { pruned: number; kept: number } {
		const cutoff = Date.now() - maxAgeMs;
		const memNodeIds = Object.keys(this.graph.nodes).filter(
			(id) => id.startsWith("mem_") && this.graph.nodes[id].updated < cutoff,
		);

		if (dryRun) {
			return {
				pruned: memNodeIds.length,
				kept: Object.keys(this.graph.nodes).length - memNodeIds.length,
			};
		}

		for (const id of memNodeIds) {
			delete this.graph.nodes[id];
		}

		// Remove edges referencing pruned nodes
		const prunedSet = new Set(memNodeIds);
		this.graph.edges = this.graph.edges.filter(
			(e) => !prunedSet.has(e.source) && !prunedSet.has(e.target),
		);

		if (memNodeIds.length > 0) {
			this.scheduleSave();
		}

		return {
			pruned: memNodeIds.length,
			kept: Object.keys(this.graph.nodes).length,
		};
	}

	// ─── Edge Operations ─────────────────────────────────────────────────────

	/**
	 * Add a relationship between two nodes.
	 */
	addEdge(
		source: string,
		target: string,
		relation: string,
		weight = 1,
	): GraphEdge {
		const edge: GraphEdge = {
			source,
			target,
			relation,
			weight,
			created: Date.now(),
		};

		// Update weight if edge already exists
		const existing = this.graph.edges.findIndex(
			(e) =>
				e.source === source && e.target === target && e.relation === relation,
		);
		if (existing >= 0) {
			this.graph.edges[existing].weight += weight;
			this.graph.edges[existing].created = Date.now();
			this.scheduleSave();
			return this.graph.edges[existing];
		}

		this.graph.edges.push(edge);
		this.scheduleSave();
		return edge;
	}

	/**
	 * Query edges from/to a node.
	 */
	getEdges(nodeId: string): { outgoing: GraphEdge[]; incoming: GraphEdge[] } {
		return {
			outgoing: this.graph.edges.filter((e) => e.source === nodeId),
			incoming: this.graph.edges.filter((e) => e.target === nodeId),
		};
	}

	/**
	 * Query the graph with filters.
	 */
	query(options: {
		nodeType?: GraphNode["type"];
		relation?: string;
		sourceId?: string;
		targetId?: string;
		limit?: number;
	}): { nodes: GraphNode[]; edges: GraphEdge[] } {
		let edges = this.graph.edges;

		if (options.relation) {
			edges = edges.filter((e) => e.relation === options.relation);
		}
		if (options.sourceId) {
			edges = edges.filter((e) => e.source === options.sourceId);
		}
		if (options.targetId) {
			edges = edges.filter((e) => e.target === options.targetId);
		}

		// Collect involved node IDs
		const nodeIds = new Set<string>();
		for (const e of edges) {
			nodeIds.add(e.source);
			nodeIds.add(e.target);
		}

		let nodes: GraphNode[] = Array.from(nodeIds)
			.map((id) => this.graph.nodes[id])
			.filter((n): n is GraphNode => n !== undefined);

		if (options.nodeType) {
			nodes = nodes.filter((n) => n.type === options.nodeType);
		}

		if (options.limit && options.limit > 0) {
			edges = edges.slice(0, options.limit);
			nodes = nodes.slice(0, options.limit);
		}

		return { nodes, edges };
	}

	// ─── Stats ───────────────────────────────────────────────────────────────

	/**
	 * Get graph statistics.
	 */
	getStats(): {
		nodes: number;
		edges: number;
		byType: Record<string, number>;
		relations: Record<string, number>;
	} {
		const byType: Record<string, number> = {};
		for (const node of Object.values(this.graph.nodes)) {
			byType[node.type] = (byType[node.type] || 0) + 1;
		}

		const relations: Record<string, number> = {};
		for (const edge of this.graph.edges) {
			relations[edge.relation] = (relations[edge.relation] || 0) + 1;
		}

		return {
			nodes: Object.keys(this.graph.nodes).length,
			edges: this.graph.edges.length,
			byType,
			relations,
		};
	}

	// ─── Bulk Import ─────────────────────────────────────────────────────────

	/**
	 * Bulk-add nodes and edges from a extracted memory result.
	 */
	importFromExtracted(
		memories: Array<{
			content: string;
			type?: string;
			entities?: Array<{ name: string; type: string }>;
			relations?: Array<{ source: string; target: string; relation: string }>;
		}>,
	): { nodesAdded: number; edgesAdded: number } {
		let nodesAdded = 0;
		let edgesAdded = 0;

		for (const mem of memories) {
			const memId = `mem_${Buffer.from(mem.content).toString("base64").slice(0, 16)}`;
			this.addNode(memId, mem.content.slice(0, 100), "memory", {
				type: mem.type ?? "general",
			});
			nodesAdded++;

			for (const entity of mem.entities ?? []) {
				const entityId = `ent_${entity.name.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
				if (!this.graph.nodes[entityId]) {
					const validTypes: GraphNode["type"][] = [
						"memory",
						"entity",
						"concept",
						"project",
						"person",
						"tool",
					];
					const nodeType = validTypes.includes(entity.type as GraphNode["type"])
						? (entity.type as GraphNode["type"])
						: "entity";
					this.addNode(entityId, entity.name, nodeType);
					nodesAdded++;
				}
				this.addEdge(entityId, memId, "mentioned_in");
				edgesAdded++;
			}

			for (const rel of mem.relations ?? []) {
				const srcId = `ent_${rel.source.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
				const tgtId = `ent_${rel.target.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
				this.addEdge(srcId, tgtId, rel.relation);
				edgesAdded++;
			}
		}

		this.scheduleSave();
		return { nodesAdded, edgesAdded };
	}

	/**
	 * Get the full graph.
	 */
	getFullGraph(): KnowledgeGraph {
		return this.graph;
	}

	/**
	 * Format graph stats as a readable string.
	 */
	formatStats(): string {
		const stats = this.getStats();
		const lines: string[] = [
			"╔══════════════════════════════════════╗",
			"║        📊 Knowledge Graph            ║",
			"╚══════════════════════════════════════╝",
			"",
			`  Nodes: ${stats.nodes}`,
			`  Edges: ${stats.edges}`,
			"",
			"  By Type:",
			...Object.entries(stats.byType).map(
				([type, count]) => `    ${type}: ${count}`,
			),
			"",
			"  Relations:",
			...Object.entries(stats.relations).map(
				([rel, count]) => `    ${rel}: ${count}`,
			),
		];
		return lines.join("\n");
	}
}
