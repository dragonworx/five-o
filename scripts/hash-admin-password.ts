// Generate an argon2id hash for the admin password.
// Usage: bun run scripts/hash-admin-password.ts "your password"
//    or: bun run scripts/hash-admin-password.ts   (prompts)
// Put the printed value in ADMIN_PASSWORD_HASH (env / /etc/five-o.env).

const password = process.argv[2] ?? prompt("Admin password:") ?? "";

if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const hash = await Bun.password.hash(password, {
  algorithm: "argon2id",
  memoryCost: 65536,
  timeCost: 2,
});

console.log("\nADMIN_PASSWORD_HASH=" + hash + "\n");
