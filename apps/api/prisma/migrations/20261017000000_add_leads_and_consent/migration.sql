-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'NEEDS_REVIEW', 'ELIGIBLE', 'ROUTING', 'DELIVERED', 'ACCEPTED', 'REJECTED', 'SUPPRESSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('SAVE_RESULTS', 'RATE_ALERTS', 'LENDER_CONTACT');

-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('ACCOUNT', 'EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "DisclosureReviewStatus" AS ENUM ('PENDING_COUNSEL_REVIEW', 'APPROVED');

-- CreateEnum
CREATE TYPE "LeadRelationshipType" AS ENUM ('SOURCE_ORGANIZATION');

-- CreateEnum
CREATE TYPE "LeadEventType" AS ENUM ('LEAD_CREATED', 'LEAD_MATCHED_EXISTING', 'CONSENT_RECORDED', 'CONSENT_REVOKED', 'SUPPRESSION_BLOCKED', 'STATUS_CHANGED');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('USER_REQUESTED', 'COMPLAINT', 'BOUNCE', 'LEGAL_HOLD', 'SEED_PLACEHOLDER');

-- CreateTable
CREATE TABLE "disclosure_versions" (
    "id" UUID NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "review_status" "DisclosureReviewStatus" NOT NULL DEFAULT 'PENDING_COUNSEL_REVIEW',
    "published_at" TIMESTAMPTZ(3),
    "retired_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disclosure_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "email_match_token" TEXT,
    "phone_match_token" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "source_widget_id" UUID NOT NULL,
    "source_organization_id" UUID NOT NULL,
    "purchase_intent_timeline" TEXT,
    "purchase_intent_state" TEXT,
    "purchase_intent_zip" TEXT,
    "purchase_intent_price_min" INTEGER,
    "purchase_intent_price_max" INTEGER,
    "retention_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_relationships" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "relationship_type" "LeadRelationshipType" NOT NULL DEFAULT 'SOURCE_ORGANIZATION',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "disclosure_version_id" UUID NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "recipient_scope" TEXT,
    "user_action" TEXT NOT NULL DEFAULT 'GRANTED',
    "captured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_widget_id" UUID NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "evidence_metadata" JSONB,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" TEXT,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_events" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "event_type" "LeadEventType" NOT NULL,
    "actor_type" TEXT NOT NULL DEFAULT 'SYSTEM',
    "correlation_id" TEXT NOT NULL,
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression_records" (
    "id" UUID NOT NULL,
    "match_token" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppression_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_idempotency_keys" (
    "id" UUID NOT NULL,
    "widget_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "lead_id" UUID,
    "response_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "disclosure_versions_purpose_locale_published_at_retired_at_idx" ON "disclosure_versions"("purpose", "locale", "published_at", "retired_at");

-- CreateIndex
CREATE UNIQUE INDEX "disclosure_versions_purpose_locale_version_key" ON "disclosure_versions"("purpose", "locale", "version");

-- CreateIndex
CREATE INDEX "leads_status_created_at_idx" ON "leads"("status", "created_at");

-- CreateIndex
CREATE INDEX "leads_email_match_token_idx" ON "leads"("email_match_token");

-- CreateIndex
CREATE INDEX "leads_phone_match_token_idx" ON "leads"("phone_match_token");

-- CreateIndex
CREATE INDEX "leads_source_organization_id_created_at_idx" ON "leads"("source_organization_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_relationships_organization_id_created_at_idx" ON "lead_relationships"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "lead_relationships_lead_id_organization_id_relationship_typ_key" ON "lead_relationships"("lead_id", "organization_id", "relationship_type");

-- CreateIndex
CREATE INDEX "consent_records_lead_id_captured_at_idx" ON "consent_records"("lead_id", "captured_at");

-- CreateIndex
CREATE INDEX "consent_records_purpose_channel_idx" ON "consent_records"("purpose", "channel");

-- CreateIndex
CREATE INDEX "lead_events_lead_id_occurred_at_idx" ON "lead_events"("lead_id", "occurred_at");

-- CreateIndex
CREATE INDEX "suppression_records_match_token_purpose_channel_idx" ON "suppression_records"("match_token", "purpose", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "lead_idempotency_keys_widget_id_idempotency_key_key" ON "lead_idempotency_keys"("widget_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_widget_id_fkey" FOREIGN KEY ("source_widget_id") REFERENCES "widgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_organization_id_fkey" FOREIGN KEY ("source_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_relationships" ADD CONSTRAINT "lead_relationships_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_relationships" ADD CONSTRAINT "lead_relationships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_disclosure_version_id_fkey" FOREIGN KEY ("disclosure_version_id") REFERENCES "disclosure_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_source_widget_id_fkey" FOREIGN KEY ("source_widget_id") REFERENCES "widgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_idempotency_keys" ADD CONSTRAINT "lead_idempotency_keys_widget_id_fkey" FOREIGN KEY ("widget_id") REFERENCES "widgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_idempotency_keys" ADD CONSTRAINT "lead_idempotency_keys_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

