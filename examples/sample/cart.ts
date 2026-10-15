import { query } from "./db";
import { formatPrice } from "./format";

export class Cart {
  private items: number[] = [];
  private discountPct = 0;

  constructor(readonly userId: string) {
    query(`SELECT * FROM carts WHERE user_id = '${userId}'`);
  }

  get total(): number {
    const sum = this.items.reduce((a, b) => a + b, 0);
    return Math.round(sum * (1 - this.discountPct / 100));
  }

  set discount(pct: number) {
    this.discountPct = clampPct(pct);
  }

  add(cents: number): void {
    this.items.push(cents);
  }

  // Class property arrow function.
  describe = (): string => formatPrice(this.total);

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  // Same name as the instance method above: both get a `@line` suffix.
  static isEmpty(cart: Cart): boolean {
    return cart.isEmpty();
  }

  static forUser(userId: string): Cart {
    return new Cart(userId);
  }
}

// Calls super() explicitly.
export class GiftCart extends Cart {
  constructor(userId: string, readonly note: string) {
    super(userId);
  }
}

// No constructor of its own: `new PromoCart()` runs Cart's constructor.
export class PromoCart extends Cart {}

export function giftFor(userId: string): Cart {
  return userId.startsWith("promo")
    ? new PromoCart(userId)
    : new GiftCart(userId, "enjoy");
}

function clampPct(pct: number): number {
  return Math.min(100, Math.max(0, pct));
}

// Writing a setter / reading a getter invokes them.
export function applyCoupon(cart: Cart, pct: number): number {
  cart.discount = pct;
  return cart.total;
}
