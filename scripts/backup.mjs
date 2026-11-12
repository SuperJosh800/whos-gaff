// Makes a consistent copy of the database in $BACKUP_PATH (default /data/backups) and keeps the newest 14.
// Run inside the container: docker exec whos-gaff node scripts/backup.mjs
import { backup, DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const source = process.env.DATABASE_PATH ?? 'data/whos-gaff.db';
const dir = process.env.BACKUP_PATH ?? join(source, '..', 'backups');
const KEEP = 14;

mkdirSync(dir, { recursive: true });
const name = `whos-gaff-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.db`;
const db = new DatabaseSync(source, { readOnly: true });
await backup(db, join(dir, name));
db.close();

const old = readdirSync(dir).filter((f) => /^whos-gaff-.*\.db$/.test(f)).sort().slice(0, -KEEP);
for (const f of old) rmSync(join(dir, f));
console.log(`Backed up to ${join(dir, name)}${old.length ? `, removed ${old.length} old backup(s)` : ''}`);
