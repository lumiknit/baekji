import { openDB, deleteDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { ProjectMeta } from './v1';

const DB_NAME = 'baekji-meta-v2';
const DB_VERSION = 1;

const PROJECTS = 'projects';
const APP_STATE = 'appState';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore(PROJECTS, { keyPath: 'id' });
        db.createObjectStore(APP_STATE, {
          keyPath: ['scope', 'scopeId', 'key'],
        });
      },
      terminated() {
        dbPromise = null;
      },
    }).then((db) => {
      db.onclose = () => {
        dbPromise = null;
      };
      return db;
    });
  }
  return dbPromise;
}

// ─── Projects ─────────────────────────────────────────────────

export async function getAllProjects(): Promise<ProjectMeta[]> {
  const db = await getDB();
  return db.getAll(PROJECTS);
}

export async function getProject(id: string): Promise<ProjectMeta | undefined> {
  const db = await getDB();
  return db.get(PROJECTS, id);
}

export async function putProject(meta: ProjectMeta): Promise<void> {
  const db = await getDB();
  await db.put(PROJECTS, meta);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(PROJECTS, id);
}

// ─── Full Reset ───────────────────────────────────────────────

export async function fullResetMeta(): Promise<void> {
  try {
    const db = await getDB();
    db.close();
    dbPromise = null;
    await deleteDB(DB_NAME);
  } catch {
    /* ignore */
  }
}
