const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const { sendMinecraftCommand } = require('../utils/pterodactyl');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('user')
        .setDescription('Gère les utilisateurs inscrits')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Liste les utilisateurs inscrits'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Affiche les infos d\'un utilisateur')
                .addUserOption(option =>
                    option.setName('utilisateur')
                        .setDescription('Utilisateur à consulter')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('unregister')
                .setDescription('Désenregistre un utilisateur')
                .addUserOption(option =>
                    option.setName('utilisateur')
                        .setDescription('Utilisateur à désenregistrer')
                        .setRequired(true))),

    async execute(interaction, knex) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            try {
                const users = await knex('users')
                    .leftJoin('teams', 'users.team_id', 'teams.id')
                    .select('users.discord_id', 'users.minecraft_username', 'users.password', 'teams.label as team_label')
                    .orderBy('teams.label');

                if (users.length === 0) {
                    await interaction.reply({ content: 'Aucun utilisateur inscrit', flags: MessageFlags.Ephemeral });
                } else {
                    const usersByTeam = {};
                    users.forEach(u => {
                        const team = u.team_label || 'Sans équipe';
                        if (!usersByTeam[team]) {
                            usersByTeam[team] = [];
                        }
                        usersByTeam[team].push(u);
                    });

                    const sections = Object.keys(usersByTeam).map(team => {
                        const teamUsers = usersByTeam[team].map(u =>
                            `- <@${u.discord_id}> - **${u.minecraft_username}** - MDP: \`${u.password || 'N/A'}\``
                        ).join('\n');
                        return `**${team}**\n${teamUsers}`;
                    });

                    // Diviser en messages de max 2000 caractères
                    const messages = [];
                    let currentMessage = '**Utilisateurs inscrits:**\n\n';

                    for (const section of sections) {
                        // Si ajouter cette section dépasse 2000, envoyer le message actuel
                        if ((currentMessage + section + '\n\n').length > 2000) {
                            messages.push(currentMessage.trim());
                            currentMessage = section + '\n\n';
                        } else {
                            currentMessage += section + '\n\n';
                        }
                    }

                    // Ajouter le dernier message
                    if (currentMessage.trim()) {
                        messages.push(currentMessage.trim());
                    }

                    // Envoyer le premier message en reply, les autres en followUp
                    await interaction.reply({ content: messages[0], flags: MessageFlags.Ephemeral });
                    for (let i = 1; i < messages.length; i++) {
                        await interaction.followUp({ content: messages[i], flags: MessageFlags.Ephemeral });
                    }
                }
            } catch (error) {
                await interaction.reply({ content: `Erreur: ${error.message}`, flags: MessageFlags.Ephemeral });
            }
        }

        if (subcommand === 'info') {
            const user = interaction.options.getUser('utilisateur');

            try {
                const userData = await knex('users')
                    .leftJoin('teams', 'users.team_id', 'teams.id')
                    .where('users.discord_id', user.id)
                    .select('users.minecraft_username', 'users.password', 'teams.label as team_label', 'teams.role_id as team_role_id')
                    .first();

                if (!userData) {
                    await interaction.reply({ content: `Utilisateur <@${user.id}> non inscrit`, flags: MessageFlags.Ephemeral });
                    return;
                }

                const teamDisplay = userData.team_role_id
                    ? `<@&${userData.team_role_id}>`
                    : userData.team_label || 'Sans équipe';

                await interaction.reply({
                    content: `**Informations de <@${user.id}>**\n\n` +
                             `**Équipe:** ${teamDisplay}\n` +
                             `**Pseudo Minecraft:** ${userData.minecraft_username}\n` +
                             `**Mot de passe:** \`${userData.password || 'N/A'}\``,
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                await interaction.reply({ content: `Erreur: ${error.message}`, flags: MessageFlags.Ephemeral });
            }
        }

        if (subcommand === 'unregister') {
            const user = interaction.options.getUser('utilisateur');

            try {
                const userData = await knex('users').where('discord_id', user.id).first();

                if (!userData) {
                    await interaction.reply({ content: `Utilisateur <@${user.id}> non trouvé`, flags: MessageFlags.Ephemeral });
                    return;
                }

                const minecraftUsername = userData.minecraft_username;

                // Supprimer de la BDD
                await knex('users').where('discord_id', user.id).delete();

                // Désenregistrer et kick sur Minecraft
                try {
                    await sendMinecraftCommand(process.env.PT_SERVER_ID, `authme unregister ${minecraftUsername}`);
                    await sendMinecraftCommand(process.env.PT_SERVER_ID, `tteamunregister ${minecraftUsername}`);
                    await sendMinecraftCommand(process.env.PT_SERVER_ID, `kick ${minecraftUsername}`);
                } catch (error) {
                    console.error('Erreur commandes Minecraft:', error.message);
                }

                // Retirer les rôles Discord (le membre a pu quitter le serveur)
                const member = await interaction.guild.members.fetch(user.id).catch(() => null);
                if (member) {
                    const teams = await knex('teams').select('role_id');
                    const { inscrit_role_id: inscritRoleId } = await knex('app_state').first();

                    const rolesToRemove = [];
                    teams.forEach(t => {
                        const role = interaction.guild.roles.cache.get(t.role_id);
                        if (role && member.roles.cache.has(role.id)) {
                            rolesToRemove.push(role);
                        }
                    });

                    if (inscritRoleId && member.roles.cache.has(inscritRoleId)) {
                        rolesToRemove.push(inscritRoleId);
                    }

                    if (rolesToRemove.length > 0) {
                        await member.roles.remove(rolesToRemove);
                    }
                }

                await interaction.reply({ content: `Utilisateur <@${user.id}> (**${minecraftUsername}**) désenregistré` });
            } catch (error) {
                await interaction.reply({ content: `Erreur: ${error.message}`, flags: MessageFlags.Ephemeral });
            }
        }
    }
};
