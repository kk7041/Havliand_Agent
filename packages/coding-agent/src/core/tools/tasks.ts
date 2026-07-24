import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentTool } from "@havliand_agent/agent-core";
import { Text } from "@havliand_agent/tui";
import { type Static, Type } from "typebox";
import { getAgentDir } from "../../config.ts";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import type { ExtensionContext, ToolDefinition, ToolRenderResultOptions } from "../extensions/types.ts";
import { withFileMutationQueue } from "./file-mutation-queue.ts";
import { str, toolHeader } from "./render-utils.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

export type TaskStatus = "pending" | "in_progress" | "completed" | "deleted";

export interface TaskItem {
	id: string;
	subject: string;
	description?: string;
	status: TaskStatus;
	activeForm: string;
	owner?: string;
	blocks: string[];
	blockedBy: string[];
	createdAt: string;
	updatedAt: string;
}

export interface TaskStoreFile {
	cwd: string;
	sessionId: string;
	tasks: TaskItem[];
}

const taskInputSchema = Type.Object({
	id: Type.Optional(Type.String({ description: "Optional stable task id" })),
	subject: Type.String({ description: "Task title in imperative form" }),
	description: Type.Optional(Type.String({ description: "Task description" })),
	owner: Type.Optional(Type.String({ description: "Owner agent or person" })),
	blocks: Type.Optional(Type.Array(Type.String({ description: "Task ids blocked by this task" }))),
	blockedBy: Type.Optional(Type.Array(Type.String({ description: "Task ids that block this task" }))),
});

const taskCreateSchema = Type.Object({
	task: Type.Optional(taskInputSchema),
	tasks: Type.Optional(Type.Array(taskInputSchema)),
});

const taskListSchema = Type.Object({
	status: Type.Optional(Type.String({ description: "Filter by status" })),
	owner: Type.Optional(Type.String({ description: "Filter by owner" })),
	cwd: Type.Optional(Type.String({ description: "Filter by cwd" })),
	sessionId: Type.Optional(Type.String({ description: "Filter by session id" })),
	limit: Type.Optional(Type.Number({ description: "Maximum results to return" })),
});

const taskGetSchema = Type.Object({
	id: Type.String({ description: "Task id" }),
});

const taskUpdateSchema = Type.Object({
	id: Type.String({ description: "Task id" }),
	subject: Type.Optional(Type.String({ description: "New subject" })),
	description: Type.Optional(Type.String({ description: "New description" })),
	status: Type.Optional(Type.String({ description: "New task status" })),
	owner: Type.Optional(Type.String({ description: "New owner" })),
	addBlocks: Type.Optional(Type.Array(Type.String({ description: "Task ids to add to blocks" }))),
	removeBlocks: Type.Optional(Type.Array(Type.String({ description: "Task ids to remove from blocks" }))),
	addBlockedBy: Type.Optional(Type.Array(Type.String({ description: "Task ids to add to blockedBy" }))),
	removeBlockedBy: Type.Optional(Type.Array(Type.String({ description: "Task ids to remove from blockedBy" }))),
});

const taskStopSchema = Type.Object({
	id: Type.String({ description: "Task id" }),
	reason: Type.Optional(Type.String({ description: "Why the task was stopped" })),
});

type TaskInput = Static<typeof taskInputSchema>;

export interface TaskToolDetails {
	tasks?: TaskItem[];
	task?: TaskItem;
}

function nowIso(): string {
	return new Date().toISOString();
}

