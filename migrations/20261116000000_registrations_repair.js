/**
 * Rattrapage du schéma des inscriptions en deux phases (play test 4, 2026-11-16).
 *
 * `registrations_open` et `pending_registrations` ont été ajoutés directement dans la migration
 * `init`. Une base créée avant cet ajout a déjà `init` marquée comme appliquée : knex ne la rejoue
 * pas, et le bot plante au démarrage (`SQLITE_ERROR: no such table: pending_registrations`).
 * Cette migration crée ce qui manque et ne touche à rien sur une base déjà à jour.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  if (!(await knex.schema.hasColumn('app_state', 'registrations_open'))) {
    await knex.schema.alterTable('app_state', function(table) {
      table.boolean('registrations_open').defaultTo(true);
    });
  }

  if (!(await knex.schema.hasTable('pending_registrations'))) {
    // Même schéma que dans `init`.
    await knex.schema.createTable('pending_registrations', function(table) {
      table.string('discord_id').primary();
      table.integer('team_id').unsigned().references('id').inTable('teams').onDelete('CASCADE');
      table.string('pseudo').notNullable();
      table.string('channel_id').notNullable();
      table.string('message_id').notNullable();
      table.bigInteger('created_at').notNullable();
    });
  }
};

/**
 * Rien à défaire : la colonne et la table appartiennent à `init`, qui les supprime dans son `down`.
 *
 * @returns { Promise<void> }
 */
exports.down = async function() {};
