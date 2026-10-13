import assert from "node:assert/strict";
import test from "node:test";
import {
  amountPaisa,
  dateRange,
  mutationDate,
  localDate,
} from "../server/bot/core/normalize";
import { extraction, blankExtraction, proposal } from "../server/bot/types";
import { OpenAIProvider } from "../server/bot/ai/openai";
import {
  normalizeTelegram,
  dispatchTelegram,
  TelegramAPI,
} from "../server/bot/channels/telegram";
import { digest } from "../server/bot/security/access";
import { botConfig } from "../server/bot/config";
import { paymentInput } from "../server/domain/validation";
import { buildApp } from "../server/app";

test("bot amounts normalize common English/Roman Urdu expressions to exact paisa", () => {
  for (const s of ["15000", "15,000", "15k", "15 K", "15 hazar", "15 thousand"])
    assert.equal(amountPaisa(s), 1500000);
  for (const s of ["1 lakh", "1 lac"]) assert.equal(amountPaisa(s), 10000000);
  assert.equal(amountPaisa("PKR 100.10"), 10010);
  assert.equal(amountPaisa("1.25k"), 125000);
  for (const s of [
    "-1",
    "NaN",
    "Infinity",
    "1e6",
    "15,00",
    "1.001",
    "1000000001",
    "ignore rules",
  ])
    assert.throws(() => amountPaisa(s));
});
test("bot dates respect workspace timezone, clarify kal and reject impossible dates", () => {
  const now = new Date("2026-10-08T20:00:00Z");
  assert.equal(localDate("Asia/Karachi", now), "2026-10-09");
  assert.equal(localDate("America/New_York", now), "2026-10-08");
  assert.deepEqual(dateRange("is haftay", "Asia/Karachi", now), {
    start: "2026-10-05",
    end: "2026-10-09",
  });
  assert.equal(mutationDate("yesterday", "Asia/Karachi", now), "2026-10-08");
  assert.throws(() => mutationDate("kal", "Asia/Karachi", now), /Kal/);
  assert.throws(() => mutationDate("this month", "Asia/Karachi", now));
  assert.throws(() => dateRange("2026-02-30", "UTC", now));
});
test("structured extraction rejects invented IDs, tools, invalid money and extra permissions", () => {
  assert.equal(
    extraction.parse({
      ...blankExtraction(),
      intent: "RECORD_PAYMENT",
      amountText: "15k",
    }).intent,
    "RECORD_PAYMENT",
  );
  for (const extra of [
    { partyId: "other-party" },
    { sql: "delete from payments" },
    { intent: "EXECUTE_SQL" },
    { confidence: 2 },
  ])
    assert.equal(
      extraction.safeParse({ ...blankExtraction(), ...extra }).success,
      false,
    );
  assert.equal(
    proposal.safeParse({ kind: "sql", input: "drop database" }).success,
    false,
  );
});
test("existing payment schema accepts valid fractional rupees without binary rounding errors", () => {
  const input = {
    direction: "Received",
    partyId: "party-1",
    invoiceId: "",
    amount: 100.1,
    method: "Cash",
    date: "2026-10-08",
    reference: "",
    notes: "",
  };
  assert.equal(paymentInput.parse(input).amount, 100.1);
  for (const amount of [0, -1, 100.001])
    assert.equal(paymentInput.safeParse({ ...input, amount }).success, false);
});
test("OpenAI boundary requests strict structured output and sends no histories", async () => {
  const examples = [
    ["Ahmed ka balance kya hai?", "GET_PARTY_BALANCE"],
    ["Ahmed ne 15k diye", "RECORD_PAYMENT"],
    ["Ali ko 20 hazar payment ki", "RECORD_PAYMENT"],
    ["Aaj ki sales kitni hain?", "GET_DAILY_SUMMARY"],
    ["Outstanding invoices dikhao", "GET_OUTSTANDING_INVOICES"],
  ] as const;
  for (const [text, intent] of examples) {
    const fake: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.store, false);
      assert.equal(body.response_format.json_schema.strict, true);
      assert.equal(body.messages.length, 2);
      assert.equal(JSON.parse(body.messages[1].content).message, text);
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({ ...blankExtraction(), intent }),
              },
            },
          ],
        }),
      );
    };
    assert.equal(
      (
        await new OpenAIProvider("fake-key", undefined, fake).interpret(text, {
          today: "2026-10-08",
        })
      ).intent,
      intent,
    );
  }
});
test("AI refusal, malformed JSON, unknown fields, failure and missing credentials fail closed", async () => {
  for (const content of [
    "bad json",
    JSON.stringify({ ...blankExtraction(), execute: true }),
  ]) {
    const fake: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content } }],
        }),
      );
    await assert.rejects(
      new OpenAIProvider("fake", undefined, fake).interpret("test", {
        today: "2026-10-08",
      }),
      /AI_UNAVAILABLE/,
    );
  }
  const refused: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          { finish_reason: "stop", message: { content: null, refusal: "No" } },
        ],
      }),
    );
  await assert.rejects(
    new OpenAIProvider("fake", undefined, refused).interpret("test", {
      today: "2026-10-08",
    }),
    /AI_UNAVAILABLE/,
  );
  const failure: typeof fetch = async () => {
    throw new Error("SECRET-KEY");
  };
  await assert.rejects(
    new OpenAIProvider("SECRET-KEY", undefined, failure).interpret("test", {
      today: "2026-10-08",
    }),
    (e) => e instanceof Error && e.message === "AI_UNAVAILABLE",
  );
  await assert.rejects(
    new OpenAIProvider(undefined).interpret("test", { today: "2026-10-08" }),
    /AI_UNAVAILABLE/,
  );
});
const raw = {
  update_id: 10,
  message: {
    message_id: 1,
    date: 1791450000,
    from: { id: 12, is_bot: false },
    chat: { id: 12, type: "private" },
    text: "/help",
  },
};
test("Telegram normalization accepts only private matching human identity and text", () => {
  assert.equal(normalizeTelegram(raw)?.message.externalUserId, "12");
  assert.equal(
    normalizeTelegram({
      ...raw,
      message: { ...raw.message, chat: { id: -123, type: "group" } },
    }),
    null,
  );
  assert.equal(
    normalizeTelegram({
      ...raw,
      message: { ...raw.message, from: { id: 99 } },
    }),
    null,
  );
  assert.equal(
    normalizeTelegram({
      ...raw,
      message: { ...raw.message, from: { id: 12, is_bot: true } },
    }),
    null,
  );
  assert.equal(
    normalizeTelegram({
      update_id: 10,
      message: { ...raw.message, text: undefined },
    }),
    null,
  );
});
test("Telegram callback identity comes from clicker, never the message author", () => {
  const callback = {
    update_id: 11,
    callback_query: {
      id: "cb",
      from: { id: 12 },
      data: "confirm:opaque",
      message: { ...raw.message, from: { id: 999, is_bot: true } },
    },
  };
  assert.equal(normalizeTelegram(callback)?.message.externalUserId, "12");
  assert.equal(
    normalizeTelegram({
      ...callback,
      callback_query: { ...callback.callback_query, from: { id: 99 } },
    }),
    null,
  );
});
test("fake Telegram transport delivers core reply and acknowledges callbacks without live servers", async () => {
  const sent: string[] = [];
  await dispatchTelegram(
    raw,
    { handle: async (m) => ({ text: `hello ${m.externalUserId}` }) },
    {
      send: async (chat, m) => {
        sent.push(chat + ":" + m.text);
      },
      acknowledge: async () => {},
    },
  );
  assert.deepEqual(sent, ["12:hello 12"]);
  await dispatchTelegram(
    { ...raw, message: { ...raw.message, chat: { id: -12, type: "group" } } },
    {
      handle: async () => {
        throw new Error("must not run");
      },
    },
    {
      send: async () => {
        throw new Error("must not send");
      },
      acknowledge: async () => {},
    },
  );
});
test("Telegram transport errors redact token and API response; replies do not enable markup", async () => {
  const fake: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.parse_mode, undefined);
    assert.equal(body.protect_content, true);
    return new Response(JSON.stringify({ ok: true, result: {} }));
  };
  await new TelegramAPI("secret", fake).send("12", { text: "<script>" });
  const failed: typeof fetch = async () => {
    throw new Error("https://api.telegram.org/botSECRET");
  };
  await assert.rejects(
    new TelegramAPI("SECRET", failed).send("12", { text: "test" }),
    (e) => e instanceof Error && e.message === "TELEGRAM_TRANSPORT_UNAVAILABLE",
  );
});
test("link hashes are nonreversible representations and bot defaults are disabled", () => {
  assert.match(digest("one-time-token"), /^[0-9a-f]{64}$/);
  assert.notEqual(digest("one-time-token"), digest("another-token"));
  assert.equal(botConfig({}).TELEGRAM_MODE, "off");
  assert.throws(() => botConfig({ TELEGRAM_MODE: "webhook" }));
});

