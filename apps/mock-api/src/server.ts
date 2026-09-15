import { createApp } from './app';

const PORT = Number(process.env.PORT ?? 3001);

const { app, getNodes } = createApp({ log: true });

app.listen(PORT, (error) => {
  if (error) {
    throw error;
  }
  console.log(`mock-api: http://localhost:${PORT}/api/org-tree (${getNodes().length} nodes)`);
});
