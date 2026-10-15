-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('PLATFORM', 'AGENT_ORG', 'LENDER_ORG');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PLATFORM_ADMIN', 'PLATFORM_SUPPORT', 'AGENT_ADMIN', 'AGENT_MEMBER', 'LENDER_ADMIN', 'LENDER_MEMBER', 'COMPLIANCE_REVIEWER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "email_verified_at" TIMESTAMPTZ(3),
    "status" "AccountStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "organizations_type_created_at_idx" ON "organizations"("type", "created_at");

-- CreateIndex
CREATE INDEX "memberships_organization_id_created_at_idx" ON "memberships"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_organization_id_key" ON "memberships"("user_id", "organization_id");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
