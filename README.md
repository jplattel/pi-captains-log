# Captain's Log Extension

Automatically logs decisions and file changes to `.captains-log` in your project root.

## Features

### Automatic Logging
The extension automatically logs entries when:
- Files are modified (using `write` or `edit` tools)
- Decisions are made (detected via keywords like "decide", "implement", "create", "fix", etc.)

### Log Format
```
2026-05-15: Modified user-auth.ts
2026-05-15: Implemented JWT authentication
2026-05-15: Fixed login validation bug
```

## Usage

### Command: `/captains-log`

View the captain's log in an interactive UI.

**Options:**
- `/captains-log` - Show last 10 entries
- `/captains-log --all` - Show all entries
- `/captains-log --days 7` - Show entries from last 7 days
- `/captains-log --keyword auth` - Filter by keyword

**Navigation:**
- `j` / `↓` - Scroll down
- `k` / `↑` - Scroll up
- `q` / `Escape` - Close

### Tool: `read_captains_log`

The LLM can call this tool to recall past decisions.

**Parameters:**
- `limit` (optional, default: 10) - Maximum entries to return
- `days` (optional) - Only return entries from last N days
- `keyword` (optional) - Filter entries containing this keyword

**Example:**
```
read_captains_log({ days: 7, keyword: "authentication" })
```

### Tool: `write_captains_log`

The LLM can explicitly write entries to the log.

**Parameters:**
- `entry` (required) - The log entry text to append

**Example:**
```
write_captains_log({ entry: "Decided to use PostgreSQL for the database layer" })
```

## Installation

The extension is located at:
```
~/.pi/agent/extensions/captains-log/index.ts
```

It will be auto-loaded by pi on startup. To reload after changes:
```
/reload
```

## Log File

The log file (`.captains-log`) is created in the project root (current working directory) when the first entry is logged. Each project has its own log file.
