const fs = require("fs");
const path = require("path");

const distDir = path.resolve(__dirname, "../dist");
const htmlPath = path.join(distDir, "index.html");
const jsPath = path.join(distDir, "bundle.js");

const html = fs.readFileSync(htmlPath, "utf8");
const js = fs.readFileSync(jsPath, "utf8");

const scriptTag = `<script>${js.replace(/<\/script>/gi, "<\\/script>")}</script>`;
const withoutBundleReference = html.replace(/<script defer="defer" src="bundle\.js"><\/script>/, "");
const inlinedHtml = withoutBundleReference.replace("</body>", `${scriptTag}</body>`);

fs.writeFileSync(htmlPath, inlinedHtml);
