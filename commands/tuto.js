const { SlashCommandBuilder, PermissionsBitField, MessageFlags, ChannelType } = require('discord.js');
const { replyError } = require('../utils/messages');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tuto')
        .setDescription('Définit le salon de tutoriel indiqué dans le message de bienvenue')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addChannelOption(option =>
            option.setName('salon')
                .setDescription('Salon de tutoriel (sans option : affiche le salon actuel)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum)
                .setRequired(false)),

    async execute(interaction, knex) {
        try {
            const channel = interaction.options.getChannel('salon');

            if (!channel) {
                const appState = await knex('app_state').first();
                const current = appState?.tuto_channel_id ? `<#${appState.tuto_channel_id}>` : 'aucun';
                await interaction.reply({ content: `Salon de tutoriel : ${current}`, flags: MessageFlags.Ephemeral });
                return;
            }

            await knex('app_state').update({ tuto_channel_id: channel.id });
            await interaction.reply({ content: `Salon de tutoriel : <#${channel.id}>`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            await replyError(interaction, error);
        }
    }
};
