-- CreateEnum
CREATE TYPE "BuyerStatus" AS ENUM ('FIRST_TIME_BUYER', 'REPEAT_BUYER', 'INVESTOR', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "QualificationType" AS ENUM ('CONTACT_FORMAT', 'EMAIL_VERIFICATION', 'PHONE_VERIFICATION');

-- CreateEnum
CREATE TYPE "QualificationStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "QualificationProvider" AS ENUM ('SYNTACTIC_VALIDATOR', 'MOCK_EMAIL_VERIFICATION', 'MOCK_PHONE_VERIFICATION');

-- CreateEnum
CREATE TYPE "LenderIntegrationMode" AS ENUM ('MOCK');

-- CreateEnum
CREATE TYPE "LenderStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RoutingStrategy" AS ENUM ('EXCLUSIVE');

-- CreateEnum
CREATE TYPE "RoutingPolicyStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RoutingAttemptStatus" AS ENUM ('PENDING', 'DISPATCHED', 'FAILED');

-- CreateEnum
CREATE TYPE "RoutingFailureReason" AS ENUM ('NO_ELIGIBLE_POLICY', 'CONSENT_NOT_GRANTED', 'LENDER_NOT_APPROVED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'REJECTED', 'RECONCILIATION_PENDING', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryRejectionReason" AS ENUM ('INVALID_CONTACT', 'OUTSIDE_TERRITORY', 'DUPLICATE_UNDER_CONTRACT', 'UNSUPPORTED_REQUEST', 'TECHNICAL_FAILURE');

-- CreateEnum
CREATE TYPE "BillingEventType" AS ENUM ('LEAD_DELIVERY_FEE');

-- CreateEnum
CREATE TYPE "BillingEntryStatus" AS ENUM ('POSTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadEventType" ADD VALUE 'QUALIFICATION_PASSED';
ALTER TYPE "LeadEventType" ADD VALUE 'QUALIFICATION_FAILED';
ALTER TYPE "LeadEventType" ADD VALUE 'ROUTING_STARTED';
ALTER TYPE "LeadEventType" ADD VALUE 'ROUTING_FAILED';
ALTER TYPE "LeadEventType" ADD VALUE 'DELIVERY_ATTEMPTED';
ALTER TYPE "LeadEventType" ADD VALUE 'DELIVERY_ACKNOWLEDGED';
ALTER TYPE "LeadEventType" ADD VALUE 'DELIVERY_REJECTED';
ALTER TYPE "LeadEventType" ADD VALUE 'DELIVERY_RECONCILIATION_PENDING';
ALTER TYPE "LeadEventType" ADD VALUE 'DELIVERY_RECONCILED';
ALTER TYPE "LeadEventType" ADD VALUE 'LENDER_ACKNOWLEDGED';
ALTER TYPE "LeadEventType" ADD VALUE 'BILLING_ENTRY_CREATED';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "purchase_intent_buyer_status" "BuyerStatus";

-- CreateTable
CREATE TABLE "qualification_records" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "type" "QualificationType" NOT NULL,
    "provider" "QualificationProvider" NOT NULL,
    "status" "QualificationStatus" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "result_summary" JSONB,
    "correlation_id" TEXT NOT NULL,

    CONSTRAINT "qualification_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lenders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "LenderStatus" NOT NULL DEFAULT 'ACTIVE',
    "integration_mode" "LenderIntegrationMode" NOT NULL DEFAULT 'MOCK',
    "contract_approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_policies" (
    "id" UUID NOT NULL,
    "lender_id" UUID NOT NULL,
    "strategy" "RoutingStrategy" NOT NULL DEFAULT 'EXCLUSIVE',
    "eligibility_conditions" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "RoutingPolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "active_from" TIMESTAMPTZ(3),
    "active_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "routing_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_attempts" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "routing_policy_id" UUID,
    "policy_version" INTEGER,
    "lender_id" UUID,
    "status" "RoutingAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "failure_reason" "RoutingFailureReason",
    "idempotency_key" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "routing_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_deliveries" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "lender_id" UUID NOT NULL,
    "routing_attempt_id" UUID NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "payload_version" INTEGER NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "attempted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMPTZ(3),
    "lender_acknowledged_at" TIMESTAMPTZ(3),
    "error_code" "DeliveryRejectionReason",
    "provider_correlation_id" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lead_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_entries" (
    "id" UUID NOT NULL,
    "lead_delivery_id" UUID NOT NULL,
    "event_type" "BillingEventType" NOT NULL DEFAULT 'LEAD_DELIVERY_FEE',
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "BillingEntryStatus" NOT NULL DEFAULT 'POSTED',
    "external_reference" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "qualification_records_lead_id_requested_at_idx" ON "qualification_records"("lead_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "lenders_organization_id_key" ON "lenders"("organization_id");

-- CreateIndex
CREATE INDEX "routing_policies_lender_id_status_idx" ON "routing_policies"("lender_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "routing_attempts_idempotency_key_key" ON "routing_attempts"("idempotency_key");

-- CreateIndex
CREATE INDEX "routing_attempts_lead_id_created_at_idx" ON "routing_attempts"("lead_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "lead_deliveries_routing_attempt_id_key" ON "lead_deliveries"("routing_attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_deliveries_idempotency_key_key" ON "lead_deliveries"("idempotency_key");

-- CreateIndex
CREATE INDEX "lead_deliveries_lender_id_created_at_idx" ON "lead_deliveries"("lender_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_deliveries_lead_id_created_at_idx" ON "lead_deliveries"("lead_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_entries_lead_delivery_id_key" ON "billing_entries"("lead_delivery_id");

-- AddForeignKey
ALTER TABLE "qualification_records" ADD CONSTRAINT "qualification_records_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lenders" ADD CONSTRAINT "lenders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_policies" ADD CONSTRAINT "routing_policies_lender_id_fkey" FOREIGN KEY ("lender_id") REFERENCES "lenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_attempts" ADD CONSTRAINT "routing_attempts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_attempts" ADD CONSTRAINT "routing_attempts_routing_policy_id_fkey" FOREIGN KEY ("routing_policy_id") REFERENCES "routing_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_attempts" ADD CONSTRAINT "routing_attempts_lender_id_fkey" FOREIGN KEY ("lender_id") REFERENCES "lenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_deliveries" ADD CONSTRAINT "lead_deliveries_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_deliveries" ADD CONSTRAINT "lead_deliveries_lender_id_fkey" FOREIGN KEY ("lender_id") REFERENCES "lenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_deliveries" ADD CONSTRAINT "lead_deliveries_routing_attempt_id_fkey" FOREIGN KEY ("routing_attempt_id") REFERENCES "routing_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_entries" ADD CONSTRAINT "billing_entries_lead_delivery_id_fkey" FOREIGN KEY ("lead_delivery_id") REFERENCES "lead_deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
