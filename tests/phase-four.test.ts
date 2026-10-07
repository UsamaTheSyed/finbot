import test from "node:test";
import assert from "node:assert/strict";
import { teamService } from "../src/services/teamService";
import { notificationService } from "../src/services/notificationService";
import { notifications } from "../src/services/mock/data";

test("team invitations are scoped, reject duplicates and can be removed", async () => {
  const email = "phase-four@example.com";
  const member = await teamService.invite("business-1", {
    name: "Phase Four Member",
    email,
    role: "Staff",
    permissions: ["view-transactions"],
  });
  assert.equal(member.status, "Invited");
  assert.equal(
    (await teamService.list("business-1")).some((item) => item.email === email),
    true,
  );
  await assert.rejects(
    teamService.invite("business-1", {
      name: "Duplicate",
      email: email.toUpperCase(),
      role: "Staff",
      permissions: ["view-transactions"],
    }),
    /already exists/,
  );
  await teamService.remove("business-1", member.id);
  assert.equal(
    (await teamService.list("business-1")).some(
      (item) => item.id === member.id,
    ),
    false,
  );
  await assert.rejects(
    teamService.remove("business-1", "user-1"),
    /owner cannot be removed/,
  );
});

test("notification actions remain scoped to the selected workspace", async () => {
  const original = notifications.map((item) => item.read);
  try {
    await notificationService.markRead("business-1", "notice-1");
    assert.equal(
      (await notificationService.list("business-1")).find(
        (item) => item.id === "notice-1",
      )?.read,
      true,
    );
    await notificationService.markAllRead("business-1");
    assert.equal(
      (await notificationService.list("business-1")).every((item) => item.read),
      true,
    );
    assert.deepEqual(await notificationService.list("unknown"), []);
  } finally {
    notifications.forEach((item, index) => {
      item.read = original[index];
    });
  }
});
