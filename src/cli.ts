import { createServices } from "./factory.js";

const { backup } = createServices();
console.log(await backup.syncAll());