import { DatabaseSync } from 'node:sqlite';

const HOUR = 3600e3;

// Built-in SQLite, so history adds no dependency. One row per region per poll, one row per incident.
export function openHistory(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS snapshots (
      region TEXT NOT NULL, ts INTEGER NOT NULL, incidents INTEGER NOT NULL, delay INTEGER NOT NULL,
      PRIMARY KEY (region, ts));
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY, region TEXT NOT NULL, road TEXT NOT NULL, cause TEXT NOT NULL, source TEXT, summary TEXT,
      first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, max_delay INTEGER NOT NULL, lon REAL, lat REAL);
    CREATE INDEX IF NOT EXISTS incidents_region_seen ON incidents (region, last_seen);
  `);

  const insSnap = db.prepare('INSERT OR REPLACE INTO snapshots VALUES (?, ?, ?, ?)');
  const upsertInc = db.prepare(`
    INSERT INTO incidents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET last_seen = excluded.last_seen, max_delay = max(max_delay, excluded.max_delay),
      cause = excluded.cause, source = excluded.source, summary = excluded.summary`);

  return {
    // incidents: [{id, region, road, cause, source, summary, delay, lon, lat}]
    record(ts, regionIds, incidents) {
      db.exec('BEGIN');
      try {
        for (const r of regionIds) {
          const mine = incidents.filter((i) => i.region === r);
          insSnap.run(r, ts, mine.length, mine.reduce((s, i) => s + (i.delay ?? 0), 0));
        }
        for (const i of incidents) {
          upsertInc.run(i.id, i.region, i.road, i.cause, i.source ?? null, i.summary ?? null, ts, ts, i.delay ?? 0, i.lon ?? null, i.lat ?? null);
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },

    query(region, since) {
      return {
        // Hourly averages of the per-poll counts
        series: db.prepare(`SELECT ts / ${HOUR} * ${HOUR} AS t, round(avg(incidents), 1) AS incidents, round(avg(delay) / 60) AS delayMin
          FROM snapshots WHERE region = ? AND ts >= ? GROUP BY t ORDER BY t`).all(region, since),
        // Average delay by Malaysia hour of day (UTC+8)
        byHour: db.prepare(`SELECT (ts / ${HOUR} + 8) % 24 AS hour, round(avg(delay) / 60) AS delayMin
          FROM snapshots WHERE region = ? AND ts >= ? GROUP BY hour ORDER BY hour`).all(region, since),
        causes: db.prepare(`SELECT cause, count(*) AS n FROM incidents WHERE region = ? AND last_seen >= ?
          GROUP BY cause ORDER BY n DESC`).all(region, since),
        roads: db.prepare(`SELECT road, count(*) AS n, round(max(max_delay) / 60) AS worstMin FROM incidents
          WHERE region = ? AND last_seen >= ? AND road <> '' GROUP BY road ORDER BY n DESC, worstMin DESC LIMIT 10`).all(region, since),
      };
    },

    prune(before) {
      db.prepare('DELETE FROM snapshots WHERE ts < ?').run(before);
      db.prepare('DELETE FROM incidents WHERE last_seen < ?').run(before);
    },
  };
}
