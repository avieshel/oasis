/*
  Warnings:

  - Added the required column `token_hash` to the `sessions` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_idle_at" DATETIME NOT NULL,
    "expires_absolute_at" DATETIME NOT NULL,
    "rotated_from_id" TEXT
);
INSERT INTO "new_sessions" ("created_at", "expires_absolute_at", "expires_idle_at", "id", "last_seen_at", "rotated_from_id", "user_id") SELECT "created_at", "expires_absolute_at", "expires_idle_at", "id", "last_seen_at", "rotated_from_id", "user_id" FROM "sessions";
DROP TABLE "sessions";
ALTER TABLE "new_sessions" RENAME TO "sessions";
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
