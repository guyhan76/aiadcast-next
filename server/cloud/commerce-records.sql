CREATE TABLE IF NOT EXISTS commerce_orders (
 order_no text PRIMARY KEY, product text NOT NULL, ads integer NOT NULL CHECK (ads>0),
 purchased_at timestamptz NOT NULL, erase_at timestamptz NOT NULL,
 paid_nanos bigint CHECK (paid_nanos>=0), currency text, refunds jsonb, checked_at timestamptz,
 provider_event_at timestamptz, restored boolean NOT NULL DEFAULT false
);
ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS next_check_at timestamptz;
CREATE INDEX IF NOT EXISTS commerce_order_recheck ON commerce_orders(next_check_at) WHERE next_check_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS commerce_order_expiry ON commerce_orders(erase_at);
CREATE TABLE IF NOT EXISTS commerce_order_links (
 order_no text PRIMARY KEY REFERENCES commerce_orders ON DELETE CASCADE,
 purchase_key text UNIQUE NOT NULL, account_id text NOT NULL
);
CREATE INDEX IF NOT EXISTS commerce_order_account ON commerce_order_links(account_id);
CREATE TABLE IF NOT EXISTS commerce_deliveries (
 job_key text PRIMARY KEY, order_no text NOT NULL REFERENCES commerce_orders ON DELETE CASCADE,
 delivered_at timestamptz NOT NULL DEFAULT now(), credit_returned_at timestamptz
);
CREATE INDEX IF NOT EXISTS commerce_delivery_order ON commerce_deliveries(order_no);
CREATE TABLE IF NOT EXISTS commerce_withdrawals (
 case_id text PRIMARY KEY, order_no text NOT NULL REFERENCES commerce_orders ON DELETE CASCADE,
 requested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commerce_withdrawal_order ON commerce_withdrawals(order_no);
ALTER TABLE commerce_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE protected_complaints ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'defect';
ALTER TABLE protected_complaints ADD COLUMN IF NOT EXISTS order_no text;
ALTER TABLE protected_complaints ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
CREATE INDEX IF NOT EXISTS complaint_expiry ON protected_complaints(erase_at);
CREATE INDEX IF NOT EXISTS complaint_order ON protected_complaints(order_no);
CREATE TABLE IF NOT EXISTS complaint_member_links (
 case_id text PRIMARY KEY REFERENCES protected_complaints ON DELETE CASCADE, account_id text NOT NULL
);
CREATE INDEX IF NOT EXISTS complaint_member ON complaint_member_links(account_id);
ALTER TABLE commerce_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_order_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_member_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE protected_complaints ENABLE ROW LEVEL SECURITY;
