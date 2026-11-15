// Local Postgres without Docker. Matches DATABASE_URL in .env.example (port 5433).
// Usage: npm run db:start  (leave running in its own terminal)
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const dir = "./.pgdata";
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "ham",
  password: "ham_dev_password",
  port: 5433,
  persistent: true,
  // Windows defaults to WIN1252, which rejects emoji and non-Latin names.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

if (!existsSync(dir)) {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("hireamate");
} else {
  await pg.start();
}
console.log("Postgres running on localhost:5433 (Ctrl+C to stop)");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
