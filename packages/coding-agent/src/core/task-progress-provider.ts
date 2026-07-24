import { type FSWatcher, type Stats, unwatchFile, watchFile } from "node:fs";
import { dirname } from "node:path";
import { closeWatcher, watchWithErrorHandler } from "../utils/fs-watch.ts";
import { getTaskStorePath, readTaskStore, type TaskItem } from "./tools/tasks.ts";

export interface TaskProgress {
	done: number;
	total: number;
}

export type TaskProgressCallback = (progress: TaskProgress) => void;

const WATCH_DEBOUNCE_MS = 100;
const WATCH_FILE_INTERVAL_MS = 500;

function calculateTaskProgress(tasks: TaskItem[]): TaskProgress {
	const activeTasks = tasks.filter((task) => task.status !== "deleted");
	return {
		done: activeTasks.filter((task) => task.status === "completed").length,
		total: activeTasks.length,
	};
}

function sameProgress(left: TaskProgress, right: TaskProgress): boolean {
	return left.done === right.done && left.total === right.total;
}

export class TaskProgressProvider {
	private readonly filePath: string;
	private readonly parentDir: string;
	private callbacks = new Set<TaskProgressCallback>();
	private progress: TaskProgress = { done: 0, total: 0 };
	private fileWatchListener: ((current: Stats, previous: Stats) => void) | null = null;
	private parentWatcher: FSWatcher | null = null;
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;
	private refreshInFlight = false;
	private refreshPending = false;
	private disposed = false;

	constructor(cwd: string, sessionId: string) {
		this.filePath = getTaskStorePath(cwd, sessionId);
		this.parentDir = dirname(this.filePath);
		this.watchTaskFile();
		this.watchParentDir();
		void this.refresh();
	}

	getProgress(): TaskProgress {
		return this.progress;
	}

	onChange(callback: TaskProgressCallback): () => void {
		this.callbacks.add(callback);
		callback(this.progress);
		return () => this.callbacks.delete(callback);
	}

	dispose(): void {
		this.disposed = true;
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}
		if (this.fileWatchListener) {
			unwatchFile(this.filePath, this.fileWatchListener);
			this.fileWatchListener = null;
		}
		closeWatcher(this.parentWatcher);
		this.parentWatcher = null;
		this.callbacks.clear();
	}

	private watchTaskFile(): void {
		this.fileWatchListener = () => this.scheduleRefresh();
		watchFile(this.filePath, { interval: WATCH_FILE_INTERVAL_MS }, this.fileWatchListener);
	}

	private watchParentDir(): void {
		this.parentWatcher = watchWithErrorHandler(
			this.parentDir,
			(_eventType, filename) => {
				if (typeof filename !== "string" || this.filePath.endsWith(filename)) {
					this.scheduleRefresh();
				}
			},
			() => {
				this.parentWatcher = null;
			},
		);
	}

	private scheduleRefresh(): void {
		if (this.disposed || this.refreshTimer) return;
		if (this.refreshInFlight) {
			this.refreshPending = true;
			return;
		}
		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = null;
			void this.refresh();
		}, WATCH_DEBOUNCE_MS);
	}

	private async refresh(): Promise<void> {
		if (this.disposed) return;
		if (this.refreshInFlight) {
			this.refreshPending = true;
			return;
		}

		this.refreshInFlight = true;
		try {
			const store = await readTaskStore(this.filePath);
			if (this.disposed) return;
			const next = calculateTaskProgress(store.tasks);
			if (!sameProgress(this.progress, next)) {
				this.progress = next;
				this.notify();
			}
		} finally {
			this.refreshInFlight = false;
			if (this.refreshPending && !this.disposed) {
				this.refreshPending = false;
				this.scheduleRefresh();
			}
		}
	}

	private notify(): void {
		for (const callback of this.callbacks) {
			callback(this.progress);
		}
	}
}

export { calculateTaskProgress };
