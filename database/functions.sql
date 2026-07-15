-- Run after schema.sql
-- Atomic stock decrement to avoid race conditions on concurrent checkouts.
create or replace function decrement_stock(p_product_id uuid, p_qty int)
returns void as $$
begin
  update public.products
  set stock = greatest(stock - p_qty, 0)
  where id = p_product_id;
end;
$$ language plpgsql;
