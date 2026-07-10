import { login } from "./auth";
import { getOrders } from "./orders";

export function checkout(user: string, pw: string) {
  login(user, pw);
  return getOrders(user);
}
