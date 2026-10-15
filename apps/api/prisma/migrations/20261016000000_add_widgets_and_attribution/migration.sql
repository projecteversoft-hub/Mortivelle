-- CreateEnum
CREATE TYPE "WidgetStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "CalculatorType" AS ENUM ('AFFORDABILITY', 'PROPERTY_COST', 'RENT_VS_BUY');

-- CreateEnum
CREATE TYPE "AttributionEventType" AS ENUM ('WIDGET_VIEWED', 'CALCULATOR_COMPLETED');

-- CreateTable
CREATE TABLE "widgets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "public_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "theme_primary_color" TEXT NOT NULL,
    "theme_logo_url" TEXT,
    "allowed_origins" TEXT[],
    "enabled_calculators" "CalculatorType"[],
    "status" "WidgetStatus" NOT NULL DEFAULT 'ACTIVE',
    "config_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "widgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribution_events" (
    "id" UUID NOT NULL,
    "widget_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "event_type" "AttributionEventType" NOT NULL,
    "campaign" TEXT,
    "source" TEXT,
    "landing_path" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attribution_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "widgets_public_key_key" ON "widgets"("public_key");

-- CreateIndex
CREATE INDEX "widgets_organization_id_created_at_idx" ON "widgets"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "attribution_events_organization_id_occurred_at_idx" ON "attribution_events"("organization_id", "occurred_at");

-- CreateIndex
CREATE INDEX "attribution_events_widget_id_occurred_at_idx" ON "attribution_events"("widget_id", "occurred_at");

-- CreateIndex
CREATE INDEX "attribution_events_event_type_occurred_at_idx" ON "attribution_events"("event_type", "occurred_at");

-- AddForeignKey
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribution_events" ADD CONSTRAINT "attribution_events_widget_id_fkey" FOREIGN KEY ("widget_id") REFERENCES "widgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribution_events" ADD CONSTRAINT "attribution_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
