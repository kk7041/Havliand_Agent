> havliand_agent can help you create HavliandAgent packages. Ask it to bundle your extensions, skills, prompt templates, or themes.

# havliand_agent Packages

havliand_agent packages bundle extensions, skills, prompt templates, and themes so you can share them through npm or git. A package can declare resources in `package.json` under the `havliand_agent` key, or use conventional directories.

## Table of Contents

- [Install and Manage](#install-and-manage)
- [Package Sources](#package-sources)
- [Creating a havliand_agent Package](#creating-a-havliand_agent-package)
- [Package Structure](#package-structure)
- [Dependencies](#dependencies)
- [Package Filtering](#package-filtering)
- [Enable and Disable Resources](#enable-and-disable-resources)
- [Scope and Deduplication](#scope-and-deduplication)

## Install and Manage

> **Security:** havliand_agent packages run with full system access. Extensions execute arbitrary code, and skills can instruct the model to perform any action including running executables. Review source code before installing third-party packages.

```bash
havliand_agent install npm:@foo/bar@1.0.0
havliand_agent install git:github.com/user/repo@v1
havliand_agent install https://github.com/user/repo  # raw URLs work too
havliand_agent install /absolute/path/to/package
havliand_agent install ./relative/path/to/package

havliand_agent remove npm:@foo/bar
havliand_agent list                     # show installed packages from settings
havliand_agent update                   # update havliand_agent only
havliand_agent update --all             # update havliand_agent, update packages, and reconcile pinned git refs
havliand_agent update --extensions      # update packages and reconcile pinned git refs only
havliand_agent update --self            # update havliand_agent only
havliand_agent update --self --force    # reinstall havliand_agent even if current
havliand_agent update npm:@foo/bar      # update one package
havliand_agent update --extension npm:@foo/bar
```

These commands manage HavliandAgent packages and `havliand_agent update` can update the havliand_agent CLI installation. To uninstall havliand_agent itself, see [Quickstart](quickstart.md#uninstall).

By default, `install` and `remove` write to user settings (`~/.havliand_agent/agent/settings.json`). Use `-l` to write to project settings (`.havliand_agent/settings.json`) instead. Project settings can be shared with your team, and havliand_agent installs any missing packages automatically on startup after the project is trusted.

To try a package without installing it, use `--extension` or `-e`. This installs to a temporary directory for the current run only:

```bash
havliand_agent -e npm:@foo/bar
havliand_agent -e git:github.com/user/repo
```

## Package Sources

havliand_agent accepts three source types in settings and `havliand_agent install`.

### npm

```
npm:@scope/pkg@1.2.3
npm:pkg
```

- Versioned specs are pinned and skipped by package updates (`havliand_agent update --extensions`, `havliand_agent update --all`).
- User installs go under `~/.havliand_agent/agent/npm/`.
- Project installs go under `.havliand_agent/npm/`.
- Set `npmCommand` in `settings.json` to pin npm package lookup and install operations to a specific wrapper command such as `mise` or `asdf`.

Example:

```json
{
  "npmCommand": ["mise", "exec", "node@20", "--", "npm"]
}
```

### git

```
git:github.com/user/repo@v1
git:git@github.com:user/repo@v1
https://github.com/user/repo@v1
ssh://git@github.com/user/repo@v1
```

- Without `git:` prefix, only protocol URLs are accepted (`https://`, `http://`, `ssh://`, `git://`).
- With `git:` prefix, shorthand formats are accepted, including `github.com/user/repo` and `git@github.com:user/repo`.
- HTTPS and SSH URLs are both supported.
- SSH URLs use your configured SSH keys automatically (respects `~/.ssh/config`).
- For non-interactive runs (for example CI), you can set `GIT_TERMINAL_PROMPT=0` to disable credential prompts and set `GIT_SSH_COMMAND` (for example `ssh -o BatchMode=yes -o ConnectTimeout=5`) to fail fast.
- Refs are pinned tags or commits. `havliand_agent update --extensions` and `havliand_agent update --all` do not move them to newer refs, but they do reconcile an existing clone to the configured ref.
- Use `havliand_agent install git:host/user/repo@new-ref` to update settings and move an existing package to a new pinned ref.
- Cloned to `~/.havliand_agent/agent/git/<host>/<path>` (global) or `.havliand_agent/git/<host>/<path>` (project).
- When reconciliation changes the checkout, havliand_agent resets and cleans the clone, then runs `npm install` if `package.json` exists.

**SSH examples:**
```bash
# git@host:path shorthand (requires git: prefix)
havliand_agent install git:git@github.com:user/repo

# ssh:// protocol format
havliand_agent install ssh://git@github.com/user/repo

# With version ref
havliand_agent install git:git@github.com:user/repo@v1.0.0
```

### Local Paths

```
/absolute/path/to/package
./relative/path/to/package
```

Local paths point to files or directories on disk and are added to settings without copying. Relative paths are resolved against the settings file they appear in. If the path is a file, it loads as a single extension. If it is a directory, havliand_agent loads resources using package rules.

## Creating a havliand_agent Package

Add a `havliand_agent` manifest to `package.json` or use conventional directories. Include the `havliand_agent-package` keyword for discoverability.

```json
{
  "name": "my-package",
  "keywords": ["havliand_agent-package"],
  "havliand_agent": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

Paths are relative to the package root. Arrays support glob patterns and `!exclusions`.

### Gallery Metadata

The [package gallery](https://havliand_agent.dev/packages) displays packages tagged with `havliand_agent-package`. Add `video` or `image` fields to show a preview:

```json
{
  "name": "my-package",
  "keywords": ["havliand_agent-package"],
  "havliand_agent": {
    "extensions": ["./extensions"],
    "video": "https://example.com/demo.mp4",
    "image": "https://example.com/screenshot.png"
  }
}
```

- **video**: MP4 only. On desktop, autoplays on hover. Clicking opens a fullscreen player.
- **image**: PNG, JPEG, GIF, or WebP. Displayed as a static preview.

If both are set, video takes precedence.

## Package Structure

### Convention Directories

If no `havliand_agent` manifest is present, havliand_agent auto-discovers resources from these directories:

- `extensions/` loads `.ts` and `.js` files
- `skills/` recursively finds `SKILL.md` folders and loads top-level `.md` files as skills
- `prompts/` loads `.md` files
- `themes/` loads `.json` files

## Dependencies

Third party runtime dependencies belong in `dependencies` in `package.json`. Dependencies that do not register extensions, skills, prompt templates, or themes also belong in `dependencies`. When havliand_agent installs a package from npm or git, it runs `npm install`, so those dependencies are installed automatically.

havliand_agent bundles core packages for extensions and skills. If you import any of these, list them in `peerDependencies` with a `"*"` range and do not bundle them: `@havliand_agent/ai`, `@havliand_agent/agent-core`, `@havliand_agent/coding-agent`, `@havliand_agent/tui`, `typebox`.

Other HavliandAgent packages must be bundled in your tarball. Add them to `dependencies` and `bundledDependencies`, then reference their resources through `node_modules/` paths. havliand_agent loads packages with separate module roots, so separate installs do not collide or share modules.

Example:

```json
{
  "dependencies": {
    "shitty-extensions": "^1.0.1"
  },
  "bundledDependencies": ["shitty-extensions"],
  "havliand_agent": {
    "extensions": ["extensions", "node_modules/shitty-extensions/extensions"],
    "skills": ["skills", "node_modules/shitty-extensions/skills"]
  }
}
```

## Package Filtering

Filter what a package loads using the object form in settings:

```json
{
  "packages": [
    "npm:simple-pkg",
    {
      "source": "npm:my-package",
      "extensions": ["extensions/*.ts", "!extensions/legacy.ts"],
      "skills": [],
      "prompts": ["prompts/review.md"],
      "themes": ["+themes/legacy.json"]
    }
  ]
}
```

`+path` and `-path` are exact paths relative to the package root.

- Omit a key to load all of that type.
- Use `[]` to load none of that type.
- `!pattern` excludes matches.
- `+path` force-includes an exact path.
- `-path` force-excludes an exact path.
- Filters layer on top of the manifest. They narrow down what is already allowed.

## Enable and Disable Resources

Use `havliand_agent config` to enable or disable extensions, skills, prompt templates, and themes from installed packages and local directories. `havliand_agent config` starts in global settings (`~/.havliand_agent/agent/settings.json`); press Tab to switch between global and project-local modes. Use `havliand_agent config -l` to start in project overrides (`.havliand_agent/settings.json`) with inherited global resources dimmed.

## Scope and Deduplication

Packages can appear in both global and project settings. If the same package appears in both, the project entry wins unless the project entry has `autoload: false`, in which case it is applied as a delta over the global entry. Identity is determined by:

- npm: package name
- git: repository URL without ref
- local: resolved absolute path
