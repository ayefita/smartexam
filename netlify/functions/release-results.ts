export default async () => {
  const url = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!url) return new Response("No site URL", { status: 500 });
  const secret = process.env.CRON_SECRET;
  await fetch(`${url}/api/cron/release`, {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
  return new Response("ok");
};

export const config = {
  // Every 10 minutes: hands in exams whose time ran out while the browser was closed, and sends due results.
  schedule: "*/10 * * * *",
};
