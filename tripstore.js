// Trip recording ("行车记录"), stored in the same SQLite file as the traffic history.
// Each device (a random id kept in the browser) only ever sees its own trips. Trips are kept until deleted.
import { DatabaseSync } from 'node:sqlite';
import { distance } from './public/geo.js';

const MIN_MOVE_M = 100; // store a point every 100 m moved
const TRIP_GAP_MS = 10 * 60e3; // no movement for 10 min ends the trip

// What to do with a new position, given the last stored point of this device:
//   'anchor' – no trip running (first fix, or stopped > 10 min): remember it as a possible start
//   'skip'   – hasn't moved 100 m yet
//   'start'  – moved 100 m from the anchor: create a trip with both points
//   'append' – moved 100 m during a trip: add the point
export function tripAction(last, p) {
  if (!last || p.ts - last.ts > TRIP_GAP_MS) return 'anchor';
  if (distance(last, p) < MIN_MOVE_M) return 'skip';
  return last.tripId ? 'append' : 'start';
}

export function openTrips(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY, device TEXT NOT NULL, started INTEGER NOT NULL, ended INTEGER NOT NULL, metres REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS trip_points (trip INTEGER NOT NULL, ts INTEGER NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL);
    CREATE INDEX IF NOT EXISTS trips_device ON trips (device, started);
    CREATE INDEX IF NOT EXISTS trip_points_trip ON trip_points (trip, ts);
  `);
  const newTrip = db.prepare('INSERT INTO trips (device, started, ended, metres) VALUES (?, ?, ?, 0)');
  const addPoint = db.prepare('INSERT INTO trip_points VALUES (?, ?, ?, ?)');
  const extend = db.prepare('UPDATE trips SET ended = ?, metres = metres + ? WHERE id = ?');
  const last = new Map(); // device -> last stored (or anchor) point, { tripId, ts, lat, lon }

  return {
    // Feed every position of a device; stores points and starts/extends trips as described above.
    record(device, p) {
      const prev = last.get(device);
      const action = tripAction(prev, p);
      if (action === 'skip') return;
      if (action === 'anchor') return last.set(device, { ...p, tripId: null });
      let tripId = prev.tripId;
      if (action === 'start') {
        tripId = Number(newTrip.run(device, prev.ts, prev.ts).lastInsertRowid);
        addPoint.run(tripId, prev.ts, prev.lat, prev.lon);
      }
      addPoint.run(tripId, p.ts, p.lat, p.lon);
      extend.run(p.ts, distance(prev, p), tripId);
      last.set(device, { ...p, tripId });
    },

    // This device's trips, newest first.
    list(device) {
      return db
        .prepare('SELECT id, started, ended, round(metres) AS metres FROM trips WHERE device = ? ORDER BY started DESC')
        .all(device)
        .map((t) => ({ ...t }));
    },

    // The route of one trip as [lon, lat] pairs, or null if it isn't this device's trip.
    route(device, id) {
      if (!db.prepare('SELECT 1 FROM trips WHERE id = ? AND device = ?').get(id, device)) return null;
      return db
        .prepare('SELECT lon, lat FROM trip_points WHERE trip = ? ORDER BY ts')
        .all(id)
        .map((p) => [p.lon, p.lat]);
    },

    // Delete one of this device's trips. Returns false if it isn't theirs.
    remove(device, id) {
      const gone = db.prepare('DELETE FROM trips WHERE id = ? AND device = ?').run(id, device).changes > 0;
      if (gone) db.prepare('DELETE FROM trip_points WHERE trip = ?').run(id);
      if (gone && last.get(device)?.tripId === id) last.delete(device);
      return gone;
    },
  };
}
