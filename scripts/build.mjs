import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(root, "index.html"), resolve(dist, "index.html"));
await cp(resolve(root, "src"), resolve(dist, "src"), { recursive: true });
await cp(resolve(root, "public"), resolve(dist, "public"), { recursive: true });
await writeFile(resolve(dist, ".nojekyll"), "\n");

console.log("Built static game into dist/");
