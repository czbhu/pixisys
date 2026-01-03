#!/bin/bash

# Automatikus szinkronizálás script
# Ez a script automatikusan hozzáadja és commitolja a változásokat

echo "🔄 Automatikus szinkronizálás indítása..."

# Git status ellenőrzése
if git diff --quiet && git diff --cached --quiet; then
    echo "✅ Nincsenek változások a commitoláshoz"
    exit 0
fi

# Változások hozzáadása
echo "📁 Változások hozzáadása..."
git add .

# Commit üzenet generálása
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
COMMIT_MSG="Auto sync: $TIMESTAMP"

# Commit létrehozása
echo "💾 Commit létrehozása: $COMMIT_MSG"
git commit -m "$COMMIT_MSG"

# Remote repository ellenőrzése
if git remote | grep -q origin; then
    echo "🚀 Változások küldése a remote repository-ba..."
    git push origin main
else
    echo "⚠️  Nincs remote repository beállítva"
    echo "   Használd: git remote add origin <repository-url>"
fi

echo "✅ Szinkronizálás befejezve!"
