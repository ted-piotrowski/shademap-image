#!/bin/bash
echo "Killing server"
kill $(ps -aux | grep "node dist/og-image-server.js" | awk '{print $2; exit}')
echo "Building new binary"
yarn build
echo "Starting server"
nohup node dist/og-image-server.js &