function stableId(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function taskRootDir(): string {
	return join(getAgentDir(), "tasks");
}

export function getTaskStorePath(cwd: string, sessionId: string): string {
	return join(taskRootDir(), stableId(cwd), `${sessionId}.json`);
}

function getStorePath(ctx: ExtensionContext): string {
	const sessionId = ctx.sessionManager.getSessionId?.() ?? "session";
	return getTaskStorePath(ctx.cwd, sessionId);
}

function getStoreKeys(ctx: ExtensionContext): { cwd: string; sessionId: string } {
	return {
		cwd: ctx.cwd,
		sessionId: ctx.sessionManager.getSessionId?.() ?? "session",
	};
}

function normalizeTaskInput(input: TaskInput, base: Partial<TaskItem> = {}): TaskItem {
	const id = input.id?.trim() || base.id || randomUUID().slice(0, 12);
	const subject = input.subject.trim();
	const description = input.description?.trim() || base.description;
	const owner = input.owner?.trim() || base.owner;
	const blocks = Array.from(new Set((input.blocks ?? base.blocks ?? []).map((value) => value.trim()).filter(Boolean)));
	const blockedBy = Array.from(
		new Set((input.blockedBy ?? base.blockedBy ?? []).map((value) => value.trim()).filter(Boolean)),
	);
	const timestamp = nowIso();
	return {
		id,
		subject,
		description,
		status: base.status ?? "pending",
		activeForm: base.activeForm ?? subject,
		owner,
		blocks,
		blockedBy,
		createdAt: base.createdAt ?? timestamp,
		updatedAt: timestamp,
	};
}

function summarizeTask(task: TaskItem): string {
	const parts = [`${task.id}`, task.subject, task.status];
	if (task.owner) parts.push(`owner=${task.owner}`);
	if (task.blockedBy.length > 0) parts.push(`blockedBy=${task.blockedBy.join(",")}`);
	return parts.join(" | ");
}

function formatTaskList(tasks: TaskItem[]): string {
	if (tasks.length === 0) return "No tasks.";
	return tasks.map((task, index) => `${index + 1}. ${summarizeTask(task)}`).join("\n");
}

export async function readTaskStore(filePath: string): Promise<TaskStoreFile> {
	try {
		const raw = await readFile(filePath, "utf-8");
		const parsed = JSON.parse(raw) as Partial<TaskStoreFile>;
		return {
			cwd: typeof parsed.cwd === "string" ? parsed.cwd : "",
			sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : "",
			tasks: Array.isArray(parsed.tasks) ? (parsed.tasks as TaskItem[]) : [],
		};
	} catch {
		return { cwd: "", sessionId: "", tasks: [] };
	}
}

async function writeStore(filePath: string, store: TaskStoreFile): Promise<void> {
	mkdirSync(dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf-8");
}

async function mutateStore(filePath: string, updater: (store: TaskStoreFile) => TaskStoreFile): Promise<TaskStoreFile> {
	return withFileMutationQueue(filePath, async () => {
		const current = await readTaskStore(filePath);
		const next = updater(current);
		await writeStore(filePath, next);
		return next;
	});
}

async function loadAllTasks(): Promise<Array<{ filePath: string; store: TaskStoreFile }>> {
	const root = taskRootDir();
	if (!existsSync(root)) return [];
	const results: Array<{ filePath: string; store: TaskStoreFile }> = [];
	const queue = [root];
	while (queue.length > 0) {
		const dir = queue.pop()!;
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				queue.push(fullPath);
			} else if (entry.isFile() && entry.name.endsWith(".json")) {
				results.push({ filePath: fullPath, store: await readTaskStore(fullPath) });
			}
		}
	}
	return results;
}

function findTask(
	taskStores: Array<{ filePath: string; store: TaskStoreFile }>,
	id: string,
): { filePath: string; store: TaskStoreFile; task: TaskItem } | undefined {
	for (const entry of taskStores) {
		const task = entry.store.tasks.find((item) => item.id === id);
		if (task) return { ...entry, task };
	}
	return undefined;
}

function taskIsBlocked(taskStores: Array<{ filePath: string; store: TaskStoreFile }>, task: TaskItem): boolean {
	return task.blockedBy.some((id) => {
		const dep = findTask(taskStores, id)?.task;
		return dep !== undefined && dep.status !== "completed" && dep.status !== "deleted";
	});
}

function formatTasksResult(tasks: TaskItem[]): string {
	return formatTaskList(tasks);
}

function renderTaskCall(args: Record<string, unknown>, title: string, theme: Theme, previous?: Text): Text {
	const text = previous ?? new Text("", 0, 0);
	const id = str(args.id);
	const subject = str(args.subject);
	text.setText(`${toolHeader(title, theme)} ${theme.fg("accent", id ?? subject ?? "")}`);
	return text;
}

function formatTaskRenderResult(
	result: { content: Array<{ type: string; text?: string }> },
	options: ToolRenderResultOptions,
	theme: Theme,
): string {
	const output = result.content
		.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("\n");
	if (!output) return "";
	const lines = output.split("\n");
	const shown = options.expanded ? lines : lines.slice(0, 20);
	const remaining = lines.length - shown.length;
	let text = `\n${shown.map((line) => theme.fg("toolOutput", line)).join("\n")}`;
	if (remaining > 0) text += theme.fg("muted", `\n... (${remaining} more lines)`);
	return text;
}

