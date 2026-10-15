import { Cart } from "./cart";
import { checkout } from "./checkout";

// Arrow, function expression and method shorthand on object-literal properties.
export const cartHandlers = {
  add: (userId: string, cents: number) => {
    const cart = Cart.forUser(userId);
    cart.add(cents);
    return cart;
  },
  checkout: function (user: string, pw: string) {
    return checkout(user, pw);
  },
  nested: {
    clear(userId: string) {
      return Cart.forUser(userId);
    },
  },
};

// Anonymous default export function → "default".
export default function (userId: string) {
  return cartHandlers.add(userId, 0);
}
