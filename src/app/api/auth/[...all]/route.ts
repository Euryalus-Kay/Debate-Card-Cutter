import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

const handler = () => toNextJsHandler(auth());

export async function GET(req: Request) {
  return handler().GET(req);
}

export async function POST(req: Request) {
  return handler().POST(req);
}