function renderTaskResult(
	result: { content: Array<{ type: string; text?: string }> },
	options: ToolRenderResultOptions,
	theme: Theme,
	previous?: Text,
): Text {
	const text = previous ?? new Text("", 0, 0);
	text.setText(formatTaskRenderResult(result, options, theme));
	return text;
}

function ensureNoBlockedDependencies(
	taskStores: Array<{ filePath: string; store: TaskStoreFile }>,
	task: TaskItem,
): void {
	if (taskIsBlocked(taskStores, task)) {
		throw new Error(`Task "${task.id}" is blocked by unresolved dependencies`);
	}
}

function validateStatus(status: string | undefined): status is TaskStatus {
	return status === "pending" || status === "in_progress" || status === "completed" || status === "deleted";
}

export function createTaskCreateToolDefinition(_cwd: string): ToolDefinition<typeof taskCreateSchema, TaskToolDetails> {
	return {
		name: "task_create",
		label: "task_create",
		description: "Create one or more tasks.",
		promptSnippet: "Create structured tasks",
		parameters: taskCreateSchema,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx) throw new Error("Task tools require a session context");
			const inputs = params.tasks ?? (params.task ? [params.task] : []);
			if (inputs.length === 0) {
				throw new Error("Provide task or tasks");
			}
			const filePath = getStorePath(ctx);
			const { cwd: storeCwd, sessionId } = getStoreKeys(ctx);
			const next = await mutateStore(filePath, (store) => {
				const tasks = [...store.tasks];
				const seen = new Set(tasks.map((task) => task.id));
				for (const input of inputs) {
					const task = normalizeTaskInput(input);
					if (seen.has(task.id)) {
						throw new Error(`Duplicate task id: ${task.id}`);
					}
					seen.add(task.id);
					tasks.push(task);
				}
				return { cwd: storeCwd, sessionId, tasks };
			});
			return {
				content: [{ type: "text", text: formatTasksResult(next.tasks) }],
				details: { tasks: next.tasks },
			};
		},
		renderCall(args, theme, context) {
			return renderTaskCall(args, "TaskCreate", theme, context.lastComponent as Text | undefined);
		},
		renderResult(result, options, theme, context) {
			return renderTaskResult(result as any, options, theme, context.lastComponent as Text | undefined);
		},
	};
}

export function createTaskListToolDefinition(cwd: string): ToolDefinition<typeof taskListSchema, TaskToolDetails> {
	return {
		name: "task_list",
		label: "task_list",
		description: "List tasks with optional filters.",
		promptSnippet: "List tasks",
		parameters: taskListSchema,
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			void cwd;
			const stores = await loadAllTasks();
			let entries = stores;
			if (params.cwd) {
				const cwdFilter = params.cwd.trim();
				entries = entries.filter((entry) => entry.store.cwd === cwdFilter);
			}
			if (params.sessionId) {
				entries = entries.filter((entry) => entry.store.sessionId === params.sessionId);
			}
			let tasks = entries.flatMap((entry) => entry.store.tasks);
			if (params.status) {
				tasks = tasks.filter((task) => task.status === params.status);
			}
			if (params.owner) {
				tasks = tasks.filter((task) => task.owner === params.owner);
			}
			const limit = Math.max(1, params.limit ?? 100);
			tasks = tasks.slice(0, limit);
			return {
				content: [{ type: "text", text: formatTasksResult(tasks) }],
				details: { tasks },
			};
		},
		renderCall(args, theme, context) {
			return renderTaskCall(args, "TaskList", theme, context.lastComponent as Text | undefined);
		},
		renderResult(result, options, theme, context) {
			return renderTaskResult(result as any, options, theme, context.lastComponent as Text | undefined);
		},
	};
}

export function createTaskGetToolDefinition(cwd: string): ToolDefinition<typeof taskGetSchema, TaskToolDetails> {
	return {
		name: "task_get",
		label: "task_get",
		description: "Get a task by id.",
		promptSnippet: "Get a task",
		parameters: taskGetSchema,
		async execute(_toolCallId, params) {
			void cwd;
			const stores = await loadAllTasks();
			const task = findTask(stores, params.id)?.task;
			if (!task) throw new Error(`Task not found: ${params.id}`);
			return {
				content: [{ type: "text", text: summarizeTask(task) }],
				details: { task },
			};
		},
		renderCall(args, theme, context) {
			return renderTaskCall(args, "TaskGet", theme, context.lastComponent as Text | undefined);
		},
		renderResult(result, options, theme, context) {
			return renderTaskResult(result as any, options, theme, context.lastComponent as Text | undefined);
		},
	};
}

