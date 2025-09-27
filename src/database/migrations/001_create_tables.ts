import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create transactions table
  await knex.schema.createTable('transactions', (table) => {
    table.increments('id').primary();
    table.string('hash').notNullable().unique();
    table.integer('chain_id').notNullable();
    table.string('from_address').notNullable();
    table.string('to_address').notNullable();
    table.string('token_address').notNullable();
    table.string('token_symbol').notNullable();
    table.string('amount').notNullable(); // Store as string to handle big numbers
    table.string('relayer_fee').notNullable();
    table.decimal('fee_usd', 10, 4).notNullable();
    table.string('nonce').notNullable();
    table.bigInteger('deadline').notNullable();
    table.text('signature').notNullable();
    table.enum('status', ['pending', 'confirmed', 'failed']).defaultTo('pending');
    table.bigInteger('block_number').nullable();
    table.string('gas_used').nullable();
    table.string('effective_gas_price').nullable();
    table.text('error_message').nullable();
    table.timestamps(true, true);
    
    // Indexes
    table.index(['hash']);
    table.index(['from_address']);
    table.index(['chain_id']);
    table.index(['status']);
    table.index(['created_at']);
    table.index(['chain_id', 'from_address', 'nonce'], 'idx_chain_from_nonce');
  });

  // Create daily_volumes table
  await knex.schema.createTable('daily_volumes', (table) => {
    table.increments('id').primary();
    table.integer('chain_id').notNullable();
    table.date('date').notNullable();
    table.decimal('volume_usd', 15, 4).defaultTo(0);
    table.integer('transaction_count').defaultTo(0);
    table.timestamps(true, true);
    
    // Unique constraint on chain_id and date
    table.unique(['chain_id', 'date']);
    
    // Indexes
    table.index(['date']);
    table.index(['chain_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('daily_volumes');
  await knex.schema.dropTableIfExists('transactions');
}