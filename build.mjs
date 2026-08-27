import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";

const result = await build({
  entryPoints: ["src/main.jsx"],
  bundle: true,
  minify: true,
  format: "iife",
  write: false,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
});

let js = result.outputFiles[0].text;
// keep inline <script> valid
js = js.replaceAll("</script", "<\\/script");

const template = readFileSync("template.html", "utf8");
const html = template.replace("/*__BUNDLE__*/", () => js);
writeFileSync("index.html", html, "utf8");
console.log("index.html written:", (html.length / 1024).toFixed(0), "KB");
