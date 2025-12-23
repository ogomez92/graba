/**
 * Server-side recordings management
 * Handles storage, retrieval, and cleanup of audio recordings
 */

import { readFile, writeFile, mkdir, rm, readdir, stat, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

// Data directory path (relative to project root)
const DATA_DIR = path.join(process.cwd(), 'data');
const RECORDINGS_DIR = path.join(DATA_DIR, 'recordings');
const INDEX_FILE = path.join(DATA_DIR, 'recordings.json');

// Recording retention period (7 days in milliseconds)
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type OutputFormat = 'mp3' | 'aac' | 'opus';

export interface Recording {
	id: string;
	createdAt: string; // ISO date string
	expiresAt: string; // ISO date string
	duration: number; // seconds
	hasMic: boolean;
	hasSystemAudio: boolean;
	format: OutputFormat;
	tracks: {
		mic?: string; // filename
		system?: string; // filename
		mixed?: string; // filename
	};
}

export interface RecordingsIndex {
	recordings: Recording[];
}

/**
 * Ensure data directories exist
 */
export async function ensureDataDirs(): Promise<void> {
	if (!existsSync(DATA_DIR)) {
		await mkdir(DATA_DIR, { recursive: true });
	}
	if (!existsSync(RECORDINGS_DIR)) {
		await mkdir(RECORDINGS_DIR, { recursive: true });
	}
	if (!existsSync(INDEX_FILE)) {
		await writeFile(INDEX_FILE, JSON.stringify({ recordings: [] }, null, 2));
	}
}

interface LoadResult {
	index: RecordingsIndex;
	loadedFromDisk: boolean;
}

/**
 * Load recordings index
 */
async function loadRecordingsInternal(): Promise<LoadResult> {
	await ensureDataDirs();

	try {
		const data = await readFile(INDEX_FILE, 'utf-8');
		return { index: JSON.parse(data), loadedFromDisk: true };
	} catch {
		return { index: { recordings: [] }, loadedFromDisk: false };
	}
}

export async function loadRecordings(): Promise<RecordingsIndex> {
	const { index } = await loadRecordingsInternal();
	return index;
}

/**
 * Save recordings index atomically (write to temp file, then rename)
 */
async function saveRecordings(index: RecordingsIndex): Promise<void> {
	await ensureDataDirs();
	const tempFile = path.join(os.tmpdir(), `recordings-${crypto.randomUUID()}.json`);
	await writeFile(tempFile, JSON.stringify(index, null, 2));
	await rename(tempFile, INDEX_FILE);
}

/**
 * Generate a unique recording ID
 */
export function generateRecordingId(): string {
	return crypto.randomUUID();
}

/**
 * Get the directory path for a recording
 */
export function getRecordingDir(id: string): string {
	return path.join(RECORDINGS_DIR, id);
}

/**
 * Get the file path for a specific track
 */
export function getTrackPath(id: string, track: string, format: OutputFormat): string {
	const ext = format === 'aac' ? 'm4a' : format;
	return path.join(getRecordingDir(id), `${track}.${ext}`);
}

/**
 * Create a new recording entry
 */
export async function createRecording(params: {
	id: string;
	duration: number;
	hasMic: boolean;
	hasSystemAudio: boolean;
	format: OutputFormat;
	tracks: Recording['tracks'];
}): Promise<Recording> {
	const now = new Date();
	const expiresAt = new Date(now.getTime() + RETENTION_MS);

	const recording: Recording = {
		id: params.id,
		createdAt: now.toISOString(),
		expiresAt: expiresAt.toISOString(),
		duration: params.duration,
		hasMic: params.hasMic,
		hasSystemAudio: params.hasSystemAudio,
		format: params.format,
		tracks: params.tracks
	};

	const index = await loadRecordings();
	index.recordings.push(recording);
	await saveRecordings(index);

	return recording;
}

/**
 * Get a recording by ID
 */
export async function getRecording(id: string): Promise<Recording | null> {
	const index = await loadRecordings();
	return index.recordings.find((r) => r.id === id) || null;
}

/**
 * Delete a recording and its files
 */
export async function deleteRecording(id: string): Promise<boolean> {
	const index = await loadRecordings();
	const recordingIndex = index.recordings.findIndex((r) => r.id === id);

	if (recordingIndex === -1) {
		return false;
	}

	// Remove files
	const recordingDir = getRecordingDir(id);
	try {
		await rm(recordingDir, { recursive: true, force: true });
	} catch {
		// Directory might not exist, continue
	}

	// Remove from index
	index.recordings.splice(recordingIndex, 1);
	await saveRecordings(index);

	return true;
}

/**
 * Clean up expired recordings
 */
export async function cleanupExpiredRecordings(): Promise<number> {
	const { index, loadedFromDisk } = await loadRecordingsInternal();
	const now = new Date();
	let cleaned = 0;

	const toDelete: string[] = [];

	for (const recording of index.recordings) {
		const expiresAt = new Date(recording.expiresAt);
		if (expiresAt < now) {
			toDelete.push(recording.id);
		}
	}

	for (const id of toDelete) {
		await deleteRecording(id);
		cleaned++;
	}

	// Only clean up orphaned directories if we successfully loaded the index
	// This prevents deleting all recordings if the index file is corrupted
	if (loadedFromDisk) {
		try {
			const dirs = await readdir(RECORDINGS_DIR);
			// Reload index to get current state after deletions
			const currentIndex = await loadRecordings();
			const indexedIds = new Set(currentIndex.recordings.map((r) => r.id));

			for (const dir of dirs) {
				if (!indexedIds.has(dir)) {
					const dirPath = path.join(RECORDINGS_DIR, dir);
					const dirStat = await stat(dirPath);
					if (dirStat.isDirectory()) {
						await rm(dirPath, { recursive: true, force: true });
						cleaned++;
					}
				}
			}
		} catch {
			// Directory might not exist
		}
	}

	return cleaned;
}

/**
 * Get content type for a format
 */
export function getContentType(format: OutputFormat): string {
	switch (format) {
		case 'mp3':
			return 'audio/mpeg';
		case 'aac':
			return 'audio/mp4';
		case 'opus':
			return 'audio/webm';
		default:
			return 'application/octet-stream';
	}
}

/**
 * Get file extension for a format
 */
export function getFileExtension(format: OutputFormat): string {
	switch (format) {
		case 'mp3':
			return 'mp3';
		case 'aac':
			return 'm4a';
		case 'opus':
			return 'webm';
		default:
			return 'bin';
	}
}
