#!/usr/bin/env bash
set -euo pipefail

# ── Config ──
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# ── Messaggio commit (argomento o prompt) ──
if [ $# -ge 1 ]; then
  MSG="$*"
else
  echo -n "📝 Descrizione modifica: "
  read -r MSG
fi

if [ -z "$MSG" ]; then
  echo "❌ Nessuna descrizione fornita."
  exit 1
fi

# ── Incrementa versione patch ──
CURRENT=$(node -p "require('./package.json').version")
IFS='.' read -r MAJ MIN PAT <<< "$CURRENT"
PAT=$((PAT + 1))
NEXT="$MAJ.$MIN.$PAT"

echo ""
echo "🚀 Release v${NEXT}"
echo "   ${MSG}"
echo ""

# ── 1. Aggiorna versione ──
node -e "
const p = require('./package.json');
p.version = '${NEXT}';
require('fs').writeFileSync('./package.json', JSON.stringify(p, null, 2) + '\n');
"
echo "✅ Versione: ${CURRENT} → ${NEXT}"

# ── 2. Build ──
echo "🔨 Build..."
npm run build

# ── 3. Commit ──
echo "📦 Commit..."
git add -A
git commit -m "release: v${NEXT} — ${MSG}"

# ── 4. Push ──
echo "⬆️  Push..."
git push

# ── 5. Deploy ──
echo "🌐 Deploy su Vercel..."
NODE_TLS_REJECT_UNAUTHORIZED=0 npx vercel --prod

echo ""
echo "🎉 Release v${NEXT} completata!"
