# Exit if any command fails
set -e

echo "Building WASM apps"
cd src/scripts/bloom/ray
wasm-pack build --target web --no-pack -d ../../../../public/scripts/bloom/intro/ray

# Change paths in wasm applicaiton to the actual locations
echo "Changing paths in WASM apps"
sed -i -E "s/module_or_path = new URL\((['|\"].*\.wasm['|\"]), import\.meta\.url\);/module_or_path = new URL(\1, import.meta.url.replace(\/\\\\\/public\/g, \"\/blog\"));/" ../../../../public/scripts/bloom/intro/ray/ray_rs.js

echo "Building custom scripts"
cd ../..
# TODO: minify?
tsc

cd ../..
# Build base site
echo "Building base site"
astro build