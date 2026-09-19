CREATE UNIQUE INDEX "one_active_reservation_per_customer" ON "gift_reservations" ("customerId") WHERE "status" = 'ACTIVE';
ALTER TABLE "gifts" ADD CONSTRAINT "gift_price_positive" CHECK ("priceBalls" > 0 AND "menuPriceSom" >= 0 AND ("realCostSom" IS NULL OR "realCostSom" >= 0) AND ("dailyLimit" IS NULL OR "dailyLimit" >= 0));
ALTER TABLE "gift_reservations" ADD CONSTRAINT "reservation_price_positive" CHECK ("priceBallsAtReserve" > 0);
CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'History is append-only; create a compensating entry'; END; $$;
CREATE TRIGGER ledger_append_only BEFORE UPDATE OR DELETE ON "ledger_entries" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
