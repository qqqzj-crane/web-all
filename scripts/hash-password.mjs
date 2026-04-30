import { createHash, randomBytes } from "node:crypto";

const password = process.argv.slice(2).join(" ");

if (!password) {
  console.error("Usage: node scripts/hash-password.mjs <album-password>");
  process.exit(1);
}

const sessionSecret = randomBytes(32).toString("hex");
const passwordHash = createHash("sha256").update(password).digest("hex");

console.log(`ALBUM_PASSWORD_HASH=sha256:${passwordHash}`);
console.log(`SESSION_SECRET=${sessionSecret}`);
