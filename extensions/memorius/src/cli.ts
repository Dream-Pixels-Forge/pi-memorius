/**
 * pi-memorius — CLI execution layer
 *
 * Provides retry-capable async execution of the memorius CLI.
 * Uses execFile (no shell) to avoid shell injection vectors.
 */
import { execFile } from "node:child_process";

/** Maximum retries for transient CLI failures */
const MAX_RETRIES = 2;
/** Retry delay base in ms (exponential backoff) */
const RETRY_DELAY_MS = 500;
/** Default timeout for CLI calls (30s) */
const CLI_TIMEOUT_MS = 30000;
/** Timeout for stdin-heavy operations like diary (60s) */
const STDIN_TIMEOUT_MS = 60000;
/** Max buffer for CLI stdout (10 MB) */
const MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Async sleep — returns a promise that resolves after ms.
 */
function sleepAsync(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Shared Options ───────────────────────────────────────────────────────────

interface ExecOptions {
	encoding: "utf8";
	timeout: number;
	maxBuffer: number;
	signal?: AbortSignal;
	input?: string;
}

function makeOptions(
	timeout: number,
	signal?: AbortSignal,
	input?: string,
): ExecOptions {
	return {
		encoding: "utf8",
		timeout,
		maxBuffer: MAX_BUFFER,
		signal,
		input,
	};
}

// ─── Async Execution (with AbortSignal support) ───────────────────────────────

/**
 * Execute a command asynchronously via execFile and return stdout.
 * Supports AbortSignal for cancellation.
 */
function execFileAsync(
	file: string,
	args: string[],
	options: ExecOptions,
): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const child = execFile(file, args, options, (err, stdout) => {
			if (err) {
				reject(err);
			} else {
				resolve(stdout);
			}
		});
		// Ensure the child process is cleaned up if the signal aborts
		if (options.signal) {
			if (options.signal.aborted) {
				child.kill();
				reject(new Error("Aborted"));
				return;
			}
			options.signal.addEventListener(
				"abort",
				() => {
					child.kill();
				},
				{ once: true },
			);
		}
	});
}

/**
 * Execute the memorius CLI asynchronously with retry support.
 * Accepts an optional AbortSignal for cancellation.
 */
export async function execCliAsync(
	cliPath: string,
	args: string[],
	signal?: AbortSignal,
	retries = MAX_RETRIES,
): Promise<string> {
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			return await execFileAsync(
				cliPath,
				args,
				makeOptions(CLI_TIMEOUT_MS, signal),
			);
		} catch (err: unknown) {
			if (
				attempt < retries &&
				!(err instanceof Error && err.name === "AbortError")
			) {
				const delay = RETRY_DELAY_MS * 2 ** attempt;
				console.debug(
					`[memorius] exec retry ${attempt + 1}/${retries} after ${delay}ms`,
				);
				await sleepAsync(delay);
				continue;
			}
			const msg = err instanceof Error ? err.message : String(err);
			throw new Error(`memorius CLI error (${cliPath}): ${msg}`);
		}
	}
	throw new Error("memorius CLI: unreachable");
}

/**
 * Execute the memorius CLI with stdin content asynchronously.
 * Accepts an optional AbortSignal for cancellation.
 */
export async function execCliAsyncWithStdin(
	cliPath: string,
	args: string[],
	stdinContent: string,
	signal?: AbortSignal,
	timeout = STDIN_TIMEOUT_MS,
	retries = MAX_RETRIES,
): Promise<string> {
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			return await execFileAsync(
				cliPath,
				args,
				makeOptions(timeout, signal, stdinContent),
			);
		} catch (err: unknown) {
			if (
				attempt < retries &&
				!(err instanceof Error && err.name === "AbortError")
			) {
				const delay = RETRY_DELAY_MS * 2 ** attempt;
				console.debug(
					`[memorius] execWithStdin retry ${attempt + 1}/${retries} after ${delay}ms`,
				);
				await sleepAsync(delay);
				continue;
			}
			const msg = err instanceof Error ? err.message : String(err);
			throw new Error(`memorius CLI error: ${msg}`);
		}
	}
	throw new Error("memorius CLI: unreachable");
}
