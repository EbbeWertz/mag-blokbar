import { db } from './config.js';

export async function dbGet(table) {
  if (!db) return [];
  const { data, error } = await db.from(table).select('*');
  if (error) console.error(`Error fetching ${table}:`, error);
  return data || [];
}

export async function dbUpsert(table, row) {
  if (!db) return;
  const { error } = await db.from(table).upsert(row);
  if (error) console.error(`Error upserting to ${table}:`, error);
}

export async function dbDel(table, id) {
  if (!db) return;
  const { error } = await db.from(table).delete().eq('id', id);
  if (error) console.error(`Error deleting from ${table}:`, error);
}

export function sub(table, fn) {
  if (!db) return;
  return db.channel('rt_' + table)
    .on('postgres_changes', { event: '*', schema: 'public', table }, fn)
    .subscribe();
}