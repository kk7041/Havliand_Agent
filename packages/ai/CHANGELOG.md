# Changelog

## [Unreleased]

### Breaking Changes

- Changed runtime authentication to provider-scoped `Models.checkAuth()`, `getAuth()`, `login()`, and `logout()` APIs. `checkAuth()` now returns `AuthCheck | undefined`, and API-key auth resolvers no longer receive a model.
- Removed the legacy built-in OAuth provider objects, global OAuth registry APIs, and public low-level built-in login/refresh functions. Use canonical `Provider.auth.oauth` methods instead; the `oauth` subpath now retains only extension compatibility types.
- Renamed the canonical login interaction interface from `AuthLoginCallbacks` to `AuthInteraction`; it exposes the provider-neutral `prompt()`/`notify()` protocol used by API-key and OAuth flows.
- Changed the `Models` request contract: `getAuth(model)` now includes model headers, while `getAuth(providerId)` remains provider-scoped, and Models stream options may include `transformHeaders`. Custom `Models` implementations must execute the transform after merging auth/model and explicit headers, then remove it before provider dispatch.
- Changed dynamic model refresh to `Models.refresh(options)`, which refreshes every configured dynamic provider and returns per-provider errors/cancellation state. `Provider.refreshModels(context)` now receives the effective credential, scoped model storage, network policy, and abort signal.

### Added

- Added provider-owned authentication and availability resolution to `Models`, including stored OAuth refresh and interactive login support through `CredentialStore`.
- Added async non-secret credential enumeration through `CredentialStore.list()` and credential-aware `Provider.filterModels()` availability policy.
- Added neutral auth-flow information/link events and provider-owned Amazon Bedrock and Google Vertex AI credential selection flows.
- Added `ModelsStore` with an in-memory default for restoring and persisting dynamic provider catalogs.
- Added the dynamic Radius `havliand_agent-messages` gateway provider with OAuth and credential-specific catalog refresh.

### Changed

- Changed `Models.getAuth(model)` to include model headers and added a Models-only `transformHeaders` stream option that runs after auth and explicit header assembly but is not forwarded to providers.

### Fixed

- Fixed Cloudflare Workers AI and AI Gateway streams to materialize account and gateway endpoint placeholders after auth resolution, including compat streaming with custom model objects.
- Fixed lazy provider streams to preserve their final assistant message when forwarding an inner stream.
