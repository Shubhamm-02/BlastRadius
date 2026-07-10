export function connect() {
  return { ok: true };
}

export function query(sql: string): unknown[] {
  const conn = connect();
  return conn.ok ? [{ sql }] : [];
}
