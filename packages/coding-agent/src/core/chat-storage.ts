import type { AgentMessage } from "@havliand_agent/agent-core";
import type { Message, TextContent } from "@havliand_agent/ai";
import postgres, { type Sql } from "postgres";
import type { SessionEntry, SessionHeader, SessionMessageEntry } from "./session-manager.ts";

export const HAVLIAND_PG_URL_ENV_FLAG = "HAVLIAND_PG_URL";
const DEFAULT_PG_URL = "postgres://localhost:5432/havliand";

export interface ChatSearchHit {
	sessionId: string;
	entryId: string;
	cwd: string;
	role: string;
	timestamp: string;
	text: string;
	rank: number;
}

interface SearchOptions {
	query: string;
	cwd?: string;
	sessionId?: string;
	since?: string;
	until?: string;
	role?: string;
	limit?: number;
}

let sqlClient: Sql | undefined;
let initialized = false;

function getPgUrl(env: NodeJS.ProcessEnv = process.env): string {
	return env[HAVLIAND_PG_URL_ENV_FLAG]?.trim() || DEFAULT_PG_URL;
}

function getSql(): Sql {
	sqlClient ??= postgres(getPgUrl(), {
		max: 1,
		idle_timeout: 5,
		connect_timeout: 2,
	});
	return sqlClient;
}

async function ensureSchema(sql: Sql): Promise<void> {
	if (initialized) return;
	await sql`
		CREATE EXTENSION IF NOT EXISTS pg_trgm
	`;
	await sql`
		CREATE TABLE IF NOT EXISTS sessions (
			id text PRIMARY KEY,
			cwd text NOT NULL,
			session_file text,
			created_at timestamptz NOT NULL,
			updated_at timestamptz NOT NULL DEFAULT now()
		)
	`;
	await sql`
		CREATE TABLE IF NOT EXISTS messages (
			session_id text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
			entry_id text PRIMARY KEY,
			parent_id text,
			seq bigint GENERATED ALWAYS AS IDENTITY,
			role text NOT NULL,
			content jsonb NOT NULL,
			text text NOT NULL,
			timestamp timestamptz NOT NULL
		)
	`;
	await sql`
		CREATE INDEX IF NOT EXISTS messages_session_seq_idx ON messages(session_id, seq)
	`;
	await sql`
		CREATE INDEX IF NOT EXISTS messages_text_fts_idx ON messages USING GIN (to_tsvector('simple', text))
	`;
	await sql`
		CREATE INDEX IF NOT EXISTS messages_text_trgm_idx ON messages USING GIN (text gin_trgm_ops)
	`;
	initialized = true;
}

function isTextMessage(message: AgentMessage): message is Message {
	return (
		(message.role === "user" ||
			message.role === "assistant" ||
			message.role === "toolResult" ||
			message.role === "custom") &&
		"content" in message
	);
}

export function extractMessageText(message: AgentMessage): string {
	if (!isTextMessage(message)) return "";
	const content = message.content;
	if (typeof content === "string") return content;
	return content
		.filter((part): part is TextContent => part.type === "text")
		.map((part) => part.text)
		.join("\n")
		.trim();
}

export async function mirrorSessionEntryToPostgres(options: {
	header: SessionHeader | null;
	sessionFile?: string;
	entry: SessionEntry;
}): Promise<void> {
	if (options.entry.type !== "message") return;
	const header = options.header;
	if (!header) return;
	const message = options.entry.message;
	if (!isTextMessage(message)) return;
	const text = extractMessageText(message);
	if (!text) return;
	const contentJson = JSON.stringify(message.content);

	const sql = getSql();
	await ensureSchema(sql);
	await sql`
		INSERT INTO sessions (id, cwd, session_file, created_at, updated_at)
		VALUES (${header.id}, ${header.cwd}, ${options.sessionFile ?? null}, ${header.timestamp}, now())
		ON CONFLICT (id) DO UPDATE SET
			cwd = EXCLUDED.cwd,
			session_file = COALESCE(EXCLUDED.session_file, sessions.session_file),
			updated_at = now()
	`;
	await sql`
		INSERT INTO messages (session_id, entry_id, parent_id, role, content, text, timestamp)
		VALUES (
			${header.id},
			${options.entry.id},
			${options.entry.parentId},
			${message.role},
			${contentJson}::jsonb,
			${text},
			${options.entry.timestamp}
		)
		ON CONFLICT (entry_id) DO NOTHING
	`;
}

export function mirrorSessionEntryToPostgresBestEffort(options: {
	header: SessionHeader | null;
	sessionFile?: string;
	entry: SessionEntry;
}): void {
	void mirrorSessionEntryToPostgres(options).catch(() => undefined);
}

export async function backfillSessionEntriesToPostgres(options: {
	header: SessionHeader;
	sessionFile: string;
	entries: SessionEntry[];
}): Promise<number> {
	let count = 0;
	for (const entry of options.entries) {
		if (entry.type !== "message") continue;
		await mirrorSessionEntryToPostgres({
			header: options.header,
			sessionFile: options.sessionFile,
			entry,
		});
		count++;
	}
	return count;
}

export async function searchChatMessages(options: SearchOptions): Promise<ChatSearchHit[]> {
	const sql = getSql();
	await ensureSchema(sql);
	const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
	const rows = await sql<ChatSearchHit[]>`
		SELECT
			m.session_id AS "sessionId",
			m.entry_id AS "entryId",
			s.cwd,
			m.role,
			m.timestamp::text AS timestamp,
			m.text,
			ts_rank_cd(to_tsvector('simple', m.text), websearch_to_tsquery('simple', ${options.query})) AS rank
		FROM messages m
		JOIN sessions s ON s.id = m.session_id
		WHERE
			(
				to_tsvector('simple', m.text) @@ websearch_to_tsquery('simple', ${options.query})
				OR m.text ILIKE ${`%${options.query}%`}
			)
			AND (${options.cwd ?? null}::text IS NULL OR s.cwd = ${options.cwd ?? null})
			AND (${options.sessionId ?? null}::text IS NULL OR m.session_id = ${options.sessionId ?? null})
			AND (${options.role ?? null}::text IS NULL OR m.role = ${options.role ?? null})
			AND (${options.since ?? null}::timestamptz IS NULL OR m.timestamp >= ${options.since ?? null}::timestamptz)
			AND (${options.until ?? null}::timestamptz IS NULL OR m.timestamp <= ${options.until ?? null}::timestamptz)
		ORDER BY rank DESC, m.timestamp DESC
		LIMIT ${limit}
	`;
	return rows;
}

export function sessionEntryIsMirrorable(entry: SessionEntry): entry is SessionMessageEntry {
	return entry.type === "message" && extractMessageText(entry.message).length > 0;
}