export function createTaskUpdateToolDefinition(cwd: string): ToolDefinition<typeof taskUpdateSchema, TaskToolDetails> {
	return {
		name: "task_update",
		label: "task_update",
		description: "Update a task's fields, status, or dependencies.",
		promptSnippet: "Update a task",
		parameters: taskUpdateSchema,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx) throw new Error("Task tools require a session context");
			void cwd;
			const filePath = getStorePath(ctx);
			const next = await mutateStore(filePath, (store) => {
				const taskIndex = store.tasks.findIndex((task) => task.id === params.id);
				if (taskIndex === -1) {
					throw new Error(`Task not found: ${params.id}`);
				}
				const tasks = [...store.tasks];
				const task = { ...tasks[taskIndex] };
				if (params.subject !== undefined) task.subject = params.subject.trim();
				if (params.description !== undefined) task.description = params.description.trim();
				if (params.owner !== undefined) task.owner = params.owner.trim() || undefined;
				if (params.addBlocks) task.blocks = Array.from(new Set([...task.blocks, ...params.addBlocks]));
				if (params.removeBlocks) task.blocks = task.blocks.filter((id) => !params.removeBlocks?.includes(id));
				if (params.addBlockedBy) task.blockedBy = Array.from(new Set([...task.blockedBy, ...params.addBlockedBy]));
				if (params.removeBlockedBy)
					task.blockedBy = task.blockedBy.filter((id) => !params.removeBlockedBy?.includes(id));
				if (params.status !== undefined) {
					if (!validateStatus(params.status)) throw new Error(`Invalid status: ${params.status}`);
					task.status = params.status;
				}
				task.activeForm = task.subject;
				task.updatedAt = nowIso();
				if (task.status === "in_progress") {
					ensureNoBlockedDependencies([{ filePath, store }], task);
				}
				tasks[taskIndex] = task;
				return { ...store, tasks };
			});
			const task = next.tasks.find((item) => item.id === params.id);
			return {
				content: [{ type: "text", text: task ? summarizeTask(task) : "(missing task)" }],
				details: { task },
			};
		},
		renderCall(args, theme, context) {
			return renderTaskCall(args, "TaskUpdate", theme, context.lastComponent as Text | undefined);
		},
		renderResult(result, options, theme, context) {
			return renderTaskResult(result as any, options, theme, context.lastComponent as Text | undefined);
		},
	};
}

export function createTaskStopToolDefinition(cwd: string): ToolDefinition<typeof taskStopSchema, TaskToolDetails> {
	return {
		name: "task_stop",
		label: "task_stop",
		description: "Stop a task and mark it deleted.",
		promptSnippet: "Stop a task",
		parameters: taskStopSchema,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx) throw new Error("Task tools require a session context");
			void cwd;
			const filePath = getStorePath(ctx);
			const next = await mutateStore(filePath, (store) => {
				const taskIndex = store.tasks.findIndex((task) => task.id === params.id);
				if (taskIndex === -1) {
					throw new Error(`Task not found: ${params.id}`);
				}
				const tasks = [...store.tasks];
				tasks[taskIndex] = {
					...tasks[taskIndex],
					status: "deleted",
					updatedAt: nowIso(),
				};
				return { ...store, tasks };
			});
			const task = next.tasks.find((item) => item.id === params.id);
			return {
				content: [{ type: "text", text: task ? summarizeTask(task) : "(missing task)" }],
				details: { task },
			};
		},
		renderCall(args, theme, context) {
			return renderTaskCall(args, "TaskStop", theme, context.lastComponent as Text | undefined);
		},
		renderResult(result, options, theme, context) {
			return renderTaskResult(result as any, options, theme, context.lastComponent as Text | undefined);
		},
	};
}

export function createTaskTools(cwd: string): AgentTool<any>[] {
	return [
		wrapToolDefinition(createTaskCreateToolDefinition(cwd)),
		wrapToolDefinition(createTaskListToolDefinition(cwd)),
		wrapToolDefinition(createTaskGetToolDefinition(cwd)),
		wrapToolDefinition(createTaskUpdateToolDefinition(cwd)),
		wrapToolDefinition(createTaskStopToolDefinition(cwd)),
	];
}
