const minimumPasswordLength = 12;

function getDevelopmentSeedPassword(env = process.env) {
  if (env.NODE_ENV === "production") {
    throw new Error("The development seed is disabled in production.");
  }
  const password = env.DEV_ADMIN_PASSWORD;
  if (!password || password.length < minimumPasswordLength) {
    throw new Error("DEV_ADMIN_PASSWORD must be set to at least 12 characters before running the development seed.");
  }
  return password;
}

module.exports = { getDevelopmentSeedPassword };
