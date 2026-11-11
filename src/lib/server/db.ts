import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { config } from './env.ts';

export type User = {
	id: number;
	github_id: string;
	handle: string;
	name: string;
	avatar_url: string | null;
	created_at: number;
	suspended_at?: number | null;
};

const SCHEMA = `
CREATE TABLE users (
	id INTEGER PRIMARY KEY,
	x_id TEXT NOT NULL UNIQUE,
	handle TEXT NOT NULL,
	handle_lower TEXT NOT NULL,
	name TEXT NOT NULL,
	avatar_url TEXT,
	created_at INTEGER NOT NULL
);
CREATE INDEX users_handle ON users(handle_lower);

CREATE TABLE sessions (
	token_hash TEXT PRIMARY KEY,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at INTEGER NOT NULL
);

CREATE TABLE api_keys (
	user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	ciphertext BLOB NOT NULL,
	iv BLOB NOT NULL,
	tag BLOB NOT NULL,
	preview TEXT NOT NULL,
	limit_micro INTEGER,
	remaining_micro INTEGER,
	limit_reset TEXT,
	checked_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);

CREATE TABLE projects (
	id INTEGER PRIMARY KEY,
	slug TEXT NOT NULL UNIQUE,
	title TEXT NOT NULL,
	prompt TEXT NOT NULL,
	author_id INTEGER NOT NULL REFERENCES users(id),
	findings_md TEXT NOT NULL DEFAULT '',
	findings_html TEXT NOT NULL DEFAULT '',
	open_questions TEXT NOT NULL DEFAULT '[]',
	created_at INTEGER NOT NULL
);
CREATE INDEX projects_created ON projects(created_at);

CREATE TABLE donations (
	id INTEGER PRIMARY KEY,
	public_id TEXT NOT NULL UNIQUE,
	project_id INTEGER NOT NULL REFERENCES projects(id),
	user_id INTEGER NOT NULL REFERENCES users(id),
	model TEXT NOT NULL,
	model_name TEXT NOT NULL,
	amount_micro INTEGER NOT NULL,
	spent_micro INTEGER NOT NULL DEFAULT 0,
	run_count INTEGER NOT NULL DEFAULT 0,
	status TEXT NOT NULL CHECK (status IN ('queued','running','completed','stopped','failed')),
	end_reason TEXT,
	created_at INTEGER NOT NULL,
	finished_at INTEGER
);
CREATE INDEX donations_open ON donations(status, id);
CREATE INDEX donations_user ON donations(user_id, id);
CREATE INDEX donations_project ON donations(project_id, id);

CREATE TABLE runs (
	id INTEGER PRIMARY KEY,
	project_id INTEGER NOT NULL REFERENCES projects(id),
	donation_id INTEGER NOT NULL REFERENCES donations(id),
	user_id INTEGER NOT NULL REFERENCES users(id),
	seq INTEGER NOT NULL,
	model TEXT NOT NULL,
	model_name TEXT NOT NULL,
	question TEXT NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
	report_md TEXT NOT NULL DEFAULT '',
	report_html TEXT NOT NULL DEFAULT '',
	sources TEXT NOT NULL DEFAULT '[]',
	input_tokens INTEGER NOT NULL DEFAULT 0,
	output_tokens INTEGER NOT NULL DEFAULT 0,
	cost_micro INTEGER NOT NULL DEFAULT 0,
	commit_sha TEXT,
	error TEXT,
	started_at INTEGER NOT NULL,
	finished_at INTEGER,
	UNIQUE (project_id, seq)
);
CREATE INDEX runs_finished ON runs(finished_at);
CREATE INDEX runs_user ON runs(user_id, finished_at);
`;

