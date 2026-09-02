-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'SOLO', 'CLINIC');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TemplateKind" AS ENUM ('REMINDER', 'CONFIRMATION');

-- CreateEnum
CREATE TYPE "ActionKind" AS ENUM ('CONFIRM', 'CANCEL');

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "max_users" INTEGER NOT NULL DEFAULT 1,
    "onboarding_completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "full_name" TEXT NOT NULL,
    "specialty" TEXT,
    "default_duration_min" INTEGER NOT NULL DEFAULT 30,
    "color" TEXT NOT NULL DEFAULT '#1F6E4E',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "whatsapp_opt_in" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 30,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_template" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TemplateKind" NOT NULL DEFAULT 'REMINDER',
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_rule" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "professional_id" TEXT,
    "template_id" TEXT NOT NULL,
    "hours_before" INTEGER NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'WHATSAPP',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'WHATSAPP',
    "scheduled_for" TIMESTAMPTZ(3) NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "to_phone" TEXT NOT NULL,
    "rendered_body" TEXT,
    "provider_message_id" TEXT,
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_action_token" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "action" "ActionKind" NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_action_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_organization_id_idx" ON "user"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "professional_user_id_key" ON "professional"("user_id");

-- CreateIndex
CREATE INDEX "professional_organization_id_active_idx" ON "professional"("organization_id", "active");

-- CreateIndex
CREATE INDEX "patient_organization_id_full_name_idx" ON "patient"("organization_id", "full_name");

-- CreateIndex
CREATE UNIQUE INDEX "patient_organization_id_phone_e164_key" ON "patient"("organization_id", "phone_e164");

-- CreateIndex
CREATE INDEX "appointment_professional_id_starts_at_idx" ON "appointment"("professional_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointment_organization_id_starts_at_idx" ON "appointment"("organization_id", "starts_at");

-- CreateIndex
CREATE INDEX "message_template_organization_id_kind_idx" ON "message_template"("organization_id", "kind");

-- CreateIndex
CREATE INDEX "reminder_rule_organization_id_enabled_idx" ON "reminder_rule"("organization_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_rule_organization_id_professional_id_hours_before_key" ON "reminder_rule"("organization_id", "professional_id", "hours_before");

-- CreateIndex
CREATE INDEX "notification_status_scheduled_for_idx" ON "notification"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "notification_organization_id_created_at_idx" ON "notification"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_appointment_id_rule_id_key" ON "notification"("appointment_id", "rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_action_token_token_key" ON "appointment_action_token"("token");

-- CreateIndex
CREATE INDEX "appointment_action_token_appointment_id_idx" ON "appointment_action_token"("appointment_id");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional" ADD CONSTRAINT "professional_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional" ADD CONSTRAINT "professional_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient" ADD CONSTRAINT "patient_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_template" ADD CONSTRAINT "message_template_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_rule" ADD CONSTRAINT "reminder_rule_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_rule" ADD CONSTRAINT "reminder_rule_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_rule" ADD CONSTRAINT "reminder_rule_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "reminder_rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_action_token" ADD CONSTRAINT "appointment_action_token_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
