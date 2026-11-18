import { createApp } from './http/app.js';
import { port } from './config.js';

const app = createApp();
app.listen(port, () => {
  console.log(`Event Ticketing server listening on port ${port}.`);
});