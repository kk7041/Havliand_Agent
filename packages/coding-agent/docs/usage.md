# Using havliand_agent

This page collects day-to-day usage details that do not fit on the quickstart page.

## Interactive Mode

<p align="center"><img src="images/interactive-mode.png" alt="Interactive Mode" width="600"></p>

The interface has four main areas:

- **Startup header** - shortcuts, loaded context files, prompt templates, skills, and extensions
- **Messages** - user messages, assistant responses, tool calls, tool results, notifications, errors, and extension UI
- **Editor** - where you type; border color indicates the current thinking level
- **Footer** - working directory, session name, token/cache usage, cost, context usage, and current model

The editor can be replaced temporarily by built-in UI such as `/settings` or by custom extension UI.

### Editor Features

| Feature | How |
|---------|-----|
| File reference | Type `@` to fuzzy-search project files |
| Path completion | Press Tab to complete paths |
| Multi-line input | Shift+Enter, or Ctrl+Enter on Windows Terminal |
| Copy response | Ctrl+X copies the last assistant message; in `/tree`, it copies the selected message |
| Images | Paste with Ctrl+V, Alt+V on Windows, or drag into the terminal |
| Shell command | `!command` runs and sends output to the model |
| Hidden shell command | `!!command` runs without sending output to the model |
| External editor | Ctrl+G opens `externalEditor`, `$VISUAL`, `$EDITOR`, Notepad on Windows, or `nano` elsewhere |

See [Keybindings](keybindings.md) for all shortcuts and customization.

## Slash Commands

Type `/` in the editor to open command completion. Extensions can register custom commands, skills are available as `/skill:name`, and prompt templates expand via `/templatename`.

| Command | Description |
|---------|-------------|
| `/login`, `/logout` | Manage OAuth or API-key credentials |
| `/model` | Switch models |
| `/scoped-models` | Enable/disable models for Ctrl+P cycling |
| `/settings` | Thinking level, theme, message delivery, transport |
| `/resume` | Pick from previous sessions |
| `/new` | Start a new session |
| `/name <name>` | Set session display name |
| `/session` | Show session file, ID, messages, tokens, and cost |
| `/tree` | Jump to any point in the session and continue from there |
| `/trust` | Save project trust decision for future sessions |
| `/fork` | Create a new session from a previous user message |
| `/clone` | Duplicate the current active branch into a new session |
| `/compact [prompt]` | Manually compact context, optionally with custom instructions |
| `/copy` | Copy last assistant message to clipboard |
| `/export [file]` | Export session to HTML or JSONL |
| `/import <file>` | Import and resume a session from a JSONL file |
| `/share` | Upload as private GitHub gist with shareable HTML link |
| `/reload` | Reload keybindings, extensions, skills, prompts, themes, and context files |
| `/hotkeys` | Show all keyboard shortcuts |
| `/changelog` | Display version history |
| `/quit` | Quit havliand_agent |

## Message Queue

You can submit messages while the agent is still working:

- **Enter** queues a steering message, delivered after the current assistant turn finishes executing its tool calls.
- **Alt+Enter** queues a follow-up message, delivered after the agent finishes all work.
- **Escape** aborts and restores queued messages to the editor.
- **Alt+Up** retrieves queued messages back to the editor.

On Windows Terminal, Alt+Enter is fullscreen by default. Remap it as described in [Terminal setup](terminal-setup.md) if you want havliand_agent to receive the shortcut.

Configure delivery in [Settings](settings.md) with `steeringMode` and `followUpMode`.

## Sessions

Sessions are saved automatically to `~/.havliand_agent/agent/sessions/`, organized by working directory.

```bash
havliand_agent -c                  # Continue most recent session
havliand_agent -r                  # Browse and select a session
havliand_agent --no-session        # Ephemeral mode; do not save
havliand_agent --name "my task"    # Set session display name at startup
havliand_agent --session <path|id> # Use a specific session file or session ID
havliand_agent --fork <path|id>    # Fork a session into a new session file
```

Useful session commands:

- `/session` shows the current session file and ID.
- `/tree` navigates the in-file session tree and can summarize abandoned branches.
- `/fork` creates a new session from an earlier user message.
- `/clone` duplicates the current active branch into a new session file.
- `/compact` summarizes older messages to free context.

See [Sessions](sessions.md) and [Compaction](compaction.md) for details.

## Context Files

havliand_agent loads `AGENTS.md` or `CLAUDE.md` at startup from:

- `~/.havliand_agent/agent/AGENTS.md` for global instructions
- parent directories, walking up from the current working directory
- the current directory

