-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_idle_at" DATETIME NOT NULL,
    "expires_absolute_at" DATETIME NOT NULL,
    "rotated_from_id" TEXT
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" DATETIME,
    "revoked_at" DATETIME
);

-- CreateTable
CREATE TABLE "jira_connections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "tickets_cache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "jira_site" TEXT NOT NULL,
    "project_key" TEXT NOT NULL,
    "issue_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "jira_created_at" DATETIME NOT NULL,
    "reconciled_at" DATETIME
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "jira_connections_user_id_key" ON "jira_connections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_cache_user_id_jira_site_project_key_issue_key_key" ON "tickets_cache"("user_id", "jira_site", "project_key", "issue_key");
