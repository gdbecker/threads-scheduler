const GRAPH_VERSION = "v1.0";
const GRAPH_BASE = `https://graph.threads.net/${GRAPH_VERSION}`;

const TOKENS = {
  THREADS_GARRETTS_DEV_DESK_ACCESS_TOKEN: process.env.THREADS_GARRETTS_DEV_DESK_ACCESS_TOKEN,
  THREADS_EDGE_STUDIO_ACCESS_TOKEN: process.env.THREADS_EDGE_STUDIO_ACCESS_TOKEN
};

async function refreshToken(secretName, token) {
  if (!token) {
    console.log(`Skipping ${secretName}; no token found.`);
    return;
  }

  const url = new URL(`${GRAPH_BASE}/refresh_access_token`);
  url.searchParams.set("grant_type", "th_refresh_token");
  url.searchParams.set("access_token", token);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Failed to refresh ${secretName}: ${JSON.stringify(data)}`);
  }

  console.log(`::add-mask::${data.access_token}`);
  console.log(`${secretName} refreshed.`);
  console.log(`New token for ${secretName}: ${data.access_token}`);
  console.log("Copy this new token into the matching GitHub Actions secret.");
}

async function main() {
  for (const [secretName, token] of Object.entries(TOKENS)) {
    await refreshToken(secretName, token);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});