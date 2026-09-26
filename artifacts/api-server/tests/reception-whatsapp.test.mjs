import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

// Bundle the real delivery module, replacing only its external services. No DB
// credentials are needed and no real messages can escape.
const modules = {
  "@workspace/db": `
    export const localUsersTable = { id: "id", email: "email", active: "active" };
    export const receptionPushKeysTable = { id: "id" };
    export const receptionPushSubscriptionsTable = "push";
    export const receptionWhatsappAlertsTable = {
      userId: "userId", phone: "phone", verifiedAt: "verifiedAt"
    };
    export const db = {
      select() {
        return {
          from(table) {
            const rows = () => table === receptionPushSubscriptionsTable
              ? globalThis.receptionTest.subscriptions
              : table === receptionWhatsappAlertsTable
                ? globalThis.receptionTest.alerts
                : table === receptionPushKeysTable ? globalThis.receptionTest.pushKeys
                : table === localUsersTable ? globalThis.receptionTest.localUsers : [];
            return {
              then(resolve, reject) { return Promise.resolve([...rows()]).then(resolve, reject); },
              where(predicate) {
                return Promise.resolve(rows().filter(predicate).map((row) => ({ ...row })));
              }
            };
          }
        };
      }
    };
  `,
  "drizzle-orm": `
    export const eq = (field, value) => (row) => row[field] === value;
    export const inArray = (field, values) => (row) => values.includes(row[field]);
    export const isNotNull = (field) => (row) => row[field] != null;
    export const and = (...predicates) => (row) => predicates.every((predicate) => predicate(row));
  `,
  "web-push": `
    export default {
      setVapidDetails() {},
      async sendNotification(subscription) {
        globalThis.receptionTest.pushes.push(subscription);
      }
    };
  `,
  "./logger": `export const logger = { warn(...args) { globalThis.receptionTest.errors.push(args); } };`,
  "./whatsapp": `
    export const whatsappConfigured = () => globalThis.receptionTest.whatsappConfigured;
    export const sendWhatsAppTemplate = async (...args) => {
      globalThis.receptionTest.sent.push(args);
    };
  `,
};

const config = {
  WHATSAPP_ACCESS_TOKEN: "unused-test-value",
  RECEPTION_WHATSAPP_TEMPLATE: "generic_reception_notice",
  RECEPTION_WHATSAPP_VERIFY_TEMPLATE: "verify_number",
  SESSION_SECRET: "unused-test-value",
  RECEPTION_INBOX_URL: "https://example.test/conversations",
  RECEPTION_ALLOWED_EMAILS: "reception@example.test",
};
const previous = Object.fromEntries(Object.keys(config).map((key) => [key, process.env[key]]));
let directory;
let notifyReceptionOfHandoff;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "reception-whatsapp-"));
  const outfile = join(directory, "delivery.mjs");
  await build({
    entryPoints: [fileURLToPath(new URL("../src/lib/reception-push.ts", import.meta.url))],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    plugins: [{
      name: "fake-external-services",
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          if (Object.hasOwn(modules, args.path)) return { path: args.path, namespace: "fake" };
        });
        build.onLoad({ filter: /.*/, namespace: "fake" }, (args) => ({
          contents: modules[args.path], loader: "js",
        }));
      },
    }],
  });
  ({ notifyReceptionOfHandoff } = await import(pathToFileURL(outfile).href));
});

after(async () => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete globalThis.receptionTest;
  if (directory) await rm(directory, { recursive: true, force: true });
});

function setup() {
  Object.assign(process.env, config);
  globalThis.receptionTest = {
    alerts: [],
    subscriptions: [],
    localUsers: [{ id: "receptionist", email: "reception@example.test", active: true }],
    whatsappConfigured: true,
    sent: [],
    pushes: [],
    pushKeys: [{ id: "reception", publicKey: "public", privateKey: "private" }],
    errors: [],
  };
  return globalThis.receptionTest;
}

test("verified opt-in sends only the generic template with the protected inbox URL", async () => {
  const state = setup();
  state.alerts.push({ userId: "receptionist", phone: "5215550000000", verifiedAt: new Date() });
  await notifyReceptionOfHandoff();
  assert.deepEqual(state.sent, [[
    "5215550000000", "generic_reception_notice", "es_MX",
    ["https://example.test/conversations"],
  ]]);
});

test("pending registration and opt-out do not send an alert", async () => {
  const state = setup();
  state.alerts.push({ userId: "receptionist", phone: "5215550000000", verifiedAt: null });
  await notifyReceptionOfHandoff();
  assert.deepEqual(state.sent, []);
  state.alerts[0].verifiedAt = new Date();
  await notifyReceptionOfHandoff();
  assert.equal(state.sent.length, 1);
  state.alerts.length = 0; // DELETE /bot/alternate-alert removes this row.
  await notifyReceptionOfHandoff();
  assert.equal(state.sent.length, 1);
});

test("an account deactivated after authorization revokes a previously loaded recipient", async () => {
  const state = setup();
  state.alerts.push({ userId: "receptionist", phone: "5215550000000", verifiedAt: new Date() });
  state.localUsers[0].active = false;
  await notifyReceptionOfHandoff();
  assert.deepEqual(state.sent, []);
});

test("active local staff receive notices without an email allowlist; Clerk IDs never do", async () => {
  const state = setup();
  state.localUsers[0] = { id: "staff-account", email: "staff@example.test", active: true };
  state.subscriptions.push({
    userId: "staff-account", endpoint: "https://push.example.test",
    p256dh: "key", auth: "auth",
  });
  state.subscriptions.push({
    userId: "user_legacy_clerk_id", endpoint: "https://push.example.test",
    p256dh: "key", auth: "auth",
  });
  await notifyReceptionOfHandoff();
  assert.deepEqual(state.errors, []);
  assert.equal(state.pushes.length, 1);
  assert.equal(state.pushes[0].endpoint, "https://push.example.test");
});

test("inactive local accounts do not receive push or WhatsApp notices", async () => {
  const state = setup();
  state.localUsers[0].active = false;
  state.alerts.push({ userId: "receptionist", phone: "5215550000000", verifiedAt: new Date() });
  state.subscriptions.push({
    userId: "receptionist", endpoint: "https://push.example.test",
    p256dh: "key", auth: "auth",
  });
  await notifyReceptionOfHandoff();
  assert.deepEqual(state.sent, []);
  assert.deepEqual(state.pushes, []);
});

test("WhatsApp configuration requirements still suppress alternate notices", async () => {
  const state = setup();
  state.alerts.push({ userId: "receptionist", phone: "5215550000000", verifiedAt: new Date() });
  delete process.env.RECEPTION_WHATSAPP_TEMPLATE;
  await notifyReceptionOfHandoff();
  state.whatsappConfigured = false;
  await notifyReceptionOfHandoff();
  assert.deepEqual(state.sent, []);
});

test("an invalid or unprotected inbox URL prevents delivery", async () => {
  const state = setup();
  state.alerts.push({ userId: "receptionist", phone: "5215550000000", verifiedAt: new Date() });
  process.env.RECEPTION_INBOX_URL = "https://example.test/conversations?client=private";
  await notifyReceptionOfHandoff();
  assert.deepEqual(state.sent, []);
});