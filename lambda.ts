import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from "https://deno.land/x/lambda@1.32.5/mod.ts";
import { Config, run } from "./core.ts";

export async function handler(
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResultV2> {
    const config: Config = {
        apiKey: Deno.env.get('NOTION_API_KEY')!,
        databaseId: Deno.env.get('NOTION_DATABASE_ID')!,
    };

    await run(config);

    return {
        body: 'Done',
        headers: { "content-type": "text/html;charset=utf8" },
        statusCode: 200,
    };
}