/** Each entry brings a database from the version before it up to its own number. */
const MIGRATIONS: string[] = [
	SCHEMA,
	`
	ALTER TABLE projects ADD COLUMN hidden_at INTEGER;
	ALTER TABLE projects ADD COLUMN hidden_reason TEXT;
	ALTER TABLE users ADD COLUMN suspended_at INTEGER;
	CREATE TABLE reports (
		id INTEGER PRIMARY KEY,
		project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
		reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
		reason TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		resolved_at INTEGER
	);
	CREATE INDEX reports_open ON reports(resolved_at, id);
	CREATE INDEX runs_project_finished ON runs(project_id, finished_at);
	CREATE INDEX donations_created ON donations(created_at);
	`,
	// Covers what the board adds up on every read, so that the totals do not need to visit each run.
	`
	CREATE INDEX runs_totals ON runs(status, project_id, user_id, finished_at, cost_micro, seq);
	`,
	// Accounts are identified by GitHub, in place of X.
	`ALTER TABLE users RENAME COLUMN x_id TO github_id;`,
	// Rounds. A question is proposed, pledges are made towards it, and the pledges on the question that
	// leads when the round closes become donations. Nothing existing is rebuilt: a pledge is kept in its
	// own table until then, and a donation that came from one records the question it was made for.
	`
	ALTER TABLE projects ADD COLUMN round INTEGER NOT NULL DEFAULT 1;
	ALTER TABLE projects ADD COLUMN round_closes_at INTEGER;
	CREATE TABLE proposals (
		id INTEGER PRIMARY KEY,
		project_id INTEGER NOT NULL REFERENCES projects(id),
		user_id INTEGER NOT NULL REFERENCES users(id),
		kind TEXT NOT NULL CHECK (kind IN ('question','audit')),
		question TEXT NOT NULL,
		status TEXT NOT NULL CHECK (status IN ('open','won','withdrawn','removed')),
		round INTEGER,
		created_at INTEGER NOT NULL,
		settled_at INTEGER
	);
	CREATE INDEX proposals_project ON proposals(project_id, status);
	CREATE INDEX proposals_created ON proposals(created_at);
	CREATE TABLE pledges (
		id INTEGER PRIMARY KEY,
		proposal_id INTEGER NOT NULL REFERENCES proposals(id),
		user_id INTEGER NOT NULL REFERENCES users(id),
		model TEXT NOT NULL,
		model_name TEXT NOT NULL,
		amount_micro INTEGER NOT NULL,
		status TEXT NOT NULL CHECK (status IN ('standing','called','withdrawn','lapsed','released')),
		reason TEXT,
		donation_id INTEGER REFERENCES donations(id),
		created_at INTEGER NOT NULL,
		settled_at INTEGER
	);
	CREATE INDEX pledges_proposal ON pledges(proposal_id, status);
	CREATE INDEX pledges_user ON pledges(user_id, id);
	CREATE INDEX pledges_created ON pledges(created_at);
	ALTER TABLE donations ADD COLUMN proposal_id INTEGER REFERENCES proposals(id);
	CREATE INDEX projects_round ON projects(round_closes_at);
	`,
];

const holder = globalThis as unknown as { __osDb?: DatabaseSync };

function open(): DatabaseSync {
	mkdirSync(config.dataDir, { recursive: true });
	const db = new DatabaseSync(join(config.dataDir, 'openresearch.sqlite'));
	db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
	const version = (db.prepare('PRAGMA user_version').get() as { user_version: number })
		.user_version;
	for (let next = version; next < MIGRATIONS.length; next++) {
		db.exec(`BEGIN; ${MIGRATIONS[next]} PRAGMA user_version = ${next + 1}; COMMIT;`);
	}
	return db;
}

export function db(): DatabaseSync {
	return (holder.__osDb ??= open());
}

export function all<T>(sql: string, ...params: SQLInputValue[]): T[] {
	return db()
		.prepare(sql)
		.all(...params)
		.map((row) => ({ ...row })) as T[];
}

export function get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
	const row = db().prepare(sql).get(...params);
	return row ? ({ ...row } as T) : undefined;
}

export function run(sql: string, ...params: SQLInputValue[]) {
	return db().prepare(sql).run(...params);
}

export function tx<T>(fn: () => T): T {
	const d = db();
	d.exec('BEGIN IMMEDIATE');
	try {
		const out = fn();
		d.exec('COMMIT');
		return out;
	} catch (err) {
		d.exec('ROLLBACK');
		throw err;
	}
}
