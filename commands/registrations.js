const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');

// Ouvre/ferme la phase d'inscription (réunion 2026-11-13).
// Ouverte : le joueur choisit une équipe et rejoint directement.
// Fermée : le choix d'équipe crée une demande à confirmer par l'équipe.
module.exports = {
    data: new SlashCommandBuilder()
        .setName('registrations')
        .setDescription('Gère la phase d\'inscription (ouverte / sur confirmation)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(s => s.setName('status').setDescription('Affiche la phase d\'inscription actuelle'))
        .addSubcommand(s => s.setName('open').setDescription('Inscription directe : rejoindre une équipe sans confirmation'))
        .addSubcommand(s => s.setName('close').setDescription('Inscription sur confirmation : chaque choix crée une demande à valider')),

    async execute(interaction, knex) {
        const sub = interaction.options.getSubcommand();
        const appState = await knex('app_state').first();
        const open = appState?.registrations_open ?? true;

        if (sub === 'status') {
            await interaction.reply({
                content: open
                    ? '🟢 Inscriptions **ouvertes** : les joueurs rejoignent une équipe directement.'
                    : '🔒 Inscriptions **fermées** : chaque choix d\'équipe crée une demande à confirmer par l\'équipe.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const target = sub === 'open';
        if (open === target) {
            await interaction.reply({
                content: target ? 'Les inscriptions sont déjà ouvertes.' : 'Les inscriptions sont déjà fermées.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        await knex('app_state').where('id', appState.id).update({ registrations_open: target });
        await interaction.reply({
            content: target
                ? '🟢 Inscriptions **ouvertes** : les joueurs rejoignent une équipe directement.'
                : '🔒 Inscriptions **fermées** : chaque choix d\'équipe crée une demande que l\'équipe doit accepter.',
            flags: MessageFlags.Ephemeral
        });
    }
};
