import openCart, { cartHandlers } from "./handlers";

const queue: Array<(userId: string) => unknown> = [];

// Anonymous default-exported arrow → "default". Functions passed by
// reference are "ref" edges.
export default (userId: string) => {
  [userId].forEach(openCart);
  queue.push(cartHandlers.nested.clear);
};
