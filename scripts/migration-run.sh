#!/bin/bash

set -e

# exit fit there is no migrations name provided
cd api
echo "Running migrations..."

npx typeorm-ts-node-commonjs migration:run -d typeorm-local.ts
npx typeorm-ts-node-commonjs migration:revert -d typeorm-local.ts
npx typeorm-ts-node-commonjs migration:run -d typeorm-local.ts

npx typeorm-ts-node-commonjs migration:run -d typeorm-local-postgres.ts
npx typeorm-ts-node-commonjs migration:revert -d typeorm-local-postgres.ts
npx typeorm-ts-node-commonjs migration:run -d typeorm-local-postgres.ts

npx typeorm-ts-node-commonjs migration:run -d typeorm-local-mssql.ts
npx typeorm-ts-node-commonjs migration:revert -d typeorm-local-mssql.ts 
npx typeorm-ts-node-commonjs migration:run -d typeorm-local-mssql.ts
