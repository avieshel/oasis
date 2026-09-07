/*
  Warnings:

  - You are about to drop the column `user_id` on the `api_keys` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_api_keys" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "allowed_project_keys" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" DATETIME,
    "revoked_at" DATETIME
);
INSERT INTO "new_api_keys" ("created_at", "id", "key_hash", "last_used_at", "name", "revoked_at", "tenant_id") SELECT "created_at", "id", "key_hash", "last_used_at", "name", "revoked_at", "tenant_id" FROM "api_keys";
DROP TABLE "api_keys";
ALTER TABLE "new_api_keys" RENAME TO "api_keys";
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE TABLE "new_jira_connections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "api_key_id" TEXT,
    "mode" TEXT NOT NULL,
    "cloud_id" TEXT,
    "site_url" TEXT,
    "email" TEXT,
    "api_token_cipher" TEXT,
    "api_token_nonce" TEXT,
    "access_token_cipher" TEXT,
    "access_token_nonce" TEXT,
    "refresh_token_cipher" TEXT,
    "refresh_token_nonce" TEXT,
    "oauth_expires_at" DATETIME,
    "oauth_scopes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_jira_connections" ("access_token_cipher", "access_token_nonce", "api_token_cipher", "api_token_nonce", "cloud_id", "created_at", "email", "id", "mode", "oauth_expires_at", "oauth_scopes", "refresh_token_cipher", "refresh_token_nonce", "site_url", "tenant_id", "updated_at", "user_id") SELECT "access_token_cipher", "access_token_nonce", "api_token_cipher", "api_token_nonce", "cloud_id", "created_at", "email", "id", "mode", "oauth_expires_at", "oauth_scopes", "refresh_token_cipher", "refresh_token_nonce", "site_url", "tenant_id", "updated_at", "user_id" FROM "jira_connections";
DROP TABLE "jira_connections";
ALTER TABLE "new_jira_connections" RENAME TO "jira_connections";
CREATE UNIQUE INDEX "jira_connections_user_id_key" ON "jira_connections"("user_id");
CREATE UNIQUE INDEX "jira_connections_api_key_id_key" ON "jira_connections"("api_key_id");
CREATE TABLE "new_tickets_cache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "api_key_id" TEXT,
    "jira_site" TEXT NOT NULL,
    "project_key" TEXT NOT NULL,
    "issue_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "jira_created_at" DATETIME NOT NULL,
    "reconciled_at" DATETIME
);
INSERT INTO "new_tickets_cache" ("id", "issue_key", "jira_created_at", "jira_site", "project_key", "reconciled_at", "tenant_id", "title", "url", "user_id") SELECT "id", "issue_key", "jira_created_at", "jira_site", "project_key", "reconciled_at", "tenant_id", "title", "url", "user_id" FROM "tickets_cache";
DROP TABLE "tickets_cache";
ALTER TABLE "new_tickets_cache" RENAME TO "tickets_cache";
CREATE UNIQUE INDEX "tickets_cache_user_id_jira_site_project_key_issue_key_key" ON "tickets_cache"("user_id", "jira_site", "project_key", "issue_key");
CREATE UNIQUE INDEX "tickets_cache_api_key_id_jira_site_project_key_issue_key_key" ON "tickets_cache"("api_key_id", "jira_site", "project_key", "issue_key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
