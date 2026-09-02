-- CreateEnum
CREATE TYPE "TaxCondition" AS ENUM ('MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO', 'EXENTO');

-- CreateEnum
CREATE TYPE "ReceiverTaxCondition" AS ENUM ('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'CONSUMIDOR_FINAL', 'EXENTO');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUING', 'ISSUED', 'FAILED', 'VOID');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('CUIT', 'CUIL', 'DNI', 'SIN_IDENTIFICAR');

-- CreateTable
CREATE TABLE "billing_profile" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "tax_id" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "tax_condition" "TaxCondition" NOT NULL,
    "sales_point" INTEGER NOT NULL,
    "gross_income_id" TEXT,
    "activity_started_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "sales_point" INTEGER NOT NULL,
    "number" INTEGER,
    "issued_on" DATE NOT NULL,
    "receiver_name" TEXT NOT NULL,
    "receiver_doc_kind" "DocumentKind" NOT NULL,
    "receiver_doc_number" TEXT NOT NULL,
    "receiver_tax_condition" "ReceiverTaxCondition" NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "vat_amount" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "cae" TEXT,
    "cae_expires_on" DATE,
    "pdf_url" TEXT,
    "provider_ref" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "patient_id" TEXT,
    "appointment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "issued_at" TIMESTAMP(3),

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_item" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "vat_amount" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "invoice_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_profile_organization_id_key" ON "billing_profile"("organization_id");

-- CreateIndex
CREATE INDEX "invoice_organization_id_status_issued_on_idx" ON "invoice"("organization_id", "status", "issued_on");

-- CreateIndex
CREATE INDEX "invoice_patient_id_idx" ON "invoice"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_organization_id_sales_point_type_number_key" ON "invoice"("organization_id", "sales_point", "type", "number");

-- CreateIndex
CREATE INDEX "invoice_item_invoice_id_idx" ON "invoice_item"("invoice_id");

-- AddForeignKey
ALTER TABLE "billing_profile" ADD CONSTRAINT "billing_profile_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_item" ADD CONSTRAINT "invoice_item_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
