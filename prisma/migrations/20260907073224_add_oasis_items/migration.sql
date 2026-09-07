-- CreateTable
CREATE TABLE "oasis_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "scanner" TEXT NOT NULL DEFAULT 'oasis-scanner',
    "item_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'new',
    "jira_key" TEXT,
    "jira_url" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "oasis_items_tenant_id_status_idx" ON "oasis_items"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "oasis_items_tenant_id_severity_idx" ON "oasis_items"("tenant_id", "severity");
