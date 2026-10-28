const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const { unregisterUser } = require('../utils/unregister');
const { handleInscription } = require('../utils/inscription-handler');
const { runMinecraftCommands } = require('../utils/mc-queue');
const { replyError, MC_PENDING } = require('../utils/messages');
const teamCommand = require('./team');

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
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('register')
                .setDescription('Inscrit un utilisateur à sa place')
                .addUserOption(option =>
                    option.setName('utilisateur')
                        .setDescription('Utilisateur à inscrire')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('pseudo')
                        .setDescription('Pseudo Minecraft')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('equipe')
                        .setDescription('Équipe')
                        .setAutocomplete(true)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('team')
                .setDescription('Change un utilisateur d\'équipe')
                .addUserOption(option =>
                    option.setName('utilisateur')
                        .setDescription('Utilisateur à déplacer')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('equipe')
                        .setDescription('Nouvelle équipe')
                        .setAutocomplete(true)
                        .setRequired(true))),

    // Même liste d'équipes que /team remove
    autocomplete: teamCommand.autocomplete,

    async execute(interaction, knex) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            try {
                const users = await knex('users')
                    .leftJoin('teams', 'users.team_id', 'teams.id')
                    .select('users.discord_id', 'users.minecraft_username', 'teams.label as team_label')
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
                            `- <@${u.discord_id}> - **${u.minecraft_username}**`
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
                await replyError(interaction, error);
            }
        }

        if (subcommand === 'info') {
            const user = interaction.options.getUser('utilisateur');

            try {
                const userData = await knex('users')
                    .leftJoin('teams', 'users.team_id', 'teams.id')
                    .where('users.discord_id', user.id)
                    .select('users.minecraft_username', 'teams.label as team_label', 'teams.role_id as team_role_id')
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
                             `**Pseudo Minecraft:** ${userData.minecraft_username}`,
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                await replyError(interaction, error);
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

                // Les commandes Minecraft peuvent dépasser les 3 s laissées par Discord pour répondre
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const sent = await unregisterUser(interaction.guild, knex, userData);

                await interaction.editReply({ content: `Utilisateur <@${user.id}> (**${userData.minecraft_username}**) désenregistré` + (sent ? '' : `\n${MC_PENDING}`) });
            } catch (error) {
                await replyError(interaction, error);
            }
        }

        if (subcommand === 'register') {
            const user = interaction.options.getUser('utilisateur');
            const nom = interaction.options.getString('equipe');

            try {
                const team = await knex('teams').whereRaw('lower(label) = ?', nom.toLowerCase()).first();
                if (!team) {
                    await interaction.reply({ content: `Équipe **${nom}** non trouvée`, flags: MessageFlags.Ephemeral });
                    return;
                }
                const member = await interaction.guild.members.fetch(user.id).catch(() => null);
                if (!member) {
                    await interaction.reply({ content: `<@${user.id}> n'est pas sur le serveur Discord`, flags: MessageFlags.Ephemeral });
                    return;
                }

                await handleInscription(interaction, knex, team.id, interaction.options.getString('pseudo'), member);
            } catch (error) {
                await replyError(interaction, error);
            }
        }

        if (subcommand === 'team') {
            const user = interaction.options.getUser('utilisateur');
            const nom = interaction.options.getString('equipe');

            try {
                const userData = await knex('users').where('discord_id', user.id).first();
                if (!userData) {
                    await interaction.reply({ content: `Utilisateur <@${user.id}> non inscrit`, flags: MessageFlags.Ephemeral });
                    return;
                }
                const team = await knex('teams').whereRaw('lower(label) = ?', nom.toLowerCase()).first();
                if (!team) {
                    await interaction.reply({ content: `Équipe **${nom}** non trouvée`, flags: MessageFlags.Ephemeral });
                    return;
                }
                if (team.id === userData.team_id) {
                    await interaction.reply({ content: `<@${user.id}> est déjà dans **${team.label}**`, flags: MessageFlags.Ephemeral });
                    return;
                }

                const newRole = interaction.guild.roles.cache.get(team.role_id);
                if (!newRole?.editable) {
                    await interaction.reply({ content: `Rôle de **${team.label}** introuvable ou non attribuable par le bot`, flags: MessageFlags.Ephemeral });
                    return;
                }

                // Les commandes Minecraft peuvent dépasser les 3 s laissées par Discord pour répondre
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                await knex('users').where('discord_id', user.id).update({ team_id: team.id });

                // Le membre a pu quitter le serveur Discord : seule l'équipe Minecraft change alors
                const member = await interaction.guild.members.fetch(user.id).catch(() => null);
                if (member) {
                    const oldTeam = userData.team_id ? await knex('teams').where('id', userData.team_id).first() : null;
                    if (oldTeam && member.roles.cache.has(oldTeam.role_id)) {
                        await member.roles.remove(oldTeam.role_id);
                    }
                    await member.roles.add(newRole);
                }

                // Quitte l'ancienne équipe Minecraft et rejoint la nouvelle (à la prochaine connexion s'il est hors ligne)
                const sent = await runMinecraftCommands(knex, [`marche admin team set ${userData.minecraft_username} ${team.label}`]);

                await interaction.editReply({ content: `<@${user.id}> (**${userData.minecraft_username}**) déplacé dans **${team.label}**` + (sent ? '' : `\n${MC_PENDING}`) });
            } catch (error) {
                await replyError(interaction, error);
            }
        }
    }
};
