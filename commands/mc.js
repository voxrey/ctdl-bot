const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const { replyError } = require('../utils/messages');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mc')
        .setDescription('Commandes Minecraft du bot')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('pending')
                .setDescription('Affiche les commandes en attente du retour du serveur Minecraft')),

    async execute(interaction, knex) {
        try {
            const pending = await knex('mc_commands').orderBy('id');
            if (pending.length === 0) {
                await interaction.reply({ content: 'Aucune commande Minecraft en attente', flags: MessageFlags.Ephemeral });
                return;
            }

            // Les 20 plus anciennes, pour rester sous les 2000 caractères d'un message
            const lines = pending.slice(0, 20).map(c => `${c.created_at}  ${c.command}`);
            const more = pending.length > 20 ? `\n… et ${pending.length - 20} autre(s)` : '';
            await interaction.reply({
                content: `**${pending.length} commande(s) en attente :**\n\`\`\`\n${lines.join('\n')}\n\`\`\`${more}`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            await replyError(interaction, error);
        }
    }
};
