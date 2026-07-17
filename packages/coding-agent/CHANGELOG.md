# Changelog

## [Unreleased]

### Breaking Changes

- Replaced the SDK's `CreateAgentSessionOptions.authStorage` and `modelRegistry` options with the async `modelRuntime` option. `AuthStorage` and its storage backends are no longer exported; use `ModelRuntime` (or a custom havliand_agent-ai `CredentialStore`), or `readStoredCredential()` for one-off reads of auth.json.
- Removed redundant `ModelRuntime.getAll()`, `find()`, `getSnapshot()`, and `getAuthOptions()` projections. Use the havliand_agent-ai `Models` methods `getModels()`, `getModel()`, `getProviders()`, and `checkAuth()` directly.
- Replaced SDK request-auth assembly through `ModelRegistry.getApiKeyAndHeaders()` with `ModelRuntime.getAuth()`. Passing a provider ID returns provider-scoped auth; passing a model also resolves built-in, `models.json`, and extension model headers.
- Changed extension-facing `ModelRegistry.refresh()` from synchronous `void` to `Promise<void>` because `models.json` loading is asynchronous. Extensions must await it before making synchronous registry reads.
- Moved canonical dynamic catalog refresh to async `ModelRuntime.refresh()`/havliand_agent-ai `Models.refresh()`. Legacy extension OAuth `modifyModels` remains supported as a synchronous compatibility projection after credential initialization.

### Added

- Added `ModelRuntime` as the canonical async SDK and internal model/auth facade while preserving the synchronous extension-facing `ModelRegistry` API. `ModelRuntime.create()` accepts any havliand_agent-ai `CredentialStore` through its `credentials` option.
- Added provider-owned `/login` discovery directly from registered havliand_agent-ai providers, including ambient auth status and informational links.
- Added file-backed dynamic catalogs in `models-store.json`, per-provider havliand_agent.dev catalog overlays, and Radius gateway support including offline migration from legacy credential-cached catalogs.
- Added extension provider `refreshModels(context)` support for dynamic model discovery with optional provider-controlled persistence.
- Added IM webhook VPS deployment guidance for systemd, nginx reverse proxying, HTTPS/TLS, and journald-based operations ([#1](https://github.com/kk7041/havliand_agent/issues/1), [#2](https://github.com/kk7041/havliand_agent/issues/2), [#3](https://github.com/kk7041/havliand_agent/issues/3), [#4](https://github.com/kk7041/havliand_agent/issues/4)).

### Changed

- Changed `ModelRuntime` to compose built-in providers, immutable `models.json` configuration, and extension overlays through ad-hoc havliand_agent-ai provider methods.
- Changed `ModelRuntime` to own final request assembly: `getAuth(model)` includes configured model headers, stream methods resolve auth once, and `before_provider_headers` runs as the Models-only header transform before provider dispatch.
- Changed `/model` to render the current model snapshot immediately, refresh configured providers in the background, and update the open selector with partial results or timeout errors.

### Fixed

- Fixed configured-provider catalog refresh to parse havliand_agent.dev's model-ID keyed responses, throttle checks to once per four hours, send the versioned havliand_agent user agent, treat unimplemented routes as unavailable overlays, and show concise refresh status in `/model`.
- Fixed adjacent assistant thinking blocks to render as one thinking section.
