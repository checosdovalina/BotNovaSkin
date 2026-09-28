import { and, eq } from "drizzle-orm";
import { db, localSessionsTable, localUsersTable } from "@workspace/db";
import { normalizeEmail } from "../lib/local-auth";

try {
  const emailArg = process.argv[2];
  if (!emailArg || process.argv.length !== 3) {
    throw new Error("Usage: pnpm --filter @workspace/api-server run promote-superadmin -- admin@example.com");
  }
  const email = normalizeEmail(emailArg);
  const promoted = await db.transaction(async (tx) => {
    // Lock existing account rows so concurrent bootstrap invocations cannot both promote.
    await tx.select({ id: localUsersTable.id }).from(localUsersTable).for("update");
    const existing = await tx.select({ id: localUsersTable.id })
      .from(localUsersTable).where(eq(localUsersTable.role, "superadmin")).limit(1);
    if (existing.length > 0) throw new Error("Promotion is allowed only when no superadmin exists.");

    const [admin] = await tx.select({
      id: localUsersTable.id,
      email: localUsersTable.email,
    }).from(localUsersTable).where(and(
      eq(localUsersTable.email, email),
      eq(localUsersTable.role, "admin"),
      eq(localUsersTable.active, true),
    )).limit(1);
    if (!admin) throw new Error("The specified account must be an existing active admin.");

    const [updated] = await tx.update(localUsersTable).set({ role: "superadmin" })
      .where(and(
        eq(localUsersTable.id, admin.id),
        eq(localUsersTable.role, "admin"),
        eq(localUsersTable.active, true),
      )).returning({ id: localUsersTable.id });
    if (!updated) throw new Error("The specified account changed before it could be promoted.");
    await tx.delete(localSessionsTable).where(eq(localSessionsTable.userId, admin.id));
    return admin.email;
  });
  process.stdout.write(`Promoted ${promoted} to superadmin.\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Superadmin promotion failed"}\n`);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}