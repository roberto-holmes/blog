#!/bin/bash

# Exit if any command fails
set -e

SRCS=""
SRCS=$SRCS" src/scripts/bloom/intro/intro.ts"
SRCS=$SRCS" src/scripts/sail.ts"
SRCS=$SRCS" src/scripts/general/music-theory/music-theory.ts"

function bundle {
	./node_modules/.bin/esbuild $SRCS --bundle --format=esm --outbase=src/scripts --outdir=public/scripts "--external:./ray/*" "$@"
}

if [ "$1" = "watch" ]; then
	echo "Watching"
	# Enable printing out the commands that were running
	# set -o xtrace
	bundle "--watch"
else
    # Build for release
	echo "Building WASM apps"
	cd src/scripts/bloom/ray
	wasm-pack build --target web --no-pack -d ../../../../public/scripts/bloom/intro/ray

	# Change paths in wasm applicaiton to the actual locations
	echo "Changing paths in WASM apps"
	sed -i -E "s/module_or_path = new URL\((['|\"].*\.wasm['|\"]), import\.meta\.url\);/module_or_path = new URL(\1, import.meta.url.replace(\/\\\\\/public\/g, \"\/blog\"));/" ../../../../public/scripts/bloom/intro/ray/ray_rs.js

	echo "Building custom scripts"
	cd ../../../..
	bundle "--minify"

	# Build base site
	echo "Building base site"
	npm run astro build
fi
