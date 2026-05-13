import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = process.env.SILVERMIND_DATA_DIR || join(__dirname, '..', '..', 'data');
const dbPath = join(dataDir, 'training-store.json');

const EMPTY_STORE = {
  memory_sessions: [],
  maze_sessions: [],
  step_sessions: [],
};

mkdirSync(dataDir, { recursive: true });

function loadStore() {
  try {
    return { ...EMPTY_STORE, ...JSON.parse(readFileSync(dbPath, 'utf8')) };
  } catch {
    return { ...EMPTY_STORE };
  }
}

function saveStore(store) {
  writeFileSync(dbPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function upsert(table, row) {
  const store = loadStore();
  const rows = store[table] ?? [];
  const filtered = rows.filter((item) => item.id !== row.id);
  store[table] = [{ ...row, created_at: new Date().toISOString() }, ...filtered].slice(0, 500);
  saveStore(store);
}

function list(table) {
  const store = loadStore();
  return [...(store[table] ?? [])]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 50);
}

function prepare(sql) {
  if (sql.includes('INSERT OR REPLACE INTO memory_sessions')) {
    return {
      run(id, date, rounds, totalCorrect, totalTime) {
        upsert('memory_sessions', {
          id,
          date,
          rounds,
          total_correct: totalCorrect,
          total_time: totalTime,
        });
      },
    };
  }

  if (sql.includes('INSERT OR REPLACE INTO maze_sessions')) {
    return {
      run(id, date, attempts, timeSpent, correct, pathStart, pathEnd) {
        upsert('maze_sessions', {
          id,
          date,
          attempts,
          time_spent: timeSpent,
          correct,
          path_start: pathStart,
          path_end: pathEnd,
        });
      },
    };
  }

  if (sql.includes('INSERT OR REPLACE INTO step_sessions')) {
    return {
      run(id, date, pathCells, accuracy, timeSpent, totalSteps, correctSteps) {
        upsert('step_sessions', {
          id,
          date,
          path_cells: pathCells,
          accuracy,
          time_spent: timeSpent,
          total_steps: totalSteps,
          correct_steps: correctSteps,
        });
      },
    };
  }

  if (sql.includes('FROM memory_sessions')) return { all: () => list('memory_sessions') };
  if (sql.includes('FROM maze_sessions')) return { all: () => list('maze_sessions') };
  if (sql.includes('FROM step_sessions')) return { all: () => list('step_sessions') };

  throw new Error(`Unsupported store statement: ${sql}`);
}

export default { prepare };
