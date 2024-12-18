const dbConfig = {
  HOST: process.env.DB_HOST || "localhost",
  USER: process.env.DB_USER || "ktb9",
  PASSWORD: process.env.DB_PASSWORD || "!ktb1234",
  DB: process.env.DB_NAME || "traveldb",
  PORT: Number(process.env.DB_PORT) || 3306
};

export default dbConfig;
