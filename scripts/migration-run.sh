#!/bin/bash

set -e

cd api
echo "Running migrations..."

npx typeorm-ts-node-commonjs migration:run -d typeorm-local.ts
npx typeorm-ts-node-commonjs migration:run -d typeorm-local-postgres.ts
npx typeorm-ts-node-commonjs migration:run -d typeorm-local-mssql.ts
npx typeorm-ts-node-commonjs migration:run -d typeorm-local-mysql.ts
