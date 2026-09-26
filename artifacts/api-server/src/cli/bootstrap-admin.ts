import { createInterface } from "node:readline";
import { db, localUsersTable } from "@workspace/db";
import { hashPassword, isValidEmail, isValidPassword, newLocalUserId, normalizeEmail } from "../lib/local-auth";
import { hiddenPrompt } from "./hidden-prompt";

try {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error("Bootstrap must run in an interactive terminal.");
  }
  const existing = await db.select({ id: localUsersTable.id }).from(localUsersTable).limit(1);
  if (existing.length) {
    throw new Error("Bootstrap is only allowed before any local account has been created.");
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const emailInput = await new Promise<string>((resolve) => prompt.question("Administrator email: ", resolve));
  const email = normalizeEmail(emailInput.trim());
  prompt.close();
  if (!isValidEmail(email)) throw new Error("Enter a valid email address.");
  const password = await hiddenPrompt("Administrator password (hidden, minimum 12 characters): ");
  const confirmation = await hiddenPrompt("Confirm password (hidden): ");
  if (!isValidPassword(password)) throw new Error("Password must contain at least 12 characters.");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  await db.insert(localUsersTable).values({
    id: newLocalUserId(),
    email,
    passwordHash: await hashPassword(password),
    role: "admin",
    active: true,
  });
  process.stdout.write(`Administrator account created for ${email}.\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Bootstrap failed"}\n`);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}