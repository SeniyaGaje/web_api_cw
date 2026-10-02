// Local development entry point (npm run dev / npm start). Vercel does not use this file: it imports
// src/app.js directly and runs each request as a serverless function.
const app = require('./app');
const config = require('./config');

app.listen(config.port, (error) => {
  if (error) throw error; // for example, the port is already in use
  console.log(`SLSEA API listening on http://localhost:${config.port}`);
});
