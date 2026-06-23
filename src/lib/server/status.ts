export type AppStatus = {
  ok: true;
  service: "zenith";
  runtime: "sveltekit-adapter-node";
  adapter: "node";
  timestamp: string;
};

export function getAppStatus(now: Date = new Date()): AppStatus {
  return {
    ok: true,
    service: "zenith",
    runtime: "sveltekit-adapter-node",
    adapter: "node",
    timestamp: now.toISOString(),
  };
}
