CREATE TABLE "invoicing_connection" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "encrypted_api_key" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'homologacion',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoicing_connection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoicing_connection_organization_id_key"
    ON "invoicing_connection"("organization_id");

ALTER TABLE "invoicing_connection"
    ADD CONSTRAINT "invoicing_connection_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
