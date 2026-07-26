import handler from "../../api/cron/refresh-tryst.js";
import { wrap } from "../lib/vercel-shim.mjs";
export default wrap(handler, { cronSecret: true });
export const config = { schedule: "0 11 1 * *" }; // 1st of month 11:00 UTC
