#!/bin/bash
set -e

echo "=========================================="
echo "Building BWonderComics Production Assets"
echo "=========================================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Error: node_modules not found. Run 'npm install' first."
    exit 1
fi

# Run the build
echo "Building with Vite..."
npm run build

echo ""
echo "✅ Build complete!"
echo "📦 Optimized files are in: dist/"
echo ""
echo "To deploy changes:"
echo "  cd deploy && docker compose restart bwondercomics-api"
echo ""
