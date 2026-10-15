import { Cart } from "./cart";
import { formatPrice } from "./format";

function PriceTag({ cents }: { cents: number }) {
  return <span>{formatPrice(cents)}</span>;
}

export function CartView({ cart, items }: { cart: Cart; items: number[] }) {
  function handleClick() {
    cart.add(100);
  }
  // <PriceTag> inside an anonymous .map() callback is attributed to CartView.
  return (
    <div onClick={handleClick}>
      {items.map((c) => (
        <PriceTag key={c} cents={c} />
      ))}
      <Summary cart={cart} />
    </div>
  );
}

const Summary = ({ cart }: { cart: Cart }) => <p>{cart.describe()}</p>;
