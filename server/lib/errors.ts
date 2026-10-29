import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export function errorHandler(
  error: FastifyError | ApiError | ZodError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error.message?.startsWith("ACCOUNTING_"))
    return reply
      .status(409)
      .send({
        code: error.message.split(":")[0],
        message: error.message.split(": ").slice(1).join(": "),
        requestId: request.id,
      });
  if (error instanceof ZodError) {
    return reply.status(400).send({
      code: "VALIDATION_ERROR",
      message: "The request contains invalid values.",
      fieldErrors: error.flatten().fieldErrors,
      requestId: request.id,
    });
  }
  if (error instanceof ApiError) {
    return reply.status(error.status).send({
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
      requestId: request.id,
    });
  }
  request.log.error(
    { err: error, requestId: request.id },
    "Unhandled request error",
  );
  return reply.status(500).send({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
    requestId: request.id,
  });
}
