-- Delivery is a different fact from "the provider accepted the request".
-- Folding the two together would make a message that never arrived look
-- identical to one that did.
CREATE TYPE "DeliveryStatus" AS ENUM ('UNKNOWN', 'DELIVERED', 'READ', 'UNDELIVERED');

ALTER TABLE "notification"
  ADD COLUMN "delivery_status" "DeliveryStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "delivered_at" TIMESTAMPTZ(3),
  ADD COLUMN "delivery_error" TEXT;

-- The webhook resolves a delivery by the id the provider handed us. Making it
-- unique both indexes that lookup and guarantees the match is unambiguous: a
-- provider message id names exactly one message, so the database refuses to
-- create a duplicate rather than trusting the send path not to write one.
CREATE UNIQUE INDEX "notification_provider_message_id_key" ON "notification"("provider_message_id");