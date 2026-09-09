import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// node --test runs each test FILE in its own process. A shared output
// directory means one process rmSync's the tree another is reading, so
// each process gets its own and cleans up after itself.
const OUT = new URL(`../.out/${process.pid}/`, import.meta.url).pathname;
let built = null;

process.on("exit", () => rmSync(OUT, { recursive: true, force: true }));

export async function buildSite() {
  if (built) return built;
  rmSync(OUT, { recursive: true, force: true });
  execFileSync("zola", ["build", "--output-dir", OUT, "--force"], {
    cwd: new URL("../../", import.meta.url).pathname,
    stdio: "pipe",
  });
  built = {
    dir: OUT,
    read: (p) => readFileSync(join(OUT, p), "utf8"),
    exists: (p) => existsSync(join(OUT, p)),
  };
  return built;
}
