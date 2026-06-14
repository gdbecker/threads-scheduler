import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";

const GRAPH_VERSION = "v23.0";
const GRAPH_BASE = `https://graph.threads.net/${GRAPH_VERSION}`;

const ACCOUNTS = {
  garretts_dev_desk: {
    userId: process.env.THREADS_GARRETTS_DEV_DESK_USER_ID,
    accessToken: process.env.THREADS_GARRETTS_DEV_DESK_ACCESS_TOKEN
  },
  edge_studio: {
    userId: process.env.THREADS_EDGE_STUDIO_USER_ID,
    accessToken: process.env.THREADS_EDGE_STUDIO_ACCESS_TOKEN
  }
};

function requireEnv(value, name) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function validatePost(post, filePath) {
  if (!post.id) throw new Error(`Missing id in ${filePath}`);
  if (!post.account) throw new Error(`Missing account in ${filePath} for ${post.id}`);
  if (!post.scheduled_at) throw new Error(`Missing scheduled_at in ${filePath} for ${post.id}`);
  if (!post.text) throw new Error(`Missing text in ${filePath} for ${post.id}`);

  if (post.text.length > 500) {
    throw new Error(`Post ${post.id} is ${post.text.length} characters. Threads text posts must be 500 characters or fewer.`);
  }

  if (post.media?.length) {
    throw new Error(`Post ${post.id} has media. This v1 scheduler is text-only.`);
  }

  if (!ACCOUNTS[post.account]) {
    throw new Error(`Unknown account "${post.account}" in ${filePath} for ${post.id}`);
  }
}

async function createTextContainer({ userId, accessToken, text }) {
  const url = new URL(`${GRAPH_BASE}/${userId}/threads`);
  url.searchParams.set("media_type", "TEXT");
  url.searchParams.set("text", text);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, { method: "POST" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Create container failed: ${JSON.stringify(data)}`);
  }

  if (!data.id) {
    throw new Error(`Create container response missing id: ${JSON.stringify(data)}`);
  }

  return data.id;
}

async function publishContainer({ userId, accessToken, creationId }) {
  const url = new URL(`${GRAPH_BASE}/${userId}/threads_publish`);
  url.searchParams.set("creation_id", creationId);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, { method: "POST" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Publish failed: ${JSON.stringify(data)}`);
  }

  return data;
}

async function main() {
  const now = new Date();
  const files = await glob("posts/**/*.json");

  let postedCount = 0;

  for (const filePath of files) {
    const absolutePath = path.resolve(filePath);
    const raw = await fs.readFile(absolutePath, "utf8");
    const posts = JSON.parse(raw);

    if (!Array.isArray(posts)) {
      throw new Error(`${filePath} must contain a JSON array.`);
    }

    let changed = false;

    for (const post of posts) {
      validatePost(post, filePath);

      if (post.status !== "queued") continue;

      const scheduledAt = new Date(post.scheduled_at);
      if (Number.isNaN(scheduledAt.getTime())) {
        throw new Error(`Invalid scheduled_at for post ${post.id}: ${post.scheduled_at}`);
      }

      if (scheduledAt > now) continue;

      const account = ACCOUNTS[post.account];
      const userId = requireEnv(account.userId, `${post.account} user id`);
      const accessToken = requireEnv(account.accessToken, `${post.account} access token`);

      console.log(`Posting ${post.id} to ${post.account}...`);

      const creationId = await createTextContainer({
        userId,
        accessToken,
        text: post.text
      });

      const publishResult = await publishContainer({
        userId,
        accessToken,
        creationId
      });

      post.status = "posted";
      post.posted_at = new Date().toISOString();
      post.threads_creation_id = creationId;
      post.threads_post_id = publishResult.id ?? null;

      changed = true;
      postedCount += 1;

      console.log(`Posted ${post.id}`);
    }

    if (changed) {
      await fs.writeFile(absolutePath, `${JSON.stringify(posts, null, 2)}\n`);
    }
  }

  console.log(`Done. Posted ${postedCount} post(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});