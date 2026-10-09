import { withApi } from "@/server/api/with-api";
import { AppError } from "@/server/errors/app-error";

/*
  Any /api path no route claims. Without this, Next answers with its HTML 404
  page, which a client calling fetch().json() cannot parse. Specific routes
  always win over a catch-all, so this only ever sees unknown paths.
*/
const notFound = withApi(async () => {
  throw AppError.notFound("Endpoint");
}, { auth: false });

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
