import neo4j, { type Driver } from "neo4j-driver";

// Cache the driver on the global object so Next.js dev hot-reloads don't leak
// a new connection pool on every request.
const globalForNeo4j = global as unknown as { _neo4jDriver?: Driver };

export function getDriver(): Driver {
  if (!globalForNeo4j._neo4jDriver) {
    const uri = process.env.NEO4J_URI;
    const user = process.env.NEO4J_USER;
    const password = process.env.NEO4J_PASSWORD;

    if (!uri || !user || !password) {
      throw new Error(
        "Missing NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD. Add them to .env.local.",
      );
    }

    globalForNeo4j._neo4jDriver = neo4j.driver(
      uri,
      neo4j.auth.basic(user, password),
      // Return plain JS numbers for integer properties (e.g. line numbers).
      { disableLosslessIntegers: true },
    );
  }
  return globalForNeo4j._neo4jDriver;
}
