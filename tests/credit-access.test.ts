import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { creditRoutes } from "../server/routes/credits";
import { ApiError, errorHandler } from "../server/lib/errors";
import type { Auth } from "../server/lib/auth";
import type { DatabasePool } from "../server/db/client";
test("all credit endpoints enforce workspace membership before reads or writes", async () => {
  for (const status of [401, 404]) {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    let touched = false;
    const pool = {
      connect() {
        touched = true;
        throw Error("Unexpected database write");
      },
      query() {
        touched = true;
        throw Error("Unexpected database read");
      },
    } as unknown as DatabasePool;
    await creditRoutes(app, pool, {
      async requireMembership() {
        throw new ApiError(status, "DENIED", "Denied");
      },
    } as unknown as Auth);
    for (const path of ["notes", "applications", "refunds"])
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: `/api/businesses/private/credits/${path}`,
            payload: {},
          })
        ).statusCode,
        status,
      );
    assert.equal(
      (await app.inject("/api/businesses/private/parties/secret/credits"))
        .statusCode,
      status,
    );
    assert.equal(touched, false);
    await app.close();
  }
});
