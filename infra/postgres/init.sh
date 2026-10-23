#!/bin/sh
# Runs once on an empty PostgreSQL data directory. Creates the Forgejo role and
# database from the same .env values the Forgejo container uses, so the two
# services cannot drift. The values are trusted deployment configuration.
set -eu

: "${FORGEJO_DB_NAME:?FORGEJO_DB_NAME is required}"
: "${FORGEJO_DB_USER:?FORGEJO_DB_USER is required}"
: "${FORGEJO_DB_PASSWORD:?FORGEJO_DB_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=forgejo_db="$FORGEJO_DB_NAME" \
  --set=forgejo_user="$FORGEJO_DB_USER" \
  --set=forgejo_password="$FORGEJO_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'forgejo_user', :'forgejo_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'forgejo_user')
\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'forgejo_db', :'forgejo_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'forgejo_db')
\gexec
SQL
