# Captain's Log Extension for Pi

[![npm version](https://badge.fury.io/js/pi-captains-log.svg)](https://www.npmjs.com/package/pi-captains-log)

Automatically logs decisions and file changes to `.captains-log` in your project root. A pi coding agent extension that helps you track what happened in each session.

## Features

### Automatic Logging
The extension automatically logs both user input and model responses:
- **User prompts** - Summarized at the start of each agent turn
- **Model responses** - Summarized at the end, including file changes
- **Manual entries** - Via the `write_captains_log` tool

### Log Format
```
2026-05-15 14:32 [main] ─── Session started ───
2026-05-15 14:32 [main] #001 User: Add single-line validation
2026-05-15 14:32 [main] #002 Model: Modified index.ts
2026-05-15 14:33 [main] #003 User: Fix build errors
2026-05-15 14:33 [main] #004 Model: Updated tsconfig.json
2026-05-15 14:34 [feature/auth] #005 Note: Decided to use JWT for authentication
2026-05-15 14:35 [main] ─── Session ended (4 turns) ───
```

**Format breakdown:**
- `YYYY-MM-DD HH:MM` - Timestamp of the entry
- `[branch]` - Git branch name (if in a git repository)
- `#NNN` - Sequential entry number for easy reference
- `User` - Summarized user input
- `Model` - Summarized model response or file changes
- `Note` - Manual log entries
- `─── Session started/ended ───` - Session boundaries with turn count

**Features:**
- User prompts are summarized by extracting key actions and removing filler words
- Trivial exchanges ("thanks", "looks good", etc.) are automatically skipped
- Entry numbers make it easy to reference specific points in the conversation

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

The LLM can explicitly write manual entries to the log.

**Parameters:**
- `entry` (required) - The log entry text to append (single line only, no newlines)

**Example:**
```
write_captains_log({ entry: "Decided to use PostgreSQL for the database layer" })
```

Manual entries are logged with the `Note` prefix.

## Installation

### From npm (Recommended)

```bash
pi install npm:pi-captains-log
```

### From Source

Clone this repository and install locally:

```bash
git clone https://github.com/YOUR_USERNAME/pi-captains-log.git
cd pi-captains-log
npm install
npm run build
pi install ./path/to/pi-captains-log
```

### Manual Installation

Copy the extension to your pi extensions directory:

```
~/.pi/agent/extensions/captains-log/index.ts
```

After installation, reload pi extensions:
```
/reload
```

## Log File

The log file (`.captains-log`) is created in the project root (current working directory) when the first entry is logged. Each project has its own log file.

The `.captains-log` file is typically added to `.gitignore` as it contains local development history.

## License

MIT
