const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const { replyError, buildInscriptionMessage } = require('../utils/messages');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Envoie le formulaire d\'inscription')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Salon où envoyer le formulaire')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role_inscrit')
                .setDescription('Rôle "Inscrit" à donner')
                .setRequired(true)),

    async execute(interaction, knex) {
        const channel = interaction.options.getChannel('channel');
        const roleInscrit = interaction.options.getRole('role_inscrit');

        try {
            const teams = await knex('teams').select('*');
            if (teams.length === 0) {
                await interaction.reply({ content: 'Aucune équipe configurée', flags: MessageFlags.Ephemeral });
                return;
            }

            const message = await channel.send(buildInscriptionMessage(teams));
            await knex('inscription_messages').insert({
                channel_id: channel.id,
                message_id: message.id
            });
            await knex('app_state').update({ inscrit_role_id: roleInscrit.id });
            await interaction.reply({ content: `Formulaire envoyé dans <#${channel.id}>`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            await replyError(interaction, error);
        }
    }
};
