import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const OUT = new URL("../.out/", import.meta.url).pathname;
let built = null;

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
