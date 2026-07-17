<p align="center">
  <img src="docs/havliand_agent-thumbnail.png" alt="havliand_agent thumbnail" width="100%">
</p>

# havliand_agent

havliand_agent is a terminal-first coding agent for practical software development workflows. It can read and edit a repository, run shell commands, manage long sessions, switch models, and be extended with custom tools, skills, prompts, themes, and TypeScript extensions.

The project is a renamed and customized distribution of the original agent stack. The public product name, CLI command, package scope, config paths, environment variables, and Docker deployment use `havliand_agent`.

## What It Can Do

- Work in an interactive terminal UI or in one-shot print mode.
- Read, write, edit, search, and list files through built-in tools.
- Run local shell commands through the built-in bash tool.
- Attach files and images to prompts with `@file` references.
- Keep persistent JSONL sessions with resume, fork, clone, and tree navigation.
- Compact long conversations automatically or manually.
- Queue steering and follow-up messages while the agent is already working.
- Switch between many model providers and thinking levels.
- Track token usage, prompt cache usage, and cost.
- Export sessions to HTML or JSONL.
- Load project instructions from `AGENTS.md` or `CLAUDE.md`.
- Extend behavior with skills, prompt templates, themes, packages, and TypeScript extensions.

## Built-In Tools

The default tool set is intentionally small:

| Tool | Purpose |
|------|---------|
| `read` | Read files from the workspace |
| `write` | Create or overwrite files |
| `edit` | Apply targeted file edits |
| `bash` | Run shell commands |
| `grep` | Search file contents |
| `find` | Find files by name or path |
| `ls` | List directory contents |

Tool availability can be controlled with `--tools`, `--exclude-tools`, `--no-tools`, and `--no-builtin-tools`.

## Modes

```bash
havliand_agent                         # interactive TUI
havliand_agent -p "Summarize this repo" # one-shot print mode
havliand_agent --mode json "List files" # JSON event stream
havliand_agent --mode rpc               # stdin/stdout RPC integration
```

## Models And Providers

havliand_agent supports API-key and subscription-based providers through the shared AI layer, including OpenAI, OpenAI Codex, Anthropic, Google Gemini, Google Vertex, Amazon Bedrock, Mistral, Groq, Cerebras, DeepSeek, xAI, OpenRouter, Vercel AI Gateway, Cloudflare, GitHub Copilot, Hugging Face, Together, Fireworks, Kimi, MiniMax, Moonshot, Xiaomi MiMo, ZAI, OpenCode, and OpenAI-compatible local endpoints such as Ollama, vLLM, and LM Studio.

Common commands:

```bash
havliand_agent /login
havliand_agent --list-models
havliand_agent --provider openai --model gpt-4o
havliand_agent --model anthropic/claude-sonnet-4-20250514:high
```

## Sessions

Sessions are saved as JSONL files under `~/.havliand_agent/agent/sessions` by default.

```bash
havliand_agent --continue
havliand_agent --resume
havliand_agent --session <path|id>
havliand_agent --fork <path|id>
havliand_agent --session-dir <dir>
havliand_agent --no-session
```

Inside the TUI, `/tree`, `/fork`, `/clone`, `/compact`, `/session`, `/export`, and `/import` manage session history.

## Customization

havliand_agent can load resources globally or per project:

| Resource | Location |
|----------|----------|
| Settings | `~/.havliand_agent/agent/settings.json`, `.havliand_agent/settings.json` |
| Skills | `~/.havliand_agent/agent/skills`, `.havliand_agent/skills`, `.agents/skills` |
| Prompts | `~/.havliand_agent/agent/prompts`, `.havliand_agent/prompts` |
| Extensions | `~/.havliand_agent/agent/extensions`, `.havliand_agent/extensions` |
| Themes | `~/.havliand_agent/agent/themes`, `.havliand_agent/themes` |

Extensions are TypeScript modules that can add tools, commands, shortcuts, UI, provider integrations, permission gates, custom compaction, and workflow automation.

## Docker

The local Docker image and container are named `havliand_agent`.

```bash
docker start havliand_agent
docker attach havliand_agent
docker exec -it havliand_agent sh
docker stop havliand_agent
```

The current deployment mounts this repository at `/workspace` and stores agent state in the Docker volume mounted at `/root/.havliand_agent/agent`.

## Packages

| Package | Role |
|---------|------|
| [`@havliand_agent/coding-agent`](packages/coding-agent) | CLI, sessions, tools, extensions, and user workflows |
| [`@havliand_agent/agent-core`](packages/agent) | Agent runtime, tool execution, event streaming, state, and compaction |
| [`@havliand_agent/ai`](packages/ai) | Multi-provider LLM and image API layer |
| [`@havliand_agent/tui`](packages/tui) | Terminal UI framework |
| [`@havliand_agent/orchestrator`](packages/orchestrator) | Experimental orchestration layer |

## Development

Install dependencies without lifecycle scripts:

```bash
npm install --ignore-scripts
```

Common commands:

```bash
npm run check
./test.sh
./havliand_agent-test.sh --no-env --version
```

Do not run broad builds or test suites casually. This repository has specific rules for generated model metadata, lockfiles, release artifacts, and package shrinkwraps.

## Security

havliand_agent is not a sandbox. Built-in tools and extensions run with the permissions of the user or container process that starts the agent. For untrusted repositories or unattended automation, run the whole agent inside a container, VM, or policy-controlled sandbox and mount only the files and credentials required for the task.

## License

MIT
