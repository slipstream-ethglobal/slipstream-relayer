import knex from 'knex';
import { config } from '../config';

const db = knex({
  client: 'postgresql',
  connection: config.DATABASE_URL,
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    tableName: 'knex_migrations',
    directory: './migrations'
  }
});

export { db };
export default db;