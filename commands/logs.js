const { SlashCommandBuilder, PermissionsBitField, MessageFlags, ChannelType } = require('discord.js');
const { replyError } = require('../utils/messages');
const { logEvent } = require('../utils/logger');

// Définit (ou affiche) le salon où le bot journalise tout. Réservé aux admins du serveur Discord.
module.exports = {
    data: new SlashCommandBuilder()
        .setName('logs')
        .setDescription('Définit le salon de journalisation du bot')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addChannelOption(option =>
            option.setName('salon')
                .setDescription('Salon où envoyer les logs (vide : affiche le salon actuel)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false)),

    async execute(interaction, knex) {
        try {
            const channel = interaction.options.getChannel('salon');
            const appState = await knex('app_state').first();

            if (!channel) {
                const current = appState?.log_channel_id;
                await interaction.reply({
                    content: current ? `Salon de logs actuel : <#${current}>` : 'Aucun salon de logs défini. Utilise `/logs salon:#...`.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const me = interaction.guild.members.me;
            if (!channel.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages)) {
                await interaction.reply({ content: `❌ Le bot ne peut pas écrire dans <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
                return;
            }

            await knex('app_state').update({ log_channel_id: channel.id });
            await interaction.reply({ content: `Salon de logs défini sur <#${channel.id}>`, flags: MessageFlags.Ephemeral });
            await logEvent(interaction.client, knex, {
                category: 'systeme',
                action: 'salon de logs défini',
                actor: `<@${interaction.user.id}>`,
                detail: `<#${channel.id}>`,
            });
        } catch (error) {
            await replyError(interaction, error);
        }
    },
};
