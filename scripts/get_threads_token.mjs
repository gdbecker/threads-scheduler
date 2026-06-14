const {
  THREADS_APP_ID,
  THREADS_APP_SECRET,
  THREADS_REDIRECT_URI,
  THREADS_AUTH_CODE,
  THREADS_SHORT_LIVED_TOKEN
} = process.env;

const GRAPH_VERSION = "v23.0";
const GRAPH_BASE = `https://graph.threads.net/${GRAPH_VERSION}`;

function requireValue(value, name) {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function exchangeCodeForShortLivedToken() {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", requireValue(THREADS_APP_ID, "THREADS_APP_ID"));
  url.searchParams.set("client_secret", requireValue(THREADS_APP_SECRET, "THREADS_APP_SECRET"));
  url.searchParams.set("grant_type", "authorization_code");
  url.searchParams.set("redirect_uri", requireValue(THREADS_REDIRECT_URI, "THREADS_REDIRECT_URI"));
  url.searchParams.set("code", requireValue(THREADS_AUTH_CODE, "THREADS_AUTH_CODE"));

  const response = await fetch(url, { method: "POST" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  console.log("Short-lived token response:");
  console.log(JSON.stringify(data, null, 2));
}

async function exchangeShortForLongLivedToken() {
  const url = new URL(`${GRAPH_BASE}/access_token`);
  url.searchParams.set("grant_type", "th_exchange_token");
  url.searchParams.set("client_secret", requireValue(THREADS_APP_SECRET, "THREADS_APP_SECRET"));
  url.searchParams.set("access_token", requireValue(THREADS_SHORT_LIVED_TOKEN, "THREADS_SHORT_LIVED_TOKEN"));

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  console.log("Long-lived token response:");
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  if (THREADS_AUTH_CODE) {
    await exchangeCodeForShortLivedToken();
    return;
  }

  if (THREADS_SHORT_LIVED_TOKEN) {
    await exchangeShortForLongLivedToken();
    return;
  }

  console.log("Provide THREADS_AUTH_CODE or THREADS_SHORT_LIVED_TOKEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});