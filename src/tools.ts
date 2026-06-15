/**
 * pi-memorius — Tool Registrations
 *
 * Registers 9 custom tools the LLM can call proactively for memory operations.
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { MemoriusConfig } from "./config.js";
import type { DiaryManager } from "./diary.js";
import type { GraphManager } from "./graph.js";
import type { MemoriusStore } from "./store.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Structured error response for tool results */
function toolError(prefix: string, err: unknown) {
	const msg = err instanceof Error ? err.message : String(err);
	return {
		content: [{ type: "text" as const, text: `❌ ${prefix}: ${msg}` }],
		details: { error: msg },
		isError: true as const,
	};
}

// ─── Module ──────────────────────────────────────────────────────────────────

export function registerTools(
	pi: ExtensionAPI,
	store: MemoriusStore,
	graph: GraphManager,
	diary: DiaryManager,
	config: MemoriusConfig,
): void {
	// ── memorius_store ────────────────────────────────────────────────────────
	pi.registerTool({
		name: "memorius_store",
		label: "Memorius Store",
		description:
			"Store a memory in the vector vault. Memories persist across sessions and are searchable via semantic similarity. Use this when the user says 'remember this', 'save this', or after completing a task, fixing a bug, or learning something new.",
		promptSnippet:
			"Store a fact, preference, bug fix, or decision in the vault",
		promptGuidelines: [
			"Use memorius_store when the user asks you to remember, save, or note something down.",
			"Use memorius_store after fixing a bug to preserve the root cause and solution.",
			"Use memorius_store when you learn something new about the user's preferences or workflow.",
			"Store with appropriate shelf/folder organization: bugs/, decisions/, conventions/, learnings/, projects/.",
		],
		parameters: Type.Object({
			content: Type.String({ description: "Memory content to store" }),
			shelf: Type.Optional(
				Type.String({
					description:
						"Shelf category: bugs, decisions, conventions, learnings, projects, preferences, workflows, errors, meetings, daily",
				}),
			),
			folder: Type.Optional(
				Type.String({
					description: "Folder name for grouping (e.g., project name)",
				}),
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			try {
				await store.store(
					params.content,
					{
						vault: config.vault,
						shelf: params.shelf ?? "default",
						folder: params.folder ?? "default",
					},
					signal,
				);

				// Also add to knowledge graph (best-effort — don't fail the store if graph fails)
				try {
					graph.addNode(
						`mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
						params.content.slice(0, 100),
						"memory",
						{
							shelf: params.shelf ?? "default",
							folder: params.folder ?? "default",
						},
					);
				} catch (graphErr) {
					console.debug(
						"[memorius] graph node addition failed (non-fatal):",
						graphErr instanceof Error ? graphErr.message : String(graphErr),
					);
				}

				return {
					content: [
						{
							type: "text",
							text: `✅ Stored: "${params.content.slice(0, 200)}"`,
						},
					],
					details: {
						success: true,
						vault: config.vault,
						shelf: params.shelf ?? "default",
					},
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [
						{ type: "text", text: `❌ Failed to store memory: ${msg}` },
					],
					details: { error: msg },
					isError: true,
				};
			}
		},
	});

	// ── memorius_search ───────────────────────────────────────────────────────
	pi.registerTool({
		name: "memorius_search",
		label: "Memorius Search",
		description:
			"Semantic search across all stored memories. Finds relevant memories by meaning, not just keywords. Use when the user asks 'what do I know about X', 'have I seen this before', or when you need context about past work.",
		promptSnippet: "Search memories semantically for relevant past context",
		promptGuidelines: [
			"Use memorius_search before answering questions about past work or user preferences.",
			"Use memorius_search when the user references something from a previous session.",
			"Use memorius_search when you need to check if something has been done before.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "Natural language search query" }),
			n: Type.Optional(
				Type.Number({ description: "Number of results (default: 5)" }),
			),
			shelf: Type.Optional(
				Type.String({ description: "Filter by shelf category" }),
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			try {
				const results = await store.search(
					params.query,
					params.n ?? config.maxSearchResults,
					config.vault,
					params.shelf,
					signal,
				);

				if (!results || results.length === 0) {
					return {
						content: [{ type: "text", text: "🔍 No relevant memories found." }],
						details: { count: 0 },
					};
				}

				const formatted = results
					.map(
						(r, i) =>
							`${i + 1}. [${r.score !== undefined ? `${(r.score * 100).toFixed(0)}%` : "?"}] ${r.content}`,
					)
					.join("\n");

				return {
					content: [
						{
							type: "text",
							text: `🔍 Found ${results.length} memory/ies:\n${formatted}`,
						},
					],
					details: { count: results.length, results },
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `❌ Search failed: ${msg}` }],
					details: { error: msg },
					isError: true,
				};
			}
		},
	});

	// ── memorius_context ─────────────────────────────────────────────────────
	pi.registerTool({
		name: "memorius_context",
		label: "Memorius Context",
		description:
			"Get relevant memories for context injection. Returns the most semantically relevant memories for a given topic. Use before starting a task, answering a question about past work, or making recommendations.",
		promptSnippet: "Retrieve relevant context from past memories",
		promptGuidelines: [
			"Use memorius_context when starting a new task to bring relevant context into the conversation.",
			"Use memorius_context when the user switches context to a previously discussed topic.",
		],
		parameters: Type.Object({
			topic: Type.String({ description: "Topic to find relevant context for" }),
			max: Type.Optional(
				Type.Number({ description: "Maximum items to return (default: 5)" }),
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			try {
				const results = await store.context(
					params.topic,
					params.max ?? config.maxContextItems,
					config.vault,
					signal,
				);

				if (!results || results.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: "No relevant context found for this topic.",
							},
						],
						details: { count: 0 },
					};
				}

				const formatted = results
					.map(
						(r, i) =>
							`${i + 1}. (relevance: ${(r.relevance * 100).toFixed(0)}%) ${r.content}`,
					)
					.join("\n");

				return {
					content: [
						{
							type: "text",
							text: `📋 Context for "${params.topic}":\n${formatted}`,
						},
					],
					details: { count: results.length, results },
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [
						{ type: "text", text: `❌ Context retrieval failed: ${msg}` },
					],
					details: { error: msg },
					isError: true,
				};
			}
		},
	});

	// ── memorius_factcheck ───────────────────────────────────────────────────
	pi.registerTool({
		name: "memorius_factcheck",
		label: "Memorius Fact Check",
		description:
			"Check a statement against stored memories to detect contradictions or find supporting evidence. Use when you need to verify something against what was previously learned or decided.",
		promptSnippet: "Check a statement against stored facts",
		promptGuidelines: [
			"Use memorius_factcheck before contradicting a user to verify if you have stored facts that support their position.",
			"Use memorius_factcheck when the user makes a claim that might contradict past decisions or preferences.",
		],
		parameters: Type.Object({
			statement: Type.String({
				description: "Statement to verify against stored memories",
			}),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			try {
				const result = await store.factcheck(params.statement, signal);

				let text: string;
				if (result.status === "supported") {
					text = `✅ Supported (confidence: ${(result.confidence * 100).toFixed(0)}%)\nEvidence:\n${result.evidence.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}`;
				} else if (result.status === "contradicted") {
					text = `⚠️  Contradicted (confidence: ${(result.confidence * 100).toFixed(0)}%)\nContradicting evidence:\n${result.evidence.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}`;
				} else {
					text = "❓ Unknown — no supporting or contradicting memories found.";
				}

				return {
					content: [{ type: "text", text }],
					details: result,
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `❌ Fact check failed: ${msg}` }],
					details: { error: msg },
					isError: true,
				};
			}
		},
	});

	// ── memorius_mine ────────────────────────────────────────────────────────
	pi.registerTool({
		name: "memorius_mine",
		label: "Memorius Mine",
		description:
			"Extract structured memories from the recent conversation. Analyzes the conversation to identify decisions, facts, preferences, and action items, storing them automatically. Use after a significant conversation or when wrapping up a task.",
		promptSnippet: "Extract structured memories from conversation",
		promptGuidelines: [
			"Use memorius_mine after completing a complex task to extract key decisions and learnings.",
			"Use memorius_mine at the end of a meeting or planning session.",
		],
		parameters: Type.Object({
			transcript: Type.String({
				description: "Conversation transcript or summary to mine memories from",
			}),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			try {
				const result = await store.mine(
					params.transcript,
					config.vault,
					signal,
				);
				return {
					content: [{ type: "text", text: `⛏️ Mining complete:\n${result}` }],
					details: { result },
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `❌ Mining failed: ${msg}` }],
					details: { error: msg },
					isError: true,
				};
			}
		},
	});

	// ── memorius_diary ───────────────────────────────────────────────────────
	pi.registerTool({
		name: "memorius_diary",
		label: "Memorius Diary",
		description:
			"Write a diary entry for the current session. Use when wrapping up a session with significant work done, decisions made, or bugs fixed.",
		promptSnippet: "Write a session diary entry",
		promptGuidelines: [
			"Use memorius_diary at the end of a productive session to document what was accomplished.",
			"Use memorius_diary after fixing a critical bug or implementing a major feature.",
		],
		parameters: Type.Object({
			sessionId: Type.String({ description: "Session identifier" }),
			title: Type.String({ description: "Diary title" }),
			summary: Type.String({
				description: "One-paragraph summary of the session",
			}),
			content: Type.Optional(
				Type.String({ description: "Detailed diary content" }),
			),
			exchangeCount: Type.Optional(
				Type.Number({ description: "Number of exchanges in the session" }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				await diary.writeDiary(
					params.sessionId,
					params.title,
					params.summary,
					params.content ?? params.summary,
					params.exchangeCount,
				);
				return {
					content: [
						{
							type: "text",
							text: `📔 Diary created:\n  Session: ${params.sessionId}\n  Title: ${params.title}\n  Summary: ${params.summary}`,
						},
					],
					details: { success: true, sessionId: params.sessionId },
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `❌ Diary creation failed: ${msg}` }],
					details: { error: msg },
					isError: true,
				};
			}
		},
	});

	// ── memorius_consolidate ─────────────────────────────────────────────────
	pi.registerTool({
		name: "memorius_consolidate",
		label: "Memorius Consolidate",
		description:
			"Consolidate similar memories in the vault. Merges duplicates and extracts insights. Use when the vault has grown large or when you notice overlapping information.",
		promptSnippet: "Merge similar memories and clean up the vault",
		parameters: Type.Object({
			dryRun: Type.Optional(
				Type.Boolean({ description: "Preview changes without applying them" }),
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			try {
				const result = await store.consolidate(
					config.vault,
					config.consolidationThreshold,
					params.dryRun,
					signal,
				);
				return {
					content: [
						{
							type: "text",
							text: params.dryRun
								? `🔀 Preview consolidation:\n${result}`
								: `🔀 Consolidation complete:\n${result}`,
						},
					],
					details: { result },
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `❌ Consolidation failed: ${msg}` }],
					details: { error: msg },
					isError: true,
				};
			}
		},
	});

	// ── memorius_graph_add ───────────────────────────────────────────────────
	pi.registerTool({
		name: "memorius_graph_add",
		label: "Memorius Graph Add",
		description:
			"Add an entity or relationship to the knowledge graph. Use to track connections between concepts, projects, people, and tools.",
		promptSnippet: "Add an entity/relationship to the knowledge graph",
		parameters: Type.Object({
			action: StringEnum(["add_node", "add_edge"] as const),
			nodeId: Type.Optional(
				Type.String({
					description:
						"Node identifier (for add_node or source node for add_edge)",
				}),
			),
			nodeLabel: Type.Optional(
				Type.String({ description: "Human-readable label" }),
			),
			nodeType: Type.Optional(
				StringEnum(["entity", "concept", "project", "person", "tool"] as const),
			),
			targetId: Type.Optional(
				Type.String({ description: "Target node ID for add_edge" }),
			),
			relation: Type.Optional(
				Type.String({
					description: "Relationship type (e.g., depends_on, uses, implements)",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				if (params.action === "add_node" && params.nodeId && params.nodeLabel) {
					graph.addNode(
						params.nodeId,
						params.nodeLabel,
						params.nodeType ?? "entity",
					);
					return {
						content: [
							{
								type: "text",
								text: `✅ Added node: ${params.nodeId} ("${params.nodeLabel}")`,
							},
						],
						details: { action: "add_node", nodeId: params.nodeId },
					};
				}

				if (
					params.action === "add_edge" &&
					params.nodeId &&
					params.targetId &&
					params.relation
				) {
					graph.addEdge(params.nodeId, params.targetId, params.relation);
					return {
						content: [
							{
								type: "text",
								text: `✅ Added edge: ${params.nodeId} --[${params.relation}]--> ${params.targetId}`,
							},
						],
						details: {
							action: "add_edge",
							source: params.nodeId,
							target: params.targetId,
							relation: params.relation,
						},
					};
				}

				return {
					content: [
						{
							type: "text",
							text: "❌ Invalid parameters for graph operation.",
						},
					],
					details: { error: "Invalid parameters" },
					isError: true,
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [
						{ type: "text", text: `❌ Graph operation failed: ${msg}` },
					],
					details: { error: msg },
					isError: true,
				};
			}
		},
	});

	// ── memorius_graph_query ─────────────────────────────────────────────────
	pi.registerTool({
		name: "memorius_graph_query",
		label: "Memorius Graph Query",
		description:
			"Query the knowledge graph to find relationships between entities. Use to discover connections between concepts, projects, tools, and people.",
		promptSnippet: "Query the knowledge graph for relationships",
		parameters: Type.Object({
			nodeType: Type.Optional(
				StringEnum([
					"entity",
					"concept",
					"project",
					"person",
					"tool",
					"memory",
				] as const),
			),
			relation: Type.Optional(
				Type.String({ description: "Filter by relationship type" }),
			),
			sourceId: Type.Optional(
				Type.String({ description: "Find edges from this node" }),
			),
			targetId: Type.Optional(
				Type.String({ description: "Find edges to this node" }),
			),
			limit: Type.Optional(Type.Number({ description: "Max results" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const result = graph.query({
					nodeType: params.nodeType,
					relation: params.relation,
					sourceId: params.sourceId,
					targetId: params.targetId,
					limit: params.limit,
				});

				if (result.nodes.length === 0 && result.edges.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: "No graph results found matching your query.",
							},
						],
						details: { count: 0 },
					};
				}

				const lines: string[] = [
					`Found ${result.nodes.length} nodes and ${result.edges.length} edges:`,
				];
				if (result.nodes.length > 0) {
					lines.push("", "Nodes:");
					for (const node of result.nodes) {
						lines.push(`  • ${node.label} (${node.type}) [${node.id}]`);
					}
				}
				if (result.edges.length > 0) {
					lines.push("", "Edges:");
					for (const edge of result.edges) {
						lines.push(
							`  ${edge.source} --[${edge.relation}]--> ${edge.target} (w:${edge.weight})`,
						);
					}
				}

				return {
					content: [{ type: "text", text: lines.join("\n") }],
					details: result,
				};
			} catch (err) {
				return toolError("Graph query failed", err);
			}
		},
	});
}
