import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

// Bundle the real delivery module, replacing only its external services. No DB,
// Clerk account, or Meta credentials are needed and no real messages can escape.
const modules = {
  "@workspace/db": `
    export const receptionPushKeysTable = "keys";
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
                ? globalThis.receptionTest.alerts : [];
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
    export const isNotNull = (field) => (row) => row[field] != null;
    export const and = (...predicates) => (row) => predicates.every((predicate) => predicate(row));
  `,
  "web-push": `export default {};`,
  "./logger": `export const logger = { warn() {} };`,
  "@clerk/express": `
    export const clerkClient = {
      users: { async getUser(id) {
        await globalThis.receptionTest.onGetUser?.();
        return globalThis.receptionTest.users[id];
      } }
    };
  `,
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
    users: {
      receptionist: {
        primaryEmailAddressId: "primary",
        emailAddresses: [{
          id: "primary", emailAddress: "reception@example.test",
          verification: { status: "verified" },
        }],
      },
    },
    whatsappConfigured: true,
    sent: [],
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

test("opt-out during authorization revokes a previously loaded recipient", async () => {
  const state = setup();
  state.alerts.push({ userId: "receptionist", phone: "5215550000000", verifiedAt: new Date() });
  state.onGetUser = () => { state.alerts.length = 0; };
  await notifyReceptionOfHandoff();
  assert.deepEqual(state.sent, []);
});

test("a recipient without a verified, allowed primary email receives nothing", async () => {
  const state = setup();
  state.alerts.push({ userId: "receptionist", phone: "5215550000000", verifiedAt: new Date() });
  state.users.receptionist.emailAddresses[0].verification.status = "unverified";
  await notifyReceptionOfHandoff();
  assert.deepEqual(state.sent, []);
  state.users.receptionist.emailAddresses[0].verification.status = "verified";
  state.users.receptionist.emailAddresses[0].emailAddress = "other@example.test";
  await notifyReceptionOfHandoff();
  assert.deepEqual(state.sent, []);
});

test("missing allowlist or WhatsApp configuration prevents delivery", async () => {
  const state = setup();
  state.alerts.push({ userId: "receptionist", phone: "5215550000000", verifiedAt: new Date() });
  delete process.env.RECEPTION_ALLOWED_EMAILS;
  await notifyReceptionOfHandoff();
  delete process.env.RECEPTION_WHATSAPP_TEMPLATE;
  await notifyReceptionOfHandoff();
  Object.assign(process.env, config);
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