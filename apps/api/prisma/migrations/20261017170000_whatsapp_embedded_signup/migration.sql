CREATE TABLE "whatsapp_connection" (
    "organization_id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "encrypted_access_token" TEXT,
    "waba_id" TEXT,
    "phone_number_id" TEXT,
    "display_phone_number" TEXT,
    "signup_state_hash" TEXT UNIQUE,
    "signup_expires_at" TIMESTAMPTZ(3),
    "signup_consumed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "whatsapp_connection_status_check" CHECK (
        ("status" = 'DISCONNECTED' AND "encrypted_access_token" IS NULL)
        OR ("status" = 'CONNECTED' AND "encrypted_access_token" IS NOT NULL
            AND "waba_id" IS NOT NULL AND "phone_number_id" IS NOT NULL)
    ),
    CONSTRAINT "whatsapp_connection_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organization"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);
