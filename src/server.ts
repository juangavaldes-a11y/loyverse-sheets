import { createApp } from "./app.js";
import { createServices } from "./factory.js";

const services = createServices();
const { app, runSync } = createApp(services.config, services.auth, services.loyverse, services.backup);

app.listen(services.config.PORT, () => {
  console.log(`Loyverse integration listening on ${services.config.PUBLIC_BASE_URL}`);
});

if (services.config.POLL_INTERVAL_MINUTES > 0) {
  setInterval(() => void runSync(), services.config.POLL_INTERVAL_MINUTES * 60_000).unref();
}