Use context files for project conventions, commands, safety rules, and preferences. Disable loading with `--no-context-files` or `-nc`.

### System Prompt Files

Replace the default system prompt with:

- `.havliand_agent/SYSTEM.md` for a project
- `~/.havliand_agent/agent/SYSTEM.md` globally

Append to the default prompt without replacing it with `APPEND_SYSTEM.md` in either location.

### Project Trust

On interactive startup, havliand_agent asks before trusting a project folder that contains project-local settings, resources, or project `.agents/skills` and has no saved decision for the folder or a parent folder in `~/.havliand_agent/agent/trust.json`. Trusting a project allows havliand_agent to load `.havliand_agent/settings.json` and `.havliand_agent` resources, install missing project packages, and execute project extensions.

Before the trust decision, havliand_agent loads only context files, user/global extensions, and CLI `-e` extensions so they can handle the `project_trust` event. Project-local extensions, project package-managed extensions, and project settings are loaded only after the project is trusted. This split also applies when switching to a session from a different cwd whose trust has not been resolved in the current process.

Non-interactive modes (`-p`, `--mode json`, and `--mode rpc`) do not show a trust prompt. Without an applicable saved trust decision, they use `defaultProjectTrust` from global settings: `ask` (default) and `never` ignore those project resources, while `always` trusts them. Pass `--approve`/`-a` or `--no-approve`/`-na` to override project trust for one run.

If no extension or saved decision applies, `defaultProjectTrust` controls the fallback behavior. Set it to `"ask"`, `"always"`, or `"never"` in `~/.havliand_agent/agent/settings.json`, or change it with `/settings`.

`havliand_agent config` and package commands use the same project trust flow, except `havliand_agent update` never prompts. Pass `--approve` to trust project-local settings for one command or `--no-approve` to ignore them.

Use `/trust` in interactive mode to save a project trust decision for future sessions, including trust for the immediate parent folder. It writes `~/.havliand_agent/agent/trust.json` only; the current session is not reloaded, so restart havliand_agent for changes to take effect.


## Exporting and Sharing Sessions

Use `/export [file]` to write a session to HTML.

Use `/share` to upload a private GitHub gist with a shareable HTML link.


## CLI Reference

```bash
havliand_agent [options] [@files...] [messages...]
```

### Package Commands

```bash
havliand_agent install <source> [-l]     # Install package, -l for project-local
havliand_agent remove <source> [-l]      # Remove package
havliand_agent uninstall <source> [-l]   # Alias for remove
havliand_agent update [source|self|havliand_agent]   # Update havliand_agent only, or one package source
havliand_agent update --all              # Update havliand_agent and packages; reconcile pinned git refs
havliand_agent update --extensions       # Update packages only; reconcile pinned git refs
havliand_agent update --self             # Update havliand_agent only
havliand_agent update --extension <src>  # Update one package
havliand_agent list                      # List installed packages
havliand_agent config                    # Enable/disable package resources
```

