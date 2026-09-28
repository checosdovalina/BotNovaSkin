import { createInterface } from "node:readline";
import { eq, inArray } from "drizzle-orm";
import { db, localSessionsTable, localUsersTable } from "@workspace/db";
import { hashPassword, isValidEmail, isValidPassword, newLocalUserId, normalizeEmail } from "../lib/local-auth";
import { hiddenPrompt } from "./hidden-prompt";

async function askEmail(): Promise<string> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return normalizeEmail(await new Promise<string>((resolve) => prompt.question("Correo del administrador o superadministrador: ", resolve)));
  } finally {
    prompt.close();
  }
}

try {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error("Ejecuta este comando desde una terminal interactiva de la VPS.");
  }

  const [anyUser] = await db.select({ id: localUsersTable.id }).from(localUsersTable).limit(1);
  const admins = await db.select({
    id: localUsersTable.id,
    email: localUsersTable.email,
    active: localUsersTable.active,
  }).from(localUsersTable).where(inArray(localUsersTable.role, ["admin", "superadmin"]));
  const activeAdmins = admins.filter((admin) => admin.active);

  if (anyUser && !activeAdmins.length) {
    throw new Error("Hay cuentas locales, pero ningún administrador o superadministrador activo. No se modificó ninguna cuenta.");
  }
  if (activeAdmins.length) {
    process.stdout.write(`Cuentas administrativas activas: ${activeAdmins.map((admin) => admin.email).join(", ")}\n`);
  } else {
    process.stdout.write("No hay cuentas locales; se creará el primer administrador.\n");
  }

  const email = await askEmail();
  if (!isValidEmail(email)) throw new Error("Introduce un correo válido.");
  const admin = activeAdmins.find((account) => account.email === email);
  if (anyUser && !admin) {
    throw new Error("Ese correo no corresponde a una cuenta administrativa activa. No se modificó ninguna cuenta.");
  }

  const password = await hiddenPrompt("Nueva contraseña (oculta, mínimo 12 caracteres): ");
  const confirmation = await hiddenPrompt("Repite la contraseña (oculta): ");
  if (!isValidPassword(password)) throw new Error("La contraseña debe tener al menos 12 caracteres.");
  if (password !== confirmation) throw new Error("Las contraseñas no coinciden.");
  const passwordHash = await hashPassword(password);

  if (admin) {
    await db.transaction(async (tx) => {
      const [current] = await tx.select({
        id: localUsersTable.id,
        email: localUsersTable.email,
        active: localUsersTable.active,
        role: localUsersTable.role,
      }).from(localUsersTable).where(eq(localUsersTable.id, admin.id)).for("update");
       if (!current || !current.active || !["admin", "superadmin"].includes(current.role) || current.email !== email) {
         throw new Error("La cuenta dejó de ser una cuenta administrativa activa. No se cambió la contraseña.");
      }
      await tx.update(localUsersTable).set({ passwordHash }).where(eq(localUsersTable.id, admin.id));
      await tx.delete(localSessionsTable).where(eq(localSessionsTable.userId, admin.id));
    });
    process.stdout.write(`Contraseña restablecida para ${email}. Las sesiones anteriores se cerraron.\n`);
  } else {
    await db.insert(localUsersTable).values({
      id: newLocalUserId(),
      email,
      passwordHash,
      role: "admin",
      active: true,
    });
    process.stdout.write(`Administrador inicial creado: ${email}.\n`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "No se pudo recuperar el acceso."}\n`);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}