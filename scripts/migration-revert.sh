#!/bin/bash

set -e

cd api
echo "Reverting migrations..."

npx typeorm-ts-node-commonjs migration:revert -d typeorm-local.ts
npx typeorm-ts-node-commonjs migration:revert -d typeorm-local-postgres.ts
npx typeorm-ts-node-commonjs migration:revert -d typeorm-local-mssql.ts
npx typeorm-ts-node-commonjs migration:revert -d typeorm-local-mysql.ts
