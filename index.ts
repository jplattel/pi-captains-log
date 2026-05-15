/**
 * Captain's Log Extension
 * 
 * Automatically logs decisions and file changes to ./.captains-log
 * Provides a command and tool to review past entries
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const LOG_FILE = ".captains-log";

/**
 * Get the log file path for the current working directory
 */
function getLogPath(cwd: string): string {
	return path.join(cwd, LOG_FILE);
}

/**
 * Read log entries from the file
 */
function readLogEntries(logPath: string): string[] {
	try {
		if (!fs.existsSync(logPath)) {
			return [];
		}
		const content = fs.readFileSync(logPath, "utf-8");
		return content
			.split("\n")
			.map(line => line.trim())
			.filter(line => line.length > 0);
	} catch {
		return [];
	}
}

/**
 * Get the current git branch name (if in a git repo)
 */
function getGitBranch(): string | null {
	try {
		const branch = execSync("git rev-parse --abbrev-ref HEAD", {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return branch || null;
	} catch {
		return null;
	}
}

/**
 * Append a new entry to the log file
 */
function appendLogEntry(logPath: string, summary: string): void {
	const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
	const branch = getGitBranch();
	const branchSuffix = branch ? ` [${branch}]` : "";
	const entry = `${date}${branchSuffix}: ${summary}`;
	
	try {
		fs.appendFileSync(logPath, entry + "\n", "utf-8");
	} catch (error) {
		console.error("Failed to write captain's log:", error);
	}
}

/**
 * Detect if a prompt likely involves a decision or file changes
 */
function shouldLog(prompt: string, hasFileChanges: boolean): boolean {
	// Always log if there were file changes
	if (hasFileChanges) {
		return true;
	}
	
	// Check for decision-related keywords
	const decisionKeywords = [
		"decide", "decision", "choose", "choice", "selected", "opted",
		"implement", "implemented", "create", "created", "add", "added",
		"remove", "removed", "delete", "deleted", "update", "updated",
		"refactor", "refactored", "fix", "fixed", "resolve", "resolved",
		"merge", "merged", "deploy", "deployed", "release", "released",
		"approve", "approved", "reject", "rejected", "confirm", "confirmed",
		"architecture", "design", "pattern", "strategy", "approach",
		"final", "finalized", "concluded", "determined", "settled"
	];
	
	const lowerPrompt = prompt.toLowerCase();
	return decisionKeywords.some(keyword => lowerPrompt.includes(keyword));
}

/**
 * Generate a one-line summary from the prompt
 */
function generateSummary(prompt: string): string {
	// Truncate and clean the prompt
	let summary = prompt
		.replace(/\s+/g, " ")
		.trim();
	
	// Limit to 100 characters
	if (summary.length > 100) {
		summary = summary.substring(0, 97) + "...";
	}
	
	// Capitalize first letter
	if (summary.length > 0) {
		summary = summary.charAt(0).toUpperCase() + summary.slice(1);
	}
	
	return summary;
}

/**
 * Track file changes during a turn
 */
interface TurnState {
	filesChanged: string[];
	hasDecision: boolean;
}

export default function (pi: ExtensionAPI) {
	// Track state for the current turn
	let turnState: TurnState = {
		filesChanged: [],
		hasDecision: false,
	};
	
	// Reset turn state at the start of each agent turn
	pi.on("agent_start", async (_event, _ctx) => {
		turnState = {
			filesChanged: [],
			hasDecision: false,
		};
	});
	
	// Track file write/edit operations
	pi.on("tool_call", async (event, _ctx) => {
		if (event.toolName === "write" && "path" in event.input) {
			turnState.filesChanged.push(event.input.path as string);
		}
		if (event.toolName === "edit" && "path" in event.input) {
			turnState.filesChanged.push(event.input.path as string);
		}
	});
	
	// Track decision-related prompts
	pi.on("before_agent_start", async (event, ctx) => {
		if (shouldLog(event.prompt, turnState.filesChanged.length > 0)) {
			turnState.hasDecision = true;
		}
	});
	
	// Log at the end of agent processing (after every prompt)
	pi.on("agent_end", async (event, ctx) => {
		
		// Generate summary from the messages in this turn
		const lastUserMessage = event.messages
			.filter(m => m.role === "user")
			.pop();
		
		if (!lastUserMessage) {
			return;
		}
		
		const promptText = lastUserMessage.content
			.filter(c => c.type === "text")
			.map(c => c.text)
			.join(" ");
		
		let summary: string;
		
		if (turnState.filesChanged.length > 0) {
			// Summarize file changes
			const files = turnState.filesChanged;
			if (files.length === 1) {
				summary = `Modified ${path.basename(files[0])}`;
			} else if (files.length <= 3) {
				summary = `Modified ${files.map(f => path.basename(f)).join(", ")}`;
			} else {
				summary = `Modified ${files.length} files`;
			}
		} else {
			// Summarize decision
			summary = generateSummary(promptText);
		}
		
		const logPath = getLogPath(ctx.cwd);
		appendLogEntry(logPath, summary);
	});
	
	// Register the read_captains_log tool for LLM access
	pi.registerTool({
		name: "read_captains_log",
		label: "Read Captain's Log",
		description: "Read past decisions and changes from the captain's log to recall what choices have been made",
		parameters: Type.Object({
			limit: Type.Optional(Type.Number({ 
				description: "Maximum number of entries to return (default: 10)",
				default: 10,
			})),
			days: Type.Optional(Type.Number({ 
				description: "Only return entries from the last N days",
			})),
			keyword: Type.Optional(Type.String({ 
				description: "Filter entries containing this keyword",
			})),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const logPath = getLogPath(ctx.cwd);
			let entries = readLogEntries(logPath);
			
			// Apply keyword filter
			if (params.keyword) {
				entries = entries.filter(entry => 
					entry.toLowerCase().includes(params.keyword!.toLowerCase())
				);
			}
			
			// Apply days filter
			if (params.days !== undefined) {
				const cutoffDate = new Date();
				cutoffDate.setDate(cutoffDate.getDate() - params.days);
				const cutoffStr = cutoffDate.toISOString().split("T")[0];
				
				entries = entries.filter(entry => {
					const dateMatch = entry.match(/^(\d{4}-\d{2}-\d{2})/);
					if (!dateMatch) return false;
					return dateMatch[1] >= cutoffStr;
				});
			}
			
			// Apply limit
			entries = entries.slice(-params.limit);
			
			const content = entries.length > 0
				? entries.join("\n")
				: "No entries found in captain's log.";
			
			return {
				content: [{ type: "text", text: content }],
				details: { entryCount: entries.length },
			};
		},
	});

	// Register the write_captains_log tool for LLM access
	pi.registerTool({
		name: "write_captains_log",
		label: "Write Captain's Log",
		description: "Write a new entry to the captain's log to record decisions, changes, or important notes",
		parameters: Type.Object({
			entry: Type.String({ 
				description: "The log entry text to append",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const logPath = getLogPath(ctx.cwd);
			appendLogEntry(logPath, params.entry);
			
			return {
				content: [{ type: "text", text: "Entry added to captain's log." }],
				details: { success: true },
			};
		},
	});
	
	// Register the /captains-log command for user access
	pi.registerCommand("captains-log", {
		description: "View the captain's log (usage: /captains-log [--all] [--days N] [--keyword K])",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/captains-log requires interactive mode", "error");
				return;
			}
			
			// Parse arguments
			const argParts = args.trim().split(/\s+/).filter(Boolean);
			let limit = 10;
			let days: number | undefined;
			let keyword: string | undefined;
			
			for (let i = 0; i < argParts.length; i++) {
				if (argParts[i] === "--all") {
					limit = 1000;
				} else if (argParts[i] === "--days" && argParts[i + 1]) {
					days = parseInt(argParts[i + 1], 10);
					i++;
				} else if (argParts[i] === "--keyword" && argParts[i + 1]) {
					keyword = argParts[i + 1];
					i++;
				}
			}
			
			const logPath = getLogPath(ctx.cwd);
			let entries = readLogEntries(logPath);
			
			// Apply keyword filter
			if (keyword) {
				entries = entries.filter(entry => 
					entry.toLowerCase().includes(keyword.toLowerCase())
				);
			}
			
			// Apply days filter
			if (days !== undefined) {
				const cutoffDate = new Date();
				cutoffDate.setDate(cutoffDate.getDate() - days);
				const cutoffStr = cutoffDate.toISOString().split("T")[0];
				
				entries = entries.filter(entry => {
					const dateMatch = entry.match(/^(\d{4}-\d{2}-\d{2})/);
					if (!dateMatch) return false;
					return dateMatch[1] >= cutoffStr;
				});
			}
			
			// Apply limit
			entries = entries.slice(-limit);
			
			// Display in a nice UI component
			await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
				return new CaptainsLogComponent(entries, theme, done);
			});
		},
	});
}

/**
 * UI component for displaying the captain's log
 */
class CaptainsLogComponent {
	private entries: string[];
	private theme: any;
	private onClose: () => void;
	private scrollOffset = 0;

	constructor(entries: string[], theme: any, onClose: () => void) {
		this.entries = entries;
		this.theme = theme;
		this.onClose = onClose;
	}

	handleInput(data: string): void {
		if (data === "j" || data === "down" || data === "ctrl+n") {
			if (this.scrollOffset < Math.max(0, this.entries.length - 10)) {
				this.scrollOffset++;
			}
		} else if (data === "k" || data === "up" || data === "ctrl+p") {
			if (this.scrollOffset > 0) {
				this.scrollOffset--;
			}
		} else if (data === "escape" || data === "ctrl+c" || data === "q") {
			this.onClose();
		}
	}

	render(width: number): string[] {
		const lines: string[] = [];
		const th = this.theme;

		lines.push("");
		const title = th.fg("accent", " Captain's Log ");
		const headerLine =
			th.fg("borderMuted", "─".repeat(3)) + 
			title + 
			th.fg("borderMuted", "─".repeat(Math.max(0, width - 18)));
		lines.push(headerLine);
		lines.push("");

		if (this.entries.length === 0) {
			lines.push(th.fg("dim", "  No entries yet."));
			lines.push("");
		} else {
			const visibleEntries = this.entries.slice(
				this.scrollOffset,
				this.scrollOffset + 15
			);

			for (const entry of visibleEntries) {
				// Parse date and summary
				const dateMatch = entry.match(/^(\d{4}-\d{2}-\d{2}): (.+)$/);
				if (dateMatch) {
					const date = th.fg("accent", dateMatch[1]);
					const summary = th.fg("text", dateMatch[2]);
					lines.push(`  ${date} ${summary}`);
				} else {
					lines.push(th.fg("dim", `  ${entry}`));
				}
			}

			// Show scroll position
			if (this.entries.length > 15) {
				lines.push("");
				lines.push(th.fg("dim", `  ${this.scrollOffset + 1}-${Math.min(this.scrollOffset + 15, this.entries.length)} of ${this.entries.length}`));
			}
		}

		lines.push("");
		lines.push(th.fg("dim", "  j/k: scroll • q/Escape: close"));
		lines.push("");

		return lines;
	}

	invalidate(): void {
		// No caching needed
	}
}
