#!/bin/bash

set -e


# exit if there is no migrations name provided
if [ -z "$1" ]; then
  echo "Error: Migration name is required"
  echo "Usage: $0 <migration-name>"
  exit 1
fi

cd api
echo "Generating new migration '$1'"

npx typeorm-ts-node-commonjs migration:generate -d typeorm-local.ts ../db-migrations/sqlite/$1
npx typeorm-ts-node-commonjs migration:generate -d typeorm-local-postgres.ts ../db-migrations/postgres/$1
npx typeorm-ts-node-commonjs migration:generate -d typeorm-local-mssql.ts ../db-migrations/mssql/$1