import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const modules = {
  "drizzle-orm": `
    export const eq = (key, value) => (row) => row[key] === value;
    export const ne = (key, value) => (row) => row[key] !== value;
    export const lte = (key, value) => (row) => row[key] <= value;
    export const and = (...conditions) => (row) => conditions.every((condition) => condition(row));
    export const asc = () => {}; export const desc = () => {};
    export const gte = () => {}; export const inArray = () => {};
    export const sql = () => {};
  `,
  "@workspace/db": `
    export const conversationsTable = { id: "id", phone: "phone", status: "status", lastMessageAt: "lastMessageAt" };
    export const conversationMessagesTable = { id: "id", providerMessageId: "providerMessageId" };
    export const appointmentsTable = {}; export const faqsTable = {};
    export const servicesTable = { id: "id", active: "active", category: "category", name: "name" };
    export const db = {
      select() {
        return {
          from(table) {
            return {
              where(condition) {
                if (table === servicesTable) {
                  return {
                    orderBy() {
                      return Promise.resolve(globalThis.handoffTest.services.filter(condition).map((row) => ({ ...row })));
                    }
                  };
                }
                return Promise.resolve(
                  (table === conversationsTable
                    ? [globalThis.handoffTest.conversation]
                    : globalThis.handoffTest.messages
                  ).filter(condition).map((row) => ({ ...row }))
                );
              }
            };
          }
        };
      },
      update(table) {
        return {
          set(values) {
            return {
              where(condition) {
                return {
                  async returning() {
                    const state = globalThis.handoffTest;
                    if (values.status === "human") await state.waitForBoth();
                    // One synchronous compare-and-swap, as in a conditional SQL UPDATE.
                    if (!condition(state.conversation)) return [];
                    Object.assign(state.conversation, values);
                    return [{ ...state.conversation }];
                  }
                };
              }
            };
          }
        };
      },
      insert(table) {
        return {
          values(values) {
            globalThis.handoffTest.messages.push({ ...values });
            return Promise.resolve([]);
          }
        };
      }
    };
  `,
  "./ai-assistant": `export const answerWithApprovedKnowledge = async () => { throw Error("Unexpected AI call"); };`,
  "./whatsapp": `
    export const sendWhatsAppText = async () => { throw Error("Unexpected WhatsApp call"); };
    export const whatsappConfigured = () => false;
  `,
  "./reception-push": `
    export const notifyReceptionOfHandoff = async () => { globalThis.handoffTest.notices++; };
  `,
};

let directory;
let processConversationMessage;
let setConversationStatus;
let resumeInactiveReceptionConversations;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "concurrent-handoff-"));
  const outfile = join(directory, "engine.mjs");
  await build({
    entryPoints: [fileURLToPath(new URL("../src/lib/conversation-engine.ts", import.meta.url))],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    plugins: [{
      name: "fake-external-services",
      setup(bundle) {
        bundle.onResolve({ filter: /.*/ }, (args) => {
          if (Object.hasOwn(modules, args.path)) return { path: args.path, namespace: "fake" };
        });
        bundle.onLoad({ filter: /.*/, namespace: "fake" }, (args) => ({
          contents: modules[args.path], loader: "js",
        }));
      },
    }],
  });
  ({ processConversationMessage, setConversationStatus, resumeInactiveReceptionConversations } = await import(pathToFileURL(outfile).href));
});

after(async () => {
  delete globalThis.handoffTest;
  if (directory) await rm(directory, { recursive: true, force: true });
});

function setup(phone = "5215550000000") {
  let arrivals = 0;
  let release;
  const bothArrived = new Promise((resolve) => { release = resolve; });
  const state = {
    conversation: {
      id: 1, phone, status: "bot", state: "idle", context: {},
      lastMessage: "", clientName: null, lastMessageAt: new Date(),
    },
    messages: [],
    services: [
      { id: 1, name: "Mesoterapia capilar", category: "Capilar", active: true, price: 0 },
      { id: 2, name: "NCTF revitalizante", category: "Facial", active: true, price: 0 },
    ],
    notices: 0,
    async waitForBoth() {
      if (++arrivals === 2) release();
      await bothArrived;
    },
    get arrivals() { return arrivals; },
  };
  globalThis.handoffTest = state;
  return state;
}

test("two simultaneous bot handoffs produce one reception notice", async () => {
  const state = setup();
  const results = await Promise.all([
    processConversationMessage({ phone: state.conversation.phone, message: "5" }),
    processConversationMessage({ phone: state.conversation.phone, message: "5" }),
  ]);
  assert.equal(state.arrivals, 2);
  assert.equal(state.conversation.status, "human");
  assert.equal(state.notices, 1);
  assert.ok(results.every((result) => result.handoff));
});

test("two simultaneous manual handoffs produce one reception notice", async () => {
  const state = setup();
  const results = await Promise.all([setConversationStatus(1, "human"), setConversationStatus(1, "human")]);
  assert.equal(state.arrivals, 2);
  assert.equal(state.notices, 1);
  assert.ok(results.every((result) => result.status === "human"));
});

test("a bot and a manual handoff racing produce one reception notice", async () => {
  const state = setup();
  await Promise.all([
    processConversationMessage({ phone: state.conversation.phone, message: "5" }),
    setConversationStatus(1, "human"),
  ]);
  assert.equal(state.arrivals, 2);
  assert.equal(state.notices, 1);
});

test("an inactive reception chat returns to the bot and answers the next message", async () => {
  const state = setup();
  state.conversation.status = "human";
  state.conversation.lastMessageAt = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000);
  const result = await processConversationMessage({ phone: state.conversation.phone, message: "hola" });
  assert.equal(state.conversation.status, "bot");
  assert.match(result.reply, /asistente de NovaSkin/);
});

test("each inbound message keeps an active reception chat in human mode", async () => {
  const state = setup();
  state.conversation.status = "human";
  state.conversation.lastMessageAt = new Date(Date.now() - 23 * 60 * 60 * 1000);
  const result = await processConversationMessage({ phone: state.conversation.phone, message: "hola" });
  assert.equal(result.reply, "");
  assert.equal(state.conversation.status, "human");
  assert.ok(state.conversation.lastMessageAt.getTime() > Date.now() - 60_000);
  assert.equal(await resumeInactiveReceptionConversations(), 0);
});

test("the background check returns only reception chats idle for twenty-four hours", async () => {
  const state = setup();
  state.conversation.status = "human";
  state.conversation.lastMessageAt = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000);
  assert.equal(await resumeInactiveReceptionConversations(), 1);
  assert.equal(state.conversation.status, "bot");
  assert.equal(state.conversation.state, "idle");
  assert.equal(await resumeInactiveReceptionConversations(), 0);
});

test("booking selection 2 chooses the second treatment instead of restarting the booking menu", async () => {
  const state = setup();
  const first = await processConversationMessage({ phone: state.conversation.phone, message: "cita" });
  assert.equal(first.state, "await_service");
  assert.match(first.reply, /2\..*NCTF revitalizante/);

  const second = await processConversationMessage({ phone: state.conversation.phone, message: "2" });
  assert.equal(second.state, "await_date");
  assert.equal(state.conversation.context.serviceId, 2);
  assert.match(second.reply, /seleccionaste \*NCTF revitalizante\*/);
  assert.doesNotMatch(second.reply, /Ya estamos agendando tu cita/);
});