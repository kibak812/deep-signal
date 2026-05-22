import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(root, "index.html"), resolve(dist, "index.html"));
const releaseFileFilter = (path) => {
  const projectPath = relative(root, path).replaceAll("\\", "/");
  if (basename(path) === ".DS_Store") return false;
  return projectPath !== "public/assets/generated-sources" && !projectPath.startsWith("public/assets/generated-sources/");
};
await cp(resolve(root, "src"), resolve(dist, "src"), { recursive: true, filter: releaseFileFilter });
await cp(resolve(root, "public"), resolve(dist, "public"), { recursive: true, filter: releaseFileFilter });
await writeFile(resolve(dist, ".nojekyll"), "\n");

console.log("Built static game into dist/");
