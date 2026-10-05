// All configuration comes from environment variables, so no secret is ever written into the code or the repo.
// Locally they are loaded from .env (see the npm scripts); on Vercel they are set in the project settings.

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing environment variable ${name}. Set it in .env locally, or in the Vercel project settings.`);
    process.exit(1);
  }
  return value;
}

module.exports = {
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  port: Number(process.env.PORT) || 3000,
};
