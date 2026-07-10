import { query } from "./db";
import { getUser } from "./users";

export function getOrders(userId: string) {
  getUser(userId); // verify the user exists first
  return query(`SELECT * FROM orders WHERE user_id = '${userId}'`);
}
