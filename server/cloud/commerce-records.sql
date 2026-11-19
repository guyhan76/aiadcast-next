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
ALTER TABLE commerce_withdrawals ADD COLUMN IF NOT EXISTS refund_method text;
ALTER TABLE commerce_withdrawals ADD COLUMN IF NOT EXISTS amount_krw bigint;
ALTER TABLE commerce_withdrawals ADD COLUMN IF NOT EXISTS processed_at timestamptz;
ALTER TABLE commerce_withdrawals ADD COLUMN IF NOT EXISTS recorded_at timestamptz;
ALTER TABLE commerce_withdrawals ADD COLUMN IF NOT EXISTS refund_reference text;
CREATE UNIQUE INDEX IF NOT EXISTS one_recorded_order_refund ON commerce_withdrawals(order_no,refund_method,refund_reference)
 WHERE refund_reference IS NOT NULL;
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

-- Public receipt numbers use the Seoul business date. Internal case IDs continue
-- to identify retries, original defect reports and previously issued references.
CREATE TABLE IF NOT EXISTS complaint_daily_numbers (
 business_day date PRIMARY KEY,
 last_number integer NOT NULL CHECK(last_number>0)
);
ALTER TABLE complaint_daily_numbers ENABLE ROW LEVEL SECURITY;
-- One transactional sequence covers service receipts issued on the same Seoul day.
CREATE OR REPLACE FUNCTION next_service_receipt(issued_at timestamptz, separator text) RETURNS text
LANGUAGE plpgsql SET search_path=pg_catalog,aiadcast_accounts AS $receipt$
DECLARE business_date date := (issued_at AT TIME ZONE 'Asia/Seoul')::date; ordinal integer;
BEGIN
 INSERT INTO complaint_daily_numbers(business_day,last_number) VALUES(business_date,1)
 ON CONFLICT(business_day) DO UPDATE SET last_number=complaint_daily_numbers.last_number+1
 RETURNING last_number INTO ordinal;
 RETURN to_char(business_date,'YYYYMMDD')||separator||lpad(ordinal::text,greatest(4,length(ordinal::text)),'0');
END $receipt$;
REVOKE ALL ON FUNCTION next_service_receipt(timestamptz,text) FROM PUBLIC;
ALTER TABLE protected_complaints ADD COLUMN IF NOT EXISTS receipt_no text;
CREATE OR REPLACE FUNCTION assign_complaint_number() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,aiadcast_accounts AS $number$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.receipt_no IS NOT NULL THEN NEW.receipt_no:=OLD.receipt_no; RETURN NEW; END IF;
 ELSE
  SELECT receipt_no INTO NEW.receipt_no FROM protected_complaints WHERE case_id=NEW.case_id;
  IF NEW.receipt_no IS NOT NULL THEN RETURN NEW; END IF;
 END IF;
 NEW.receipt_no:=next_service_receipt(NEW.received_at,'-');
 RETURN NEW;
END $number$;
REVOKE ALL ON FUNCTION assign_complaint_number() FROM PUBLIC;
CREATE OR REPLACE TRIGGER complaint_receipt_number BEFORE INSERT OR UPDATE OF receipt_no ON protected_complaints
 FOR EACH ROW EXECUTE FUNCTION assign_complaint_number();
DO $backfill$
DECLARE id text;
BEGIN
 FOR id IN SELECT case_id FROM protected_complaints WHERE receipt_no IS NULL ORDER BY received_at,case_id LOOP
  UPDATE protected_complaints SET receipt_no=NULL WHERE case_id=id AND receipt_no IS NULL;
 END LOOP;
END $backfill$;
ALTER TABLE protected_complaints ALTER COLUMN receipt_no SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS complaint_receipt_no ON protected_complaints(receipt_no);

ALTER TABLE protected_complaints ADD COLUMN IF NOT EXISTS requested_krw bigint;
ALTER TABLE protected_complaints ADD COLUMN IF NOT EXISTS payout_bank text;
ALTER TABLE protected_complaints ADD COLUMN IF NOT EXISTS payout_last4 text;
ALTER TABLE protected_complaints ADD COLUMN IF NOT EXISTS payout_secret text;
CREATE TABLE IF NOT EXISTS complaint_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 case_id text NOT NULL REFERENCES protected_complaints ON DELETE CASCADE,
 request_id text NOT NULL, kind text NOT NULL, happened_at timestamptz NOT NULL DEFAULT now(),
 actor_label text, detail text NOT NULL, outcome text, amount_krw bigint, reference text,
 UNIQUE(case_id,request_id)
);
ALTER TABLE complaint_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_events ADD COLUMN IF NOT EXISTS processed_at timestamptz;

ALTER TABLE protected_complaints ADD COLUMN IF NOT EXISTS refund_quote jsonb;
ALTER TABLE protected_complaints ADD COLUMN IF NOT EXISTS bank_requested boolean NOT NULL DEFAULT false;
-- A single balance request can cover purchases made at different prices.
DO $withdrawal_key$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='commerce_withdrawals'::regclass
    AND conname='commerce_withdrawals_pkey' AND array_length(conkey,1)=1) THEN
  ALTER TABLE commerce_withdrawals DROP CONSTRAINT commerce_withdrawals_pkey,
   ADD PRIMARY KEY(case_id,order_no);
 END IF;
END $withdrawal_key$;

ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS refund_policy text;
ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS refund_notice_received_at timestamptz;

ALTER TABLE complaint_events ADD COLUMN IF NOT EXISTS payout_bank text;
ALTER TABLE complaint_events ADD COLUMN IF NOT EXISTS payout_last4 text;
ALTER TABLE complaint_events ADD COLUMN IF NOT EXISTS payout_secret text;
CREATE UNIQUE INDEX IF NOT EXISTS one_transfer_account_supplement ON complaint_events(case_id) WHERE kind='transfer_account';
