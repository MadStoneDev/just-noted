import { Client } from "@upstash/qstash";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function setupCleanupSchedule() {
  const qstash = new Client({
    token: process.env.QSTASH_TOKEN!,
  });

  const endpoint = `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/cleanup`;

  const scheduleResult = await qstash.schedules.create({
    destination: endpoint,
    cron: "0 2 * * 1", // Every Monday at 2 AM
    headers: {
      "x-api-key": process.env.CLEANUP_API_KEY!,
    },
  });

  console.log("Cleanup schedule created:", scheduleResult);
}

setupCleanupSchedule().catch(console.error);
