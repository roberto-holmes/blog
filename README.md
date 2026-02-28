# Blog

## WASM

Experimenting with building a wasm application in Rust and integrating it with an astro blog post

build with `wasm-pack build --target web --no-pack -d ../../../../public/scripts/bloom/intro`
build with `wasm-pack build --target web -d ../../../../public/scripts/bloom/intro`

module_or_path = new URL\((['|"].\*\.wasm['|"]), import\.meta\.url\);
module_or_path = new URL(\1, import.meta.url.replace(/\/public/g, "/blog/public"));
module_or_path = new URL("intro_bg.wasm", import.meta.url.replace(/\/public/g, "/blog"));
in `async function __wbg_init(module_or_path)`

`sed -i -E "s/module_or_path = new URL\((['|\"].*\.wasm['|\"]), import\.meta\.url\);/module_or_path = new URL(\1, import.meta.url.replace(\/\\\\\/public\/g, \"\/blog\"));/" intro.js`
