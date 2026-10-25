/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('teams', function(table) {
    table.increments('id').primary();
    table.string('label').notNullable().unique(); // Lycan, Minet, Hypnos, etc.
    table.string('role_id').notNullable(); // Discord role ID
    table.string('category_id'); // Discord category ID
    table.timestamps(true, true);
  });

  await knex.schema.createTable('users', function(table) {
    table.string('discord_id').primary();
    table.string('minecraft_username');
    table.integer('team_id').unsigned().references('id').inTable('teams').onDelete('SET NULL');
  });

  await knex.schema.createTable('trigger_channels', function(table) {
    table.string('channel_id').primary();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('temp_channels', function(table) {
    table.string('channel_id').primary();
    table.string('owner_id').notNullable(); // Discord ID du créateur
    table.timestamps(true, true);
  });

  await knex.schema.createTable('inscription_messages', function(table) {
    table.increments('id').primary();
    table.string('channel_id').notNullable();
    table.string('message_id').notNullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('app_state', function(table) {
    table.increments('id').primary();
    table.boolean('release').defaultTo(false);
    table.string('inscrit_role_id'); // Rôle "Inscrit", défini par /setup
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('app_state');
  await knex.schema.dropTable('inscription_messages');
  await knex.schema.dropTable('temp_channels');
  await knex.schema.dropTable('trigger_channels');
  await knex.schema.dropTable('users');
  await knex.schema.dropTable('teams');
};
