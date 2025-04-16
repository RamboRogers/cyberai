#!/bin/bash
VERSION="0.1.0"
rm -rf bins/*
mkdir -p bins

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found"
    exit 1
fi

# Source the .env file
source .env

# Build for current platform
echo "Building for $(go env GOOS)/$(go env GOARCH)..."
go build -ldflags="${LDFLAGS}" -o bins/cyberai-$(go env GOOS)-$(go env GOARCH) cmd/cyberai/main.go

# Build for Linux AMD64
echo "Building for Linux AMD64..."
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
  go build -ldflags="${LDFLAGS}" \
  -o bins/cyberai-linux-amd64 cmd/cyberai/main.go

# Build for Linux ARM64
echo "Building for Linux ARM64..."
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 \
  go build -ldflags="${LDFLAGS}" \
  -o bins/cyberai-linux-arm64 cmd/cyberai/main.go

# Build for Darwin AMD64
echo "Building for Darwin AMD64..."
GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 \
  go build -ldflags="${LDFLAGS}" \
  -o bins/cyberai-darwin-amd64 cmd/cyberai/main.go

# Build for Darwin ARM64
echo "Building for Darwin ARM64..."
GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 \
  go build -ldflags="${LDFLAGS}" \
  -o bins/cyberai-darwin-arm64 cmd/cyberai/main.go

# Generate combined checksums file
echo "Generating combined SHA256SUMS file..."
cd bins
shasum -a 256 cyberai-* | grep -v '\.sha256' > SHA256SUMS
cd -

echo "Build complete!"

read -p "Push to Docker Hub? (y/n): " push
if [ "$push" = "y" ]; then
  # Building Docker Image
  echo "Building for Linux platform..."
  docker buildx build \
    --push \
    --platform linux/amd64,linux/arm64 \
    -t mattrogers/cyberai:latest \
    -t mattrogers/cyberai:${VERSION} \
    -f Dockerfile.multi .
fi