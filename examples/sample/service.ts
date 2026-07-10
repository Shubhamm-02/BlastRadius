import { login } from "./auth";
import { getUser } from "./users";
import { getOrders } from "./orders";

export function handleLogin(user: string, pw: string) {
  const session = login(user, pw);
  return getUser(session.user);
}

export function handleDashboard(userId: string) {
  const user = getUser(userId);
  const orders = getOrders(userId);
  return { user, orders };
}
