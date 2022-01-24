# shademap-image
Static image generation for ShadeMap

# Setup

Create .env file to configure ShadeMap URL, server PORT, and DELIMITED

```
URL=/og-image
DELIMITER=@
PORT=8080
```

# Run

```
./redeploy.sh
```

# Helpful commands

```
yarn build
nohup node dist/og-image-server.js &
kill $(ps -aux | grep "node dist/og-image-server.js" | awk '{print $2; exit}')
```

