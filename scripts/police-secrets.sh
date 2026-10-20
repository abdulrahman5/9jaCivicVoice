#!/usr/bin/env bash
# Generates the police stack's own secrets for one environment, on YOUR machine.
# Never run this in CI, and never paste the values into chat, issues or commits.
#
#   scripts/police-secrets.sh preview
#   scripts/police-secrets.sh production
#
# Writes one file per value to .police-secrets/<environment>/ (git-ignored), readable
# only by you, and refuses to overwrite: replacing STATUS_CODE_PEPPER or STATUS_LOOKUP_KEY
# breaks every existing status code, and a new key pair makes stored officer details
# unreadable. See docs/DEPLOY-POLICE.md for where each value goes.
set -euo pipefail

ENVIRONMENT="${1:-}"
case "$ENVIRONMENT" in
  preview | production) ;;
  *) echo "usage: scripts/police-secrets.sh preview|production" >&2; exit 2 ;;
esac
command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }

DIR="$(cd "$(dirname "$0")/.." && pwd)/.police-secrets/$ENVIRONMENT"
if [ -e "$DIR" ]; then
  echo "$DIR already exists. Refusing to overwrite existing secrets." >&2
  exit 1
fi
VERCEL_ENV="Preview"
[ "$ENVIRONMENT" = production ] && VERCEL_ENV="Production"
umask 077
mkdir -p "$DIR"

# Officer-details key pair: the Worker encrypts with the public key; only the web
# app's admin area holds the private key. WebCrypto needs PKCS#8 for the private key.
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$DIR/officer.pem" 2>/dev/null
openssl pkcs8 -topk8 -nocrypt -in "$DIR/officer.pem" -outform DER | base64 | tr -d '\n' > "$DIR/OFFICER_DETAILS_PRIVATE_KEY"
openssl pkey -in "$DIR/officer.pem" -pubout -outform DER | base64 | tr -d '\n' > "$DIR/OFFICER_DETAILS_PUBLIC_KEY"

openssl rand -base64 48 | tr -d '\n' > "$DIR/STATUS_CODE_PEPPER"
openssl rand -base64 48 | tr -d '\n' > "$DIR/STATUS_LOOKUP_KEY"
openssl rand -hex 32 | tr -d '\n' > "$DIR/POLICE_BRIDGE_SECRET"

cat <<EOF
Created $DIR

  File                          Goes to
  OFFICER_DETAILS_PUBLIC_KEY    GitHub environment police-$ENVIRONMENT (secret)
  STATUS_CODE_PEPPER            GitHub environment police-$ENVIRONMENT (secret)
  STATUS_LOOKUP_KEY             GitHub environment police-$ENVIRONMENT (secret)
  POLICE_BRIDGE_SECRET          GitHub environment police-$ENVIRONMENT (secret)
  OFFICER_DETAILS_PRIVATE_KEY   Vercel env var (the web app's $VERCEL_ENV environment) only
  officer.pem                   Nowhere online: keep an offline backup (USB or paper)

Copy a value without printing it, e.g. on macOS:  pbcopy < "$DIR/STATUS_CODE_PEPPER"
EOF
