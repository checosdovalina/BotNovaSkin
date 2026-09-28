import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const modules = {
  "@workspace/db": `
    export const localSessionsTable = {};
    export const localUsersTable = {};
    export const db = {};
  `,
  "drizzle-orm": `
    export const and = (...args) => args;
    export const eq = (...args) => args;
    export const gt = (...args) => args;
  `,
};

let directory;
let auth;
let loginLimiter;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "local-auth-"));
  const outfile = join(directory, "local-auth.mjs");
  await build({
    entryPoints: [fileURLToPath(new URL("../src/lib/local-auth.ts", import.meta.url))],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    plugins: [{
      name: "stub-database",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) => {
          if (Object.hasOwn(modules, args.path)) return { path: args.path, namespace: "fake" };
        });
        builder.onLoad({ filter: /.*/, namespace: "fake" }, (args) => ({
          contents: modules[args.path],
          loader: "js",
        }));
      },
    }],
  });
  auth = await import(pathToFileURL(outfile).href);
  const limiterFile = join(directory, "login-rate-limit.mjs");
  await build({
    entryPoints: [fileURLToPath(new URL("../src/lib/login-rate-limit.ts", import.meta.url))],
    outfile: limiterFile,
    bundle: true,
    platform: "node",
    format: "esm",
  });
  loginLimiter = await import(pathToFileURL(limiterFile).href);
});

after(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("password hashes are salted, non-reversible and verified in constant-time helper", async () => {
  const password = "correct horse battery staple";
  const first = await auth.hashPassword(password);
  const second = await auth.hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(first.split(":")[0].length, 32);
  assert.equal(first.split(":")[1].length, 128);
  assert.equal(await auth.verifyPassword(password, first), true);
  assert.equal(await auth.verifyPassword("incorrect password", first), false);
  assert.equal(await auth.verifyPassword(password, "plaintext"), false);
});

test("email and password boundaries normalize and enforce account requirements", () => {
  assert.equal(auth.normalizeEmail("  ADMIN@Example.COM "), "admin@example.com");
  assert.equal(auth.isValidEmail("admin@example.com"), true);
  assert.equal(auth.isValidEmail("not-an-email"), false);
  assert.equal(auth.isValidPassword("12345678901"), false);
  assert.equal(auth.isValidPassword("123456789012"), true);
});

test("session cookie parser accepts only correctly sized opaque tokens", () => {
  const token = "a".repeat(43);
  assert.equal(auth.readSessionToken({ headers: { cookie: `vps_session=${token}` } }), token);
  assert.equal(auth.readSessionToken({ headers: { cookie: "vps_session=short" } }), undefined);
  assert.equal(auth.hashSessionToken(token), auth.hashSessionToken(token));
  assert.notEqual(auth.hashSessionToken(token), token);
});

test("cookie-authenticated writes require an exact same-origin Origin", () => {
  const request = {
    header: (name) => name.toLowerCase() === "origin" ? "https://panel.example.test" : undefined,
    get: (name) => name.toLowerCase() === "host" ? "panel.example.test" : undefined,
    protocol: "https",
  };
  assert.equal(auth.isSameOriginRequest(request), true);
  assert.equal(auth.isSameOriginRequest({
    ...request,
    header: () => "https://attacker.example.test",
  }), false);
  assert.equal(auth.isSameOriginRequest({
    ...request,
    header: () => undefined,
  }), false);
});

test("role gates deny restricted API actions with HTTP 403", () => {
  for (const [role, allowed] of [["staff", ["admin", "superadmin"]], ["admin", ["superadmin"]]]) {
    let status;
    let body;
    let nextCalled = false;
    auth.requireRole(...allowed)(
      { localUser: { id: "user-1", email: "user@example.test", role } },
      { status: (code) => { status = code; return { json: (value) => { body = value; } }; } },
      () => { nextCalled = true; },
    );
    assert.equal(status, 403);
    assert.deepEqual(body, { error: "No tienes permisos para realizar esta acción" });
    assert.equal(nextCalled, false);
  }
});

test("account-role policy prevents staff administration, admin escalation, and web superadmin management", () => {
  assert.equal(auth.canCreateLocalRole("admin", "staff"), true);
  assert.equal(auth.canCreateLocalRole("admin", "admin"), false);
  assert.equal(auth.canCreateLocalRole("admin", "superadmin"), false);
  assert.equal(auth.canCreateLocalRole("superadmin", "admin"), true);
  assert.equal(auth.canCreateLocalRole("superadmin", "superadmin"), false);
  assert.equal(auth.canManageLocalRole("admin", "staff"), true);
  assert.equal(auth.canManageLocalRole("admin", "admin"), false);
  assert.equal(auth.canManageLocalRole("superadmin", "admin"), true);
  assert.equal(auth.canManageLocalRole("superadmin", "superadmin"), false);
  assert.equal(auth.canManageLocalRole("staff", "staff"), false);
});

test("cross-site HTML form login is rejected before reaching the login handler", () => {
  let status;
  let body;
  let nextCalled = false;
  auth.requireSameOrigin({
    header: () => "https://attacker.example.test",
    get: (name) => name.toLowerCase() === "host" ? "panel.example.test" : undefined,
    protocol: "https",
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
  }, {
    status: (code) => {
      status = code;
      return { json: (value) => { body = value; } };
    },
  }, () => { nextCalled = true; });
  assert.equal(status, 403);
  assert.deepEqual(body, { error: "La solicitud no pertenece a este origen" });
  assert.equal(nextCalled, false);
});

test("login throttling isolates email/IP pairs but caps all users sharing an IP", () => {
  const ip = "198.51.100.42";
  for (let i = 0; i < 5; i += 1) {
    loginLimiter.recordLoginFailure("first@example.test", ip, 1_000);
  }
  assert.equal(loginLimiter.isLoginRateLimited("first@example.test", ip, 1_001), true);
  assert.equal(loginLimiter.isLoginRateLimited("second@example.test", ip, 1_001), false);
  for (let i = 0; i < 5; i += 1) {
    loginLimiter.recordLoginFailure("second@example.test", ip, 1_002);
  }
  assert.equal(loginLimiter.isLoginRateLimited("second@example.test", ip, 1_003), true);
  for (let i = 0; i < 10; i += 1) {
    loginLimiter.recordLoginFailure(`other-${i}@example.test`, ip, 1_004);
  }
  assert.equal(loginLimiter.isLoginRateLimited("new@example.test", ip, 1_005), true);
  assert.equal(loginLimiter.isLoginRateLimited("new@example.test", "198.51.100.43", 1_005), false);
});

test("production session cookie is HttpOnly, Secure and SameSite=Lax", () => {
  const prior = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  let cookie;
  auth.setSessionCookie({
    cookie: (...args) => { cookie = args; },
  }, "opaque-token");
  if (prior === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = prior;
  assert.equal(cookie[0], "vps_session");
  assert.equal(cookie[1], "opaque-token");
  assert.equal(cookie[2].httpOnly, true);
  assert.equal(cookie[2].secure, true);
  assert.equal(cookie[2].sameSite, "lax");
});