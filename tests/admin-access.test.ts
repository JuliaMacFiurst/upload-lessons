import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  AdminSessionError,
  assertAdminUser,
  getAdminSessionErrorStatus,
  isAllowedAdminEmail,
} from "../lib/server/admin-session.ts";

function withAdminEmails(value: string | undefined, callback: () => void) {
  const originalEmails = process.env.ADMIN_EMAILS;
  const originalEmail = process.env.ADMIN_EMAIL;
  try {
    if (value === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = value;
    delete process.env.ADMIN_EMAIL;
    callback();
  } finally {
    if (originalEmails === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = originalEmails;
    if (originalEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalEmail;
  }
}

test("the existing owner and the second administrator are allowed", () => {
  withAdminEmails("juliamakhlinfiurst@gmail.com,olgamakhlina@gmail.com", () => {
    assert.equal(isAllowedAdminEmail("juliamakhlinfiurst@gmail.com"), true);
    assert.equal(isAllowedAdminEmail("olgamakhlina@gmail.com"), true);
  });
});

test("allowlist parsing trims CSV values and ignores email case", () => {
  withAdminEmails(" OWNER@EXAMPLE.COM , OlgaMakhlina@Gmail.com ", () => {
    assert.equal(isAllowedAdminEmail("owner@example.com"), true);
    assert.equal(isAllowedAdminEmail(" OLGAMAKHLINA@GMAIL.COM "), true);
  });
});

test("an unrelated email is denied", () => {
  withAdminEmails("owner@example.com,olgamakhlina@gmail.com", () => {
    assert.equal(isAllowedAdminEmail("stranger@example.com"), false);
  });
});

test("an empty allowlist is a configuration error", () => {
  withAdminEmails("  , ", () => {
    assert.throws(
      () => isAllowedAdminEmail("owner@example.com"),
      (error) => error instanceof AdminSessionError && error.statusCode === 500,
    );
  });
});

test("ADMIN_EMAIL remains a backward-compatible CSV fallback", () => {
  const originalEmails = process.env.ADMIN_EMAILS;
  const originalEmail = process.env.ADMIN_EMAIL;
  try {
    delete process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAIL = "owner@example.com, olgamakhlina@gmail.com";
    assert.equal(isAllowedAdminEmail("olgamakhlina@gmail.com"), true);
  } finally {
    if (originalEmails === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = originalEmails;
    if (originalEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalEmail;
  }
});

test("the API guard distinguishes unauthenticated and forbidden users", () => {
  withAdminEmails("owner@example.com,olgamakhlina@gmail.com", () => {
    assert.throws(
      () => assertAdminUser(null),
      (error) => getAdminSessionErrorStatus(error) === 401,
    );
    assert.throws(
      () => assertAdminUser({ email: "stranger@example.com" }),
      (error) => getAdminSessionErrorStatus(error) === 403,
    );
  });
});

test("upload handlers are protected by the server guard", async () => {
  const uploadHandlers = [
    "../pages/api/admin/artworks/storage-folder.ts",
    "../pages/api/admin/recipes/[recipeId]/media.ts",
    "../pages/api/admin/bedtime-stories/[storyId]/media.ts",
    "../pages/api/admin/parrot-music-styles/media.ts",
  ];
  for (const handler of uploadHandlers) {
    const source = await readFile(new URL(handler, import.meta.url), "utf8");
    assert.match(source, /requireAdminSession\(req, res\)/, handler);
  }
});

test("all admin API handlers use the guard or re-export a guarded handler", async () => {
  const apiDirectory = new URL("../pages/api/admin/", import.meta.url);
  const entries = await readdir(apiDirectory, { recursive: true });
  for (const entry of entries.filter((name) => name.endsWith(".ts"))) {
    const source = await readFile(new URL(entry, apiDirectory), "utf8");
    if (/export \{ default \} from /.test(source)) {
      assert.match(source, /from "\.\.\/translation\/(run|cancel|analyze)"/);
    } else {
      assert.match(source, /requireAdminSession\(req, res\)/, entry);
    }
  }
});
