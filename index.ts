/**
 * Captain's Log Extension
 * 
 * Automatically logs decisions and file changes to ./.captains-log
 * Provides a command and tool to review past entries
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const LOG_FILE = ".captains-log";

/**
 * Track session state
 */
let sessionState = {
	isActive: false,
	turnCount: 0,
	entryCount: 0,
};

/**
 * Track pending ask_user interactions for decision logging
 */
let pendingAskUser: {
	question?: string;
	options?: string[];
	timestamp: number;
} | null = null;

/**
 * Patterns to skip logging (trivial exchanges)
 */
const SKIP_PATTERNS = [
	/^thanks(\s|$)/i,
	/^thank you/i,
	/^(looks good|looks great|perfect|great work|awesome|nice)$/i,
	/^sure(\s|$)/i,
	/^yes(\s|$)/i,
	/^no(\s|$)/i,
	/^ok(\s|$)/i,
	/^okay(\s|$)/i,
	/^please(\s|$)/i,
];

/**
 * Check if a prompt should be skipped (trivial response)
 */
function shouldSkipLogging(prompt: string): boolean {
	const trimmed = prompt.trim();
	return SKIP_PATTERNS.some(pattern => pattern.test(trimmed));
}

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
 * Format timestamp as HH:MM
 */
function formatTime(date: Date): string {
	return date.toTimeString().split(":").slice(0, 2).join(":");
}

/**
 * Append a new entry to the log file
 */
function appendLogEntry(logPath: string, prefix: string, summary: string): void {
	const now = new Date();
	const date = now.toISOString().split("T")[0]; // YYYY-MM-DD
	const time = formatTime(now); // HH:MM
	const branch = getGitBranch();
	const branchSuffix = branch ? ` [${branch}]` : "";
	const entryNumber = sessionState.entryCount++;
	const entry = `${date} ${time}${branchSuffix} #${String(entryNumber).padStart(3, '0')} ${prefix}: ${summary}`;
	
	try {
		fs.appendFileSync(logPath, entry + "\n", "utf-8");
	} catch (error) {
		console.error("Failed to write captain's log:", error);
	}
}

/**
 * Log session start marker
 */
function logSessionStart(logPath: string): void {
	sessionState.isActive = true;
	sessionState.turnCount = 0;
	
	const date = new Date().toISOString().split("T")[0];
	const time = formatTime(new Date());
	const branch = getGitBranch();
	const branchSuffix = branch ? ` [${branch}]` : "";
	const entry = `${date} ${time}${branchSuffix} ─── Session started ───`;
	
	try {
		fs.appendFileSync(logPath, entry + "\n", "utf-8");
	} catch (error) {
		console.error("Failed to write captain's log:", error);
	}
}

/**
 * Log session end marker (called when session ends)
 */
function logSessionEnd(logPath: string): void {
	if (!sessionState.isActive) return;
	
	sessionState.isActive = false;
	
	const date = new Date().toISOString().split("T")[0];
	const time = formatTime(new Date());
	const branch = getGitBranch();
	const branchSuffix = branch ? ` [${branch}]` : "";
	const turnCount = sessionState.turnCount;
	const entry = `${date} ${time}${branchSuffix} ─── Session ended (${turnCount} turn${turnCount !== 1 ? 's' : ''}) ───`;
	
	try {
		fs.appendFileSync(logPath, entry + "\n", "utf-8");
	} catch (error) {
		console.error("Failed to write captain's log:", error);
	}
}

/**
 * Track session lifecycle
 */
let sessionTimeout: NodeJS.Timeout | null = null;

/**
 * Schedule session end after period of inactivity
 */
function scheduleSessionEnd(logPath: string): void {
	if (sessionTimeout) {
		clearTimeout(sessionTimeout);
	}
	
	sessionTimeout = setTimeout(() => {
		logSessionEnd(logPath);
		sessionTimeout = null;
	}, 30 * 60 * 1000); // 30 minutes of inactivity
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
		"final", "finalized", "concluded", "determined", "settled",
		"let's go with", "lets go with", "go with", "i'll take", "i will take",
		"i choose", "i pick", "prefer", "preference", "option 1", "option 2",
		"option 3", "first option", "second option", "third option"
	];
	
	const lowerPrompt = prompt.toLowerCase();
	return decisionKeywords.some(keyword => lowerPrompt.includes(keyword));
}

/**
 * Extract key action and subject from prompt
 */
function extractAction(prompt: string): string {
	const actionPatterns = [
		/(?:add|create|implement|build|make|set up|initialize|init)\s+(?:a|an|the)?\s*([\w\s\.\-]{5,50})/i,
		/(?:update|modify|change|edit|fix|improve|enhance)\s+(?:a|an|the)?\s*([\w\s\.\-]{5,50})/i,
		/(?:remove|delete|clear|eliminate)\s+(?:a|an|the)?\s*([\w\s\.\-]{5,50})/i,
		/(?:check|verify|validate|test|review|inspect|examine)\s+(?:a|an|the)?\s*([\w\s\.\-]{5,50})/i,
		/(?:refactor|optimize|clean up|restructure|reorganize)\s+(?:a|an|the)?\s*([\w\s\.\-]{5,50})/i,
		/(?:read|show|display|list|get|fetch|retrieve)\s+(?:a|an|the)?\s*([\w\s\.\-]{5,50})/i,
		/(?:write|save|store|record|log)\s+(?:a|an|the)?\s*([\w\s\.\-]{5,50})/i,
	];
	
	for (const pattern of actionPatterns) {
		const match = prompt.match(pattern);
		if (match && match[1]) {
			return match[1].trim();
		}
	}
	
	return "";
}

/**
 * Detect explicit decision statements in user input
 * Returns the decision content if found, null otherwise
 */
function extractDecision(prompt: string): string | null {
	const decisionPatterns = [
		/(?:let's|lets)\s+(?:go with|choose|pick|select|use|take)\s+(.+)/i,
		/(?:i'll|i will)\s+(?:go with|choose|pick|select|use|take)\s+(.+)/i,
		/(?:i choose|i pick|i select|i want|i prefer)\s+(.+)/i,
		/(?:go with|choose|pick|select|use|take)\s+(?:option\s*)?([12345]|one|two|three|four|five|first|second|third|fourth|fifth)/i,
		/(?:my decision is|decided on|decided to|going with)\s+(.+)/i,
		/(?:yes|do it|proceed|go ahead)[,.!?]?\s*(.+)/i,
	];
	
	for (const pattern of decisionPatterns) {
		const match = prompt.match(pattern);
		if (match && match[1]) {
			const decision = match[1].trim();
			// Skip if it's just a trivial response
			if (decision.length > 2 && !/^(it|that|this|sure|ok|yes|no)$/i.test(decision)) {
				return decision;
			}
		}
	}
	
	return null;
}

/**
 * Generate a concise one-line summary from the prompt
 */
function generateSummary(prompt: string): string {
	// Check if this is an explicit decision statement
	const decision = extractDecision(prompt);
	if (decision) {
		// Capitalize first letter and limit length
		let summary = decision.charAt(0).toUpperCase() + decision.slice(1);
		if (summary.length > 80) {
			const cutIndex = summary.lastIndexOf(" ", 77);
			summary = cutIndex > 40 ? summary.substring(0, cutIndex) + "..." : summary.substring(0, 77) + "...";
		}
		return summary;
	}
	
	// Try to extract key action with subject
	const action = extractAction(prompt);
	
	if (action && action.length >= 5) {
		// Capitalize first letter
		return action.charAt(0).toUpperCase() + action.slice(1);
	}
	
	// Fallback: create a meaningful summary from the prompt
	let summary = prompt
		.replace(/\s+/g, " ")
		.trim();
	
	// Remove common filler words at the start
	summary = summary.replace(/^(can you|could you|please|i need|i want|help me|let's|let us|would you|will you)\s+/i, "");
	
	// Remove question marks and trailing punctuation for cleaner summary
	summary = summary.replace(/[?]+$/, "").trim();
	
	// If still too short, it's likely a fragment - try to preserve more context
	if (summary.length < 10) {
		// Return original prompt with minimal cleaning
		summary = prompt.replace(/\s+/g, " ").trim();
	}
	
	// Limit to 80 characters for readability (more generous than before)
	if (summary.length > 80) {
		// Try to cut at a word boundary
		const cutIndex = summary.lastIndexOf(" ", 77);
		if (cutIndex > 40) {
			summary = summary.substring(0, cutIndex) + "...";
		} else {
			summary = summary.substring(0, 77) + "...";
		}
	}
	
	// Capitalize first letter
	if (summary.length > 0) {
		summary = summary.charAt(0).toUpperCase() + summary.slice(1);
	}
	
	// Ensure minimum meaningful length (avoid single words)
	if (summary.length < 5 && prompt.length >= 5) {
		// Use more of the original prompt
		summary = prompt.replace(/\s+/g, " ").trim();
		if (summary.length > 80) {
			summary = summary.substring(0, 77) + "...";
		}
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
	
	// Initialize session on first use
	pi.on("agent_start", async (_event, ctx) => {
		turnState = {
			filesChanged: [],
			hasDecision: false,
		};
		
		// Log session start at the beginning of the first turn
		if (!sessionState.isActive) {
			const logPath = getLogPath(ctx.cwd);
			logSessionStart(logPath);
		}
		
		sessionState.turnCount++;
	});
	
	// Track file write/edit operations
	pi.on("tool_call", async (event, _ctx) => {
		if (event.toolName === "write" && "path" in event.input) {
			turnState.filesChanged.push(event.input.path as string);
		}
		if (event.toolName === "edit" && "path" in event.input) {
			turnState.filesChanged.push(event.input.path as string);
		}
		
		// Track ask_user tool calls for decision logging
		if (event.toolName === "ask_user") {
			pendingAskUser = {
				question: event.input.question as string | undefined,
				options: (event.input.options as any[] | undefined)?.map(opt => 
					typeof opt === "string" ? opt : opt.title
				),
				timestamp: Date.now(),
			};
		}
	});
	
	// Track ask_user tool results to log decisions
	pi.on("tool_result", async (event, _ctx) => {
		if (event.toolName === "ask_user" && pendingAskUser && pendingAskUser.question) {
			const result = event.result as any;
			if (result && result.content) {
				// Extract the user's selection from the result
				const content = Array.isArray(result.content) 
					? result.content.find((c: any) => c.type === "text")?.text 
					: result.content;
				
				if (content && typeof content === "string") {
					// Parse the selection from the tool result
					const selectionMatch = content.match(/Selected?:?\s*(.+)/i);
					const selection = selectionMatch ? selectionMatch[1].trim() : content.trim();
					
					if (selection && selection !== "null") {
						const logPath = getLogPath(_ctx.cwd);
						appendLogEntry(logPath, "Decision", selection);
					}
				}
			}
			pendingAskUser = null;
		}
	});
	
	// Log user input at the start of agent processing
	pi.on("before_agent_start", async (event, _ctx) => {
		// Skip trivial exchanges
		if (shouldSkipLogging(event.prompt)) {
			return;
		}
		
		const userSummary = generateSummary(event.prompt);
		const logPath = getLogPath(_ctx.cwd);
		appendLogEntry(logPath, "User", userSummary);
		
		if (shouldLog(event.prompt, turnState.filesChanged.length > 0)) {
			turnState.hasDecision = true;
		}
	});
	
	// Log model response at the end of agent processing
	pi.on("agent_end", async (event, _ctx) => {
		// Get the LLM's response (last assistant message)
		const lastAssistantMessage = event.messages
			.filter(m => m.role === "assistant")
			.pop();
		
		if (!lastAssistantMessage) {
			return;
		}
		
		const messageText = Array.isArray(lastAssistantMessage.content)
			? lastAssistantMessage.content
				.filter((c: any) => c.type === "text")
				.map((c: any) => c.text)
				.join(" ")
			: lastAssistantMessage.content;
		
		let summary: string;
		
		if (turnState.filesChanged.length > 0) {
			// Combine file changes with action summary
			const files = turnState.filesChanged;
			
			if (files.length === 1) {
				const fileName = path.basename(files[0]);
				summary = `Modified ${fileName}`;
			} else if (files.length <= 3) {
				const fileNames = files.map(f => path.basename(f)).join(", ");
				summary = `Modified ${fileNames}`;
			} else {
				summary = `Modified ${files.length} files`;
			}
		} else {
			// Summarize model response
			summary = generateSummary(messageText);
		}
		
		const logPath = getLogPath(_ctx.cwd);
		appendLogEntry(logPath, "Model", summary);
		
		// Schedule session end after inactivity
		scheduleSessionEnd(logPath);
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
			entries = entries.slice(-(params.limit ?? 10));
			
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
		description: "Write a new entry to the captain's log to record decisions, changes, or important notes. Entry must be a single line (no newlines).",
		parameters: Type.Object({
			entry: Type.String({ 
				description: "The log entry text to append (single line only, no newlines)",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			// Validate entry is a single line
			const entry = params.entry.trim();
			if (entry.includes("\n")) {
				return {
					content: [{ type: "text", text: "Error: Log entry must be a single line. Remove newlines and try again." }],
					details: { success: false, error: "multiline_entry" },
				};
			}
			
			const logPath = getLogPath(ctx.cwd);
			appendLogEntry(logPath, "Note", entry);
			
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
				// Parse session markers
				if (entry.includes("─── Session started ───")) {
					const dateMatch = entry.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
					if (dateMatch) {
						const timestamp = th.fg("accent", dateMatch[1]);
						lines.push(`  ${timestamp} ${th.fg("info", "─── Session started ───")}`);
					}
					continue;
				}
				
				if (entry.includes("─── Session ended")) {
					const dateMatch = entry.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
					if (dateMatch) {
						const timestamp = th.fg("accent", dateMatch[1]);
						const turnMatch = entry.match(/(\d+ turn)/);
						const turnInfo = turnMatch ? th.fg("dim", turnMatch[0]) : "";
						lines.push(`  ${timestamp} ${th.fg("dim", "─── Session ended")} ${turnInfo} ${th.fg("dim", "───")}`);
					}
					continue;
				}
				
				// Parse date, time, branch, entry number, prefix and summary
				const entryMatch = entry.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(?: \[([^\]]+)\])? #(\d+) (User|Model|Note|Decision): (.+)$/);
				if (entryMatch) {
					const date = th.fg("accent", entryMatch[1]);
					const time = th.fg("dim", entryMatch[2]);
					const branch = entryMatch[3] ? th.fg("dim", `[${entryMatch[3]}]`) : "";
					const entryNum = th.fg("dim", `#${entryMatch[4]}`);
					const prefix = entryMatch[5] === "User" 
						? th.fg("info", "User") 
						: entryMatch[5] === "Model" 
							? th.fg("success", "Model") 
							: entryMatch[5] === "Decision"
								? th.fg("accent", "Decision")
								: th.fg("warning", "Note");
					const summary = th.fg("text", entryMatch[6]);
					lines.push(`  ${date} ${time} ${branch ? branch + " " : ""}${entryNum} ${prefix}: ${summary}`);
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
