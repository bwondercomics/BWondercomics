#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/srv/bw-quality/deploy/namecheap-ddns.env}"

if [[ ! -r "$ENV_FILE" ]]; then
  echo "namecheap-ddns: missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${NC_DDNS_DOMAIN:?NC_DDNS_DOMAIN is required}"
: "${NC_DDNS_HOST:?NC_DDNS_HOST is required}"
: "${NC_DDNS_PASSWORD:?NC_DDNS_PASSWORD is required}"

current_ip="$(curl -4 -fsSL --max-time 10 https://api.ipify.org)"

if [[ ! "$current_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "namecheap-ddns: invalid IPv4 from public-IP service: $current_ip" >&2
  exit 1
fi

response="$(
  curl -4 -fsS --max-time 20 --get "https://dynamicdns.park-your-domain.com/update" \
    --data-urlencode "host=$NC_DDNS_HOST" \
    --data-urlencode "domain=$NC_DDNS_DOMAIN" \
    --data-urlencode "password=$NC_DDNS_PASSWORD" \
    --data-urlencode "ip=$current_ip"
)"

if ! grep -q "<ErrCount>0</ErrCount>" <<<"$response" || ! grep -q "<Done>true</Done>" <<<"$response"; then
  echo "namecheap-ddns: update failed for ${NC_DDNS_HOST}.${NC_DDNS_DOMAIN} -> $current_ip" >&2
  echo "$response" >&2
  exit 1
fi

echo "namecheap-ddns: updated ${NC_DDNS_HOST}.${NC_DDNS_DOMAIN} -> $current_ip"