These commands manage HavliandAgent packages and `havliand_agent update` can update the havliand_agent CLI installation. To uninstall havliand_agent itself, see [Quickstart](quickstart.md#uninstall). `havliand_agent config` and project package commands accept `--approve`/`--no-approve` to trust or ignore project-local settings for one command. `havliand_agent update` never prompts for project trust.

See [havliand_agent Packages](packages.md) for package sources and security notes.

### Modes

| Flag | Description |
|------|-------------|
| default | Interactive mode |
| `-p`, `--print` | Print response and exit |
| `--mode json` | Output all events as JSON lines; see [JSON mode](json.md) |
| `--mode rpc` | RPC mode over stdin/stdout; see [RPC mode](rpc.md) |
| `--export <in> [out]` | Export a session to HTML |

In print mode, havliand_agent also reads piped stdin and merges it into the initial prompt:

```bash
cat README.md | havliand_agent -p "Summarize this text"
```

### Model Options

| Option | Description |
|--------|-------------|
| `--provider <name>` | Provider, such as `anthropic`, `openai`, or `google` |
| `--model <pattern>` | Model pattern or ID; supports `provider/id` and optional `:<thinking>` |
| `--api-key <key>` | API key, overriding environment variables |
| `--thinking <level>` | `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` |
| `--models <patterns>` | Comma-separated patterns for Ctrl+P cycling |
| `--list-models [search]` | List available models |

### Session Options

| Option | Description |
|--------|-------------|
| `-c`, `--continue` | Continue the most recent session |
| `-r`, `--resume` | Browse and select a session |
| `--session <path\|id>` | Use a specific session file or partial UUID |
| `--fork <path\|id>` | Fork a session file or partial UUID into a new session |
| `--session-dir <dir>` | Custom session storage directory |
| `--no-session` | Ephemeral mode; do not save |
| `--name <name>`, `-n <name>` | Set session display name at startup |

### Tool Options

| Option | Description |
|--------|-------------|
| `--tools <list>`, `-t <list>` | Allowlist specific built-in, extension, and custom tools |
| `--exclude-tools <list>`, `-xt <list>` | Disable specific built-in, extension, and custom tools |
| `--no-builtin-tools`, `-nbt` | Disable built-in tools but keep extension/custom tools enabled |
| `--no-tools`, `-nt` | Disable all tools |

Built-in tools: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`.

### Resource Options

| Option | Description |
|--------|-------------|
| `-e`, `--extension <source>` | Load an extension from path, npm, or git; repeatable |
| `--no-extensions` | Disable extension discovery |
| `--skill <path>` | Load a skill; repeatable |
| `--no-skills` | Disable skill discovery |
| `--prompt-template <path>` | Load a prompt template; repeatable |
| `--no-prompt-templates` | Disable prompt template discovery |
| `--theme <path>` | Load a theme; repeatable |
| `--no-themes` | Disable theme discovery |
| `--no-context-files`, `-nc` | Disable `AGENTS.md` and `CLAUDE.md` discovery |

Combine `--no-*` with explicit flags to load exactly what you need, ignoring settings. Example:

```bash
havliand_agent --no-extensions -e ./my-extension.ts
```

### Other Options

| Option | Description |
|--------|-------------|
| `--system-prompt <text>` | Replace default prompt; context files and skills are still appended |
| `--append-system-prompt <text>` | Append to system prompt |
| `--verbose` | Force verbose startup |
| `-a`, `--approve` | Trust project-local files for this run |
| `-na`, `--no-approve` | Ignore project-local files for this run |
| `-h`, `--help` | Show help |
| `-v`, `--version` | Show version |

### File Arguments

Prefix files with `@` to include them in the message:

```bash
havliand_agent @prompt.md "Answer this"
havliand_agent -p @screenshot.png "What's in this image?"
havliand_agent @code.ts @test.ts "Review these files"
```

### Examples

```bash
# Interactive with initial prompt
havliand_agent "List all .ts files in src/"

# Non-interactive
havliand_agent -p "Summarize this codebase"

# Non-interactive with piped stdin
cat README.md | havliand_agent -p "Summarize this text"

# Named one-shot session
havliand_agent --name "release audit" -p "Audit this repository"

# Different model
havliand_agent --provider openai --model gpt-4o "Help me refactor"

# Model with provider prefix
havliand_agent --model openai/gpt-4o "Help me refactor"

# Model with thinking level shorthand
havliand_agent --model sonnet:high "Solve this complex problem"

# Limit model cycling
havliand_agent --models "claude-*,gpt-4o"

# Read-only mode
havliand_agent --tools read,grep,find,ls -p "Review the code"

# Disable one extension or built-in tool while keeping the rest available
havliand_agent --exclude-tools ask_question
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `HAVLIAND_AGENT_CODING_AGENT_DIR` | Override config directory; default is `~/.havliand_agent/agent` |
| `HAVLIAND_AGENT_CODING_AGENT_SESSION_DIR` | Override session storage directory; overridden by `--session-dir` |
| `HAVLIAND_AGENT_PACKAGE_DIR` | Override package directory, useful for Nix/Guix store paths |
| `HAVLIAND_AGENT_OFFLINE` | Disable startup network operations, including update checks, package update checks, and install/update telemetry |
| `HAVLIAND_AGENT_SKIP_VERSION_CHECK` | Skip the havliand_agent version update check at startup. This prevents the `havliand_agent.dev` latest-version request |
| `HAVLIAND_AGENT_TELEMETRY` | Override install/update telemetry and provider attribution headers: `1`/`true`/`yes` or `0`/`false`/`no`. This does not disable update checks |
| `HAVLIAND_AGENT_CACHE_RETENTION` | Set to `long` for extended prompt cache where supported |
| `VISUAL`, `EDITOR` | Fallback external editor for Ctrl+G when `externalEditor` is unset; defaults to Notepad on Windows and `nano` elsewhere |

## Design Principles

havliand_agent keeps the core small and pushes workflow-specific behavior into extensions, skills, prompt templates, and packages.

It intentionally does not include built-in MCP, sub-agents, permission popups, plan mode, to-dos, or background bash. You can build or install those workflows as extensions or packages, or use external tools such as containers and tmux.

The goal is a small core with extension points for workflows that vary by team.
