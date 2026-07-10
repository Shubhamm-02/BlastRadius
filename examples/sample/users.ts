import { query } from "./db";

export function getUser(id: string) {
  return query(`SELECT * FROM users WHERE id = '${id}'`);
}

export function listUsers() {
  return query("SELECT * FROM users");
}
