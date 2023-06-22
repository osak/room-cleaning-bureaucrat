import { Config, run } from "./core.ts";

const config: Config = {
  apiKey: Deno.env.get("NOTION_API_KEY")!,
  databaseId: Deno.env.get("NOTION_DATABASE_ID")!,
};

await run(config);
