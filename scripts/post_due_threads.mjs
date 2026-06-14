import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";

const GRAPH_VERSION = "v1.0";
const GRAPH_BASE = `https://graph.threads.net/${GRAPH_VERSION}`;

const REPO = process.env.GITHUB_REPOSITORY;
const BRANCH = process.env.GITHUB_REF_NAME || "main";

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

function requireValue(value, name) {
  if (!value) throw new Error(`Missing required value: ${name}`);
  return value;
}

function publicMediaUrl(mediaItem) {
  if (mediaItem.url) return mediaItem.url;

  if (!mediaItem.path) {
    throw new Error(`Media item must include either "url" or "path".`);
  }

  requireValue(REPO, "GITHUB_REPOSITORY");

  return `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${mediaItem.path}`;
}

function validatePost(post, filePath) {
  if (!post.id) throw new Error(`Missing id in ${filePath}`);
  if (!post.account) throw new Error(`Missing account in ${filePath} for ${post.id}`);
  if (!post.scheduled_at) throw new Error(`Missing scheduled_at in ${filePath} for ${post.id}`);
  if (!post.text && (!post.media || post.media.length === 0)) {
    throw new Error(`Post ${post.id} needs text or media.`);
  }

  if (post.text && post.text.length > 500) {
    throw new Error(`Post ${post.id} is ${post.text.length} characters. Threads posts must be 500 characters or fewer.`);
  }

  if (!ACCOUNTS[post.account]) {
    throw new Error(`Unknown account "${post.account}" in ${filePath} for ${post.id}`);
  }

  if (!Array.isArray(post.media)) {
    throw new Error(`Post ${post.id} media must be an array.`);
  }

  if (post.media.length > 10) {
    throw new Error(`Post ${post.id} has ${post.media.length} media items. Keep carousels to 10 or fewer.`);
  }

  for (const item of post.media) {
    if (!["image", "video"].includes(item.type)) {
      throw new Error(`Post ${post.id} has invalid media type "${item.type}". Use "image" or "video".`);
    }
  }
}

async function graphPost(endpoint, params) {
  const url = new URL(`${GRAPH_BASE}/${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, { method: "POST" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Threads API error: ${JSON.stringify(data)}`);
  }

  return data;
}

async function createTextContainer({ userId, accessToken, text }) {
  const data = await graphPost(`${userId}/threads`, {
    media_type: "TEXT",
    text,
    access_token: accessToken
  });

  return data.id;
}

async function createSingleMediaContainer({ userId, accessToken, text, mediaItem }) {
  const mediaType = mediaItem.type === "image" ? "IMAGE" : "VIDEO";
  const mediaUrl = publicMediaUrl(mediaItem);

  const params = {
    media_type: mediaType,
    text,
    access_token: accessToken,
    alt_text: mediaItem.alt
  };

  if (mediaItem.type === "image") {
    params.image_url = mediaUrl;
  } else {
    params.video_url = mediaUrl;
  }

  const data = await graphPost(`${userId}/threads`, params);
  return data.id;
}

async function createCarouselItem({ userId, accessToken, mediaItem }) {
  const mediaType = mediaItem.type === "image" ? "IMAGE" : "VIDEO";
  const mediaUrl = publicMediaUrl(mediaItem);

  const params = {
    media_type: mediaType,
    is_carousel_item: "true",
    access_token: accessToken,
    alt_text: mediaItem.alt
  };

  if (mediaItem.type === "image") {
    params.image_url = mediaUrl;
  } else {
    params.video_url = mediaUrl;
  }

  const data = await graphPost(`${userId}/threads`, params);
  return data.id;
}

async function createCarouselContainer({ userId, accessToken, text, childIds }) {
  const data = await graphPost(`${userId}/threads`, {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    text,
    access_token: accessToken
  });

  return data.id;
}

async function publishContainer({ userId, accessToken, creationId }) {
  return graphPost(`${userId}/threads_publish`, {
    creation_id: creationId,
    access_token: accessToken
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createContainerForPost({ userId, accessToken, post }) {
  if (post.media.length === 0) {
    return createTextContainer({
      userId,
      accessToken,
      text: post.text
    });
  }

  if (post.media.length === 1) {
    return createSingleMediaContainer({
      userId,
      accessToken,
      text: post.text,
      mediaItem: post.media[0]
    });
  }

  const childIds = [];

  for (const mediaItem of post.media) {
    const childId = await createCarouselItem({
      userId,
      accessToken,
      mediaItem
    });

    childIds.push(childId);
    await sleep(3000);
  }

  return createCarouselContainer({
    userId,
    accessToken,
    text: post.text,
    childIds
  });
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
      if (scheduledAt > now) continue;

      const account = ACCOUNTS[post.account];
      const userId = requireValue(account.userId, `${post.account} user id`);
      const accessToken = requireValue(account.accessToken, `${post.account} access token`);

      console.log(`Posting ${post.id} to ${post.account}...`);

      try {
        const creationId = await createContainerForPost({
          userId,
          accessToken,
          post
        });

        await sleep(post.media.length > 0 ? 30000 : 3000);

        const publishResult = await publishContainer({
          userId,
          accessToken,
          creationId
        });

        post.status = "posted";
        post.posted_at = new Date().toISOString();
        post.threads_creation_id = creationId;
        post.threads_post_id = publishResult.id ?? null;
        post.error = null;

        changed = true;
        postedCount += 1;

        console.log(`Posted ${post.id}`);
      } catch (error) {
        post.status = "error";
        post.error_at = new Date().toISOString();
        post.error = error.message;

        changed = true;

        console.error(`Failed ${post.id}:`, error);
      }
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