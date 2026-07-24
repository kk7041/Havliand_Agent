#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { backfillSessionEntriesToPostgres } from "../src/core/chat-storage.ts";
import { loadEntriesFromFile, type SessionEntry, type SessionHeader } from "../src/core/session-manager.ts";

const root = process.argv[2];

if (!root) {
	console.error("Usage: tsx scripts/backfill-chat-postgres.ts <session-file-or-dir>");
	process.exit(1);
}

async function collectJsonlFiles(path: string): Promise<string[]> {
	if (!existsSync(path)) return [];
	const stats = statSync(path);
	if (stats.isFile()) return path.endsWith(".jsonl") ? [path] : [];
	if (!stats.isDirectory()) return [];

	const files: string[] = [];
	const queue = [path];
	while (queue.length > 0) {
		const dir = queue.pop()!;
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) queue.push(fullPath);
			else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(fullPath);
		}
	}
	return files;
}

let total = 0;
for (const filePath of await collectJsonlFiles(root)) {
	const entries = loadEntriesFromFile(filePath);
	const header = entries.find((entry): entry is SessionHeader => entry.type === "session");
	if (!header) continue;
	const count = await backfillSessionEntriesToPostgres({
		header,
		sessionFile: filePath,
		entries: entries.filter((entry): entry is SessionEntry => entry.type !== "session"),
	});
	total += count;
	console.log(`${filePath}: ${count}`);
}

console.log(`Backfilled ${total} messages.`);