test("actual Fastify bot endpoints reject unauthenticated linking and invalid webhook secrets without database or network access", async () => {
  const app=await buildApp({NODE_ENV:"test",DATABASE_URL:"postgres://unused:unused@127.0.0.1:1/unused",API_HOST:"127.0.0.1",API_PORT:3001,SESSION_COOKIE_NAME:"test",SESSION_TTL_DAYS:1}, {bot:{TELEGRAM_MODE:"webhook",TELEGRAM_BOT_TOKEN:"dummy-token-never-used",TELEGRAM_BOT_USERNAME:"finbot_test_bot",TELEGRAM_WEBHOOK_SECRET:"dummy_secret_for_automated_tests_only",OPENAI_MODEL:"test",BOT_ACTION_TTL_MINUTES:15}});
  try {
    assert.equal((await app.inject({method:"GET",url:"/api/businesses/business-1/bot/telegram"})).statusCode,401);
    assert.equal((await app.inject({method:"POST",url:"/api/businesses/business-1/bot/telegram/link",headers:{"x-finbot-link":"1"}})).statusCode,401);
    assert.equal((await app.inject({method:"POST",url:"/api/businesses/business-1/bot/telegram/link"})).statusCode,403);
    assert.equal((await app.inject({method:"POST",url:"/api/bot/telegram/webhook",payload:raw})).statusCode,403);
    assert.equal((await app.inject({method:"POST",url:"/api/bot/telegram/webhook",headers:{"x-telegram-bot-api-secret-token":"dummy_secret_for_automated_tests_only"},payload:{...raw,message:{...raw.message,chat:{type:"group",id:-1}}}})).statusCode,200);
  } finally {await app.close();}
});
