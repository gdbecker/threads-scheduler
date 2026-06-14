const {
  THREADS_APP_ID,
  THREADS_APP_SECRET,
  THREADS_REDIRECT_URI,
  THREADS_AUTH_CODE,
  THREADS_SHORT_LIVED_TOKEN
} = process.env;

function requireValue(value, name) {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function exchangeCodeForShortLivedToken() {
  const form = new FormData();
  form.append("client_id", requireValue(THREADS_APP_ID, "THREADS_APP_ID"));
  form.append("client_secret", requireValue(THREADS_APP_SECRET, "THREADS_APP_SECRET"));
  form.append("grant_type", "authorization_code");
  form.append("redirect_uri", requireValue(THREADS_REDIRECT_URI, "THREADS_REDIRECT_URI"));
  form.append("code", requireValue(THREADS_AUTH_CODE, "THREADS_AUTH_CODE"));

  const response = await fetch("https://graph.threads.net/oauth/access_token", {
    method: "POST",
    body: form
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  console.log("Short-lived token response:");
  console.log(JSON.stringify(data, null, 2));
}

async function exchangeShortForLongLivedToken() {
  const url = new URL("https://graph.threads.net/access_token");
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