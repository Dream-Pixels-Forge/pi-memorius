/**
 * Tests for the knowledge graph.
 */

import { tmpdir } from "node:os";

import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { GraphManager } from "./graph.js";

function tempGraphPath(): string {
	return join(
		tmpdir(),
		`pi-memorius-graph-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`,
	);
}

describe("GraphManager", () => {
	let graphPath: string;
	let graph: GraphManager;

	beforeEach(() => {
		graphPath = tempGraphPath();
		graph = new GraphManager(graphPath);
	});

	it("starts with empty graph", () => {
		const stats = graph.getStats();
		expect(stats.nodes).toBe(0);
		expect(stats.edges).toBe(0);
	});

	it("adds a node", () => {
		const node = graph.addNode("test-1", "Test Node", "entity");
		expect(node.id).toBe("test-1");
		expect(node.label).toBe("Test Node");
		expect(node.type).toBe("entity");
		expect(node.created).toBeGreaterThan(0);
		expect(node.updated).toBeGreaterThan(0);
	});

	it("updates existing node label", () => {
		graph.addNode("test-1", "Original", "entity");
		const updated = graph.addNode("test-1", "Updated", "entity");
		expect(updated.label).toBe("Updated");
	});

	it("adds metadata to node", () => {
		const node = graph.addNode("test-1", "Node", "memory", {
			shelf: "bugs",
			folder: "project-x",
		});
		expect(node.metadata).toBeDefined();
		expect(node.metadata?.shelf).toBe("bugs");
		expect(node.metadata?.folder).toBe("project-x");
	});

	it("adds an edge between two nodes", () => {
		graph.addNode("a", "Node A", "entity");
		graph.addNode("b", "Node B", "entity");
		const edge = graph.addEdge("a", "b", "depends_on");
		expect(edge.source).toBe("a");
		expect(edge.target).toBe("b");
		expect(edge.relation).toBe("depends_on");
		expect(edge.weight).toBe(1);
	});

	it("increments weight for duplicate edges", () => {
		graph.addNode("a", "A", "entity");
		graph.addNode("b", "B", "entity");
		graph.addEdge("a", "b", "depends_on", 1);
		const edge = graph.addEdge("a", "b", "depends_on", 2);
		expect(edge.weight).toBe(3); // 1 + 2
	});

	it("removes a node and its edges", () => {
		graph.addNode("a", "A", "entity");
		graph.addNode("b", "B", "entity");
		graph.addEdge("a", "b", "connects");

		const removed = graph.removeNode("a");
		expect(removed).toBe(true);
		expect(graph.getNode("a")).toBeUndefined();
		const edges = graph.getEdges("b");
		expect(edges.incoming).toHaveLength(0);
	});

	it("returns false for removing non-existent node", () => {
		expect(graph.removeNode("nonexistent")).toBe(false);
	});

	it("finds nodes by label", () => {
		graph.addNode("a", "Alpha", "entity");
		graph.addNode("b", "Beta", "entity");
		const found = graph.findNodes({ label: "alp" });
		expect(found).toHaveLength(1);
		expect(found[0].id).toBe("a");
	});

	it("finds nodes by type", () => {
		graph.addNode("a", "Alpha", "entity");
		graph.addNode("b", "Beta", "concept");
		const found = graph.findNodes({ type: "concept" });
		expect(found).toHaveLength(1);
		expect(found[0].id).toBe("b");
	});

	it("queries edges with filters", () => {
		graph.addNode("a", "A", "entity");
		graph.addNode("b", "B", "entity");
		graph.addNode("c", "C", "entity");
		graph.addEdge("a", "b", "knows");
		graph.addEdge("b", "c", "knows");

		const result = graph.query({ relation: "knows" });
		expect(result.edges).toHaveLength(2);

		const filtered = graph.query({ sourceId: "a" });
		expect(filtered.edges).toHaveLength(1);
	});

	it("provides formatted stats", () => {
		graph.addNode("a", "A", "entity");
		graph.addNode("b", "B", "concept");
		graph.addEdge("a", "b", "related");

		const formatted = graph.formatStats();
		expect(formatted).toContain("Nodes: 2");
		expect(formatted).toContain("Edges: 1");
		expect(formatted).toContain("entity: 1");
		expect(formatted).toContain("concept: 1");
	});

	it("provides stats with type and relation breakdowns", () => {
		graph.addNode("a", "A", "project");
		graph.addNode("b", "B", "tool");
		graph.addEdge("a", "b", "uses");

		const stats = graph.getStats();
		expect(stats.byType.project).toBe(1);
		expect(stats.byType.tool).toBe(1);
		expect(stats.relations.uses).toBe(1);
	});

	it("persists to disk and can be reloaded", () => {
		graph.addNode("persist-me", "Will survive reload", "entity");
		// flushSync writes to disk
		graph.flushSync();

		// Create a new graph manager reading the same path
		const graph2 = new GraphManager(graphPath);
		const node = graph2.getNode("persist-me");
		expect(node).toBeDefined();
		expect(node?.label).toBe("Will survive reload");
	});

	describe("pruning", () => {
		it("prunes old mem_* nodes", () => {
			// Add old memory node (simulated by setting updated to past)
			graph.addNode("mem_old", "Old memory", "memory");
			graph.addNode("mem_new", "New memory", "memory");
			graph.addNode("entity-1", "Important entity", "entity");

			// Manually set the old node's updated time to 31 days ago
			const fullGraph = graph.getFullGraph();
			fullGraph.nodes.mem_old.updated = Date.now() - 31 * 24 * 60 * 60 * 1000;

			const result = graph.prune(30 * 24 * 60 * 60 * 1000);
			expect(result.pruned).toBe(1);
			expect(result.kept).toBe(2);
			expect(graph.getNode("mem_old")).toBeUndefined();
			expect(graph.getNode("mem_new")).toBeDefined();
			expect(graph.getNode("entity-1")).toBeDefined();
		});

		it("prunes edges when node is pruned", () => {
			graph.addNode("mem_old", "Old memory", "memory");
			graph.addNode("entity-1", "Entity", "entity");
			graph.addEdge("entity-1", "mem_old", "mentioned_in");

			const fullGraph = graph.getFullGraph();
			fullGraph.nodes.mem_old.updated = Date.now() - 31 * 24 * 60 * 60 * 1000;

			graph.prune(30 * 24 * 60 * 60 * 1000);
			const edges = graph.getEdges("entity-1");
			expect(edges.outgoing).toHaveLength(0);
		});

		it("dry run does not modify graph", () => {
			graph.addNode("mem_old", "Old memory", "memory");
			const fullGraph = graph.getFullGraph();
			fullGraph.nodes.mem_old.updated = Date.now() - 31 * 24 * 60 * 60 * 1000;

			const result = graph.prune(30 * 24 * 60 * 60 * 1000, true);
			expect(result.pruned).toBe(1);
			expect(graph.getNode("mem_old")).toBeDefined();
		});

		it("does not prune non-memory nodes", () => {
			graph.addNode("entity-old", "Old entity", "entity");
			const fullGraph = graph.getFullGraph();
			fullGraph.nodes["entity-old"].updated =
				Date.now() - 31 * 24 * 60 * 60 * 1000;

			const result = graph.prune(30 * 24 * 60 * 60 * 1000);
			expect(result.pruned).toBe(0);
			expect(result.kept).toBe(1);
		});

		it("does not prune recent mem_* nodes", () => {
			graph.addNode("mem_recent", "Recent memory", "memory");

			const result = graph.prune(30 * 24 * 60 * 60 * 1000);
			expect(result.pruned).toBe(0);
			expect(result.kept).toBe(1);
		});
	});
});
