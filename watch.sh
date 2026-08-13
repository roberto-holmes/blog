#!/bin/bash

SRCS=""
SRCS=$SRCS" src/scripts/bloom/intro/intro.ts"
SRCS=$SRCS" src/scripts/sail.ts"
SRCS=$SRCS" src/scripts/general/music-theory/music-theory.ts"

# Enable printing out the commands that were running
set -o xtrace

# If we do this, we don't need to use tsc to transpile typescript to javascript
# ./node_modules/.bin/esbuild $SRCS --bundle --format=esm --outbase=src/scripts --outdir=public/scripts "--external:./ray/*"
./node_modules/.bin/esbuild $SRCS --bundle --format=esm --outbase=src/scripts --outdir=public/scripts "--external:./ray/*" --watch