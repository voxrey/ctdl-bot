/**
 * Admins enregistrés et salon de logs (2026-11-18).
 *
 * `users.is_admin` : un admin s'enregistre via `/admin register` (compte AuthMe + op, sans équipe).
 * Il compte alors comme inscrit, donc un désinscrit (y compris un admin) n'est jamais op (deop à la
 * désinscription, voir utils/unregister.js).
 *
 * `app_state.log_channel_id` : salon Discord où le bot journalise tout (défini par `/logs`).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    if (!(await knex.schema.hasColumn('users', 'is_admin'))) {
        await knex.schema.alterTable('users', function(table) {
            table.boolean('is_admin').notNullable().defaultTo(false);
        });
    }

    if (!(await knex.schema.hasColumn('app_state', 'log_channel_id'))) {
        await knex.schema.alterTable('app_state', function(table) {
            table.string('log_channel_id');
        });
    }
};

exports.down = async function(knex) {
    if (await knex.schema.hasColumn('users', 'is_admin')) {
        await knex.schema.alterTable('users', function(table) {
            table.dropColumn('is_admin');
        });
    }
    if (await knex.schema.hasColumn('app_state', 'log_channel_id')) {
        await knex.schema.alterTable('app_state', function(table) {
            table.dropColumn('log_channel_id');
        });
    }
};
