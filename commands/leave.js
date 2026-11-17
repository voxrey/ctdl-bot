const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { runMinecraftCommands } = require('../utils/mc-queue');
const { replyError, MC_PENDING } = require('../utils/messages');
const { logEvent } = require('../utils/logger');

// Un joueur quitte son équipe depuis Discord (décision play test 6 : quitter se fait par le bot,
// pas en jeu). Il reste inscrit (compte Minecraft + rôle « Inscrit » conservés) et peut redemander
// une autre équipe via le formulaire. Confirmation par bouton pour éviter un départ accidentel.
module.exports = {
    data: new SlashCommandBuilder()
        .setName('quitter')
        .setDescription('Quitte ton équipe (tu restes inscrit et peux en rejoindre une autre)'),

    async execute(interaction, knex) {
        try {
            const user = await knex('users')
                .leftJoin('teams', 'users.team_id', 'teams.id')
                .where('users.discord_id', interaction.user.id)
                .select('users.minecraft_username', 'users.team_id', 'teams.label as team_label')
                .first();

            if (!user) {
                await interaction.reply({ content: 'Tu n\'es pas inscrit.', flags: MessageFlags.Ephemeral });
                return;
            }
            if (!user.team_id) {
                await interaction.reply({ content: 'Tu n\'es dans aucune équipe.', flags: MessageFlags.Ephemeral });
                return;
            }

            const confirm = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('leave_confirm').setLabel('Quitter l\'équipe').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('leave_cancel').setLabel('Annuler').setStyle(ButtonStyle.Secondary),
            );
            await interaction.reply({
                content: `Veux-tu vraiment quitter **${user.team_label}** ? Tu restes inscrit et pourras redemander une équipe.`,
                components: [confirm],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            await replyError(interaction, error);
        }
    },

    // Bouton de confirmation (routé depuis index.js). L'auteur du clic est le joueur qui quitte.
    async handleButton(interaction, knex, action) {
        if (action === 'cancel') {
            await interaction.update({ content: 'Départ annulé.', components: [] });
            return;
        }

        const user = await knex('users').where('discord_id', interaction.user.id).first();
        if (!user) {
            await interaction.update({ content: 'Tu n\'es pas inscrit.', components: [] });
            return;
        }
        if (!user.team_id) {
            await interaction.update({ content: 'Tu n\'es dans aucune équipe.', components: [] });
            return;
        }

        const oldTeam = await knex('teams').where('id', user.team_id).first();

        // Les commandes Minecraft peuvent dépasser les 3 s laissées par Discord
        await interaction.update({ content: 'Départ en cours…', components: [] });

        // Quitte l'équipe BetterTeams (et retire une éventuelle entrée en attente) ; en file si le serveur est éteint
        const sent = await runMinecraftCommands(knex, [`marche admin team clear ${user.minecraft_username}`]);

        await knex('users').where('discord_id', interaction.user.id).update({ team_id: null });

        try {
            const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
            if (member && oldTeam && member.roles.cache.has(oldTeam.role_id)) {
                await member.roles.remove(oldTeam.role_id);
            }
        } catch (roleError) {
            console.error(`Erreur retrait rôle équipe ${interaction.user.id}:`, roleError);
        }

        await logEvent(interaction.client, knex, {
            category: 'desinscription',
            action: 'quitte son équipe',
            actor: `<@${interaction.user.id}>`,
            detail: `**${user.minecraft_username}** · ${oldTeam ? `équipe **${oldTeam.label}**` : 'sans équipe'} (reste inscrit)`,
        });

        const label = oldTeam ? `**${oldTeam.label}**` : 'ton équipe';
        await interaction.editReply({ content: `Tu as quitté ${label}. Tu restes inscrit ; utilise le formulaire pour rejoindre une équipe.` + (sent ? '' : `\n${MC_PENDING}`) });
    },
};
