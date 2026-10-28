const { SlashCommandBuilder, PermissionsBitField, ChannelType, MessageFlags } = require('discord.js');
const { runMinecraftCommands } = require('../utils/mc-queue');
const { replyError, buildInscriptionMessage, MC_PENDING } = require('../utils/messages');
const { unregisterUser } = require('../utils/unregister');

async function updateInscriptionMessages(knex, client) {
    const messages = await knex('inscription_messages').select('*');
    const teams = await knex('teams').select('*');

    for (const msg of messages) {
        try {
            const channel = await client.channels.fetch(msg.channel_id);
            const message = await channel.messages.fetch(msg.message_id);
            await message.edit(buildInscriptionMessage(teams));
        } catch (error) {
            console.error('Erreur mise à jour message:', error);
        }
    }
}

module.exports = {
    updateInscriptionMessages,
    data: new SlashCommandBuilder()
        .setName('team')
        .setDescription('Gère les équipes')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Liste les équipes'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Ajoute une équipe')
                .addStringOption(option =>
                    option.setName('nom')
                        .setDescription('Nom de l\'équipe')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Supprime une équipe')
                .addStringOption(option =>
                    option.setName('nom')
                        .setDescription('Nom de l\'équipe')
                        .setAutocomplete(true)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Affiche les statistiques d\'inscription')),

    // Propose les équipes existantes dont le nom contient la saisie (25 max, limite Discord)
    async autocomplete(interaction, knex) {
        const focused = interaction.options.getFocused().toLowerCase();
        const teams = await knex('teams')
            .whereRaw('instr(lower(label), ?) > 0', focused)
            .orderBy('label')
            .limit(25);
        await interaction.respond(teams.map(team => ({ name: team.label, value: team.label })));
    },

    async execute(interaction, knex, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            const teams = await knex('teams').select('*');
            if (teams.length === 0) {
                await interaction.reply({ content: 'Aucune équipe configurée', flags: MessageFlags.Ephemeral });
            } else {
                const list = teams.map(t => `• **${t.label}** - <@&${t.role_id}>`).join('\n');
                await interaction.reply({ content: `**Équipes:**\n${list}`, flags: MessageFlags.Ephemeral });
            }
        }

        if (subcommand === 'add') {
            const nom = interaction.options.getString('nom');

            // Mêmes règles que BetterTeams (allowedChars, min/maxTeamLength), sinon `teama create` échoue côté Minecraft
            if (!/^[A-Za-z0-9'._-]{2,20}$/.test(nom)) {
                await interaction.reply({ content: `❌ Nom d'équipe invalide : 2 à 20 caractères, lettres, chiffres, \`'\`, \`.\`, \`_\`, et \`-\` uniquement`, flags: MessageFlags.Ephemeral });
                return;
            }

            const existingTeam = await knex('teams').whereRaw('lower(label) = ?', nom.toLowerCase()).first();
            if (existingTeam) {
                await interaction.reply({ content: `❌ L'équipe **${existingTeam.label}** existe déjà`, flags: MessageFlags.Ephemeral });
                return;
            }

            // Le menu du formulaire d'inscription est limité à 25 options par Discord
            const { count } = await knex('teams').count('* as count').first();
            if (count >= 25) {
                await interaction.reply({ content: '❌ Maximum 25 équipes : c\'est la limite du menu de choix d\'équipe de Discord', flags: MessageFlags.Ephemeral });
                return;
            }

            // Éléments Discord créés, à supprimer si une étape échoue
            const created = [];

            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                // 1. Créer le rôle Discord
                const role = await interaction.guild.roles.create({
                    name: nom,
                    reason: `Création automatique pour l'équipe ${nom}`
                });
                created.push(role);

                // 2. Créer la catégorie privée
                const category = await interaction.guild.channels.create({
                    name: nom,
                    type: ChannelType.GuildCategory,
                    permissionOverwrites: [
                        {
                            id: interaction.guild.roles.everyone,
                            deny: [PermissionsBitField.Flags.ViewChannel],
                        },
                        {
                            id: role.id,
                            allow: [PermissionsBitField.Flags.ViewChannel],
                        }
                    ],
                });
                created.push(category);

                // 3. Créer le salon textuel "général"
                const textChannel = await interaction.guild.channels.create({
                    name: 'général',
                    type: ChannelType.GuildText,
                    parent: category.id,
                });
                created.push(textChannel);

                // 4. Créer le salon vocal
                const voiceChannel = await interaction.guild.channels.create({
                    name: 'Créer un salon',
                    type: ChannelType.GuildVoice,
                    parent: category.id,
                });
                created.push(voiceChannel);

                // 5. Ajouter le salon vocal comme trigger channel
                await knex('trigger_channels').insert({ channel_id: voiceChannel.id });

                // 6. Enregistrer l'équipe en base de données
                await knex('teams').insert({
                    label: nom,
                    role_id: role.id,
                    category_id: category.id
                });

                // 7. Mettre à jour les messages d'inscription
                await updateInscriptionMessages(knex, client);

                // 8. Envoyer la commande Minecraft
                const sent = await runMinecraftCommands(knex, [`teama create ${nom}`]);

                await interaction.editReply({
                    content: `✅ Équipe **${nom}** créée avec succès!\n` +
                             `- Rôle: <@&${role.id}>\n` +
                             `- Catégorie: ${category.name}\n` +
                             `- Salon vocal ajouté comme trigger channel` +
                             (sent ? '' : `\n${MC_PENDING}`)
                });
            } catch (error) {
                console.error('Erreur création équipe:', error);

                // Annuler ce qui a été créé (salons avant la catégorie, rôle en dernier)
                const ids = created.map(item => item.id);
                for (const item of created.reverse()) {
                    await item.delete().catch(deleteError => console.error('Erreur annulation:', deleteError));
                }
                await knex('trigger_channels').whereIn('channel_id', ids).delete().catch(console.error);
                await knex('teams').whereIn('role_id', ids).delete().catch(console.error);

                await replyError(interaction, error);
            }
        }

        if (subcommand === 'remove') {
            const nom = interaction.options.getString('nom');

            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                // 1. Récupérer les infos de l'équipe
                const team = await knex('teams').whereRaw('lower(label) = ?', nom.toLowerCase()).first();

                if (!team) {
                    await interaction.editReply({ content: `Équipe **${nom}** non trouvée` });
                    return;
                }

                // 2. Désincrire tous les utilisateurs de l'équipe
                const teamUsers = await knex('users').where('team_id', team.id).select('*');
                let sent = true;
                for (const user of teamUsers) {
                    sent = await unregisterUser(interaction.guild, knex, user) && sent;
                }

                // 3. Supprimer la catégorie et tous ses canaux (si elle existe)
                if (team.category_id) {
                    try {
                        const category = await interaction.guild.channels.fetch(team.category_id);
                        if (category) {
                            // Récupérer tous les canaux de la catégorie
                            const channelsInCategory = interaction.guild.channels.cache.filter(
                                ch => ch.parentId === category.id
                            );

                            // Supprimer les trigger channels de la BDD d'abord
                            for (const [, channel] of channelsInCategory) {
                                if (channel.type === ChannelType.GuildVoice) {
                                    await knex('trigger_channels').where('channel_id', channel.id).delete();
                                }
                            }

                            // Ensuite supprimer les canaux Discord
                            for (const [, channel] of channelsInCategory) {
                                await channel.delete();
                            }

                            // Supprimer la catégorie
                            await category.delete();
                        }
                    } catch (channelError) {
                        console.error('Erreur suppression catégorie:', channelError);
                    }
                }

                // 4. Supprimer le rôle Discord
                try {
                    const role = await interaction.guild.roles.fetch(team.role_id);
                    if (role) {
                        await role.delete();
                    }
                } catch (roleError) {
                    console.error('Erreur suppression rôle:', roleError);
                }

                // 5. Supprimer l'équipe de la base de données
                await knex('teams').where('id', team.id).delete();

                // 6. Mettre à jour les messages d'inscription
                await updateInscriptionMessages(knex, client);

                // 7. Envoyer la commande Minecraft
                sent = await runMinecraftCommands(knex, [`teama disband ${team.label}`]) && sent;

                await interaction.editReply({
                    content: `✅ Équipe **${team.label}** supprimée avec succès!\n` +
                             `- ${teamUsers.length} utilisateur(s) désinscrit(s)\n` +
                             `- Rôle supprimé\n` +
                             `- Catégorie et canaux supprimés\n` +
                             `- Trigger channels retirés de la BDD` +
                             (sent ? '' : `\n${MC_PENDING}`)
                });
            } catch (error) {
                console.error('Erreur suppression équipe:', error);
                await replyError(interaction, error);
            }
        }

        if (subcommand === 'stats') {
            try {
                const users = await knex('users')
                    .leftJoin('teams', 'users.team_id', 'teams.id')
                    .select('users.discord_id', 'teams.label as team_label', 'teams.role_id as team_role_id');

                const { inscrit_role_id: inscritRoleId } = await knex('app_state').first();

                const statsByTeam = {};
                users.forEach(u => {
                    const teamKey = u.team_label || 'Sans équipe';
                    if (!statsByTeam[teamKey]) {
                        statsByTeam[teamKey] = {
                            count: 0,
                            roleId: u.team_role_id
                        };
                    }
                    statsByTeam[teamKey].count++;
                });

                const allMembers = await interaction.guild.members.fetch();
                const nonInscrits = allMembers.filter(member => {
                    return !member.roles.cache.has(inscritRoleId) && !member.user.bot;
                }).size;

                const sections = Object.keys(statsByTeam).sort().map(team => {
                    const teamData = statsByTeam[team];
                    const teamDisplay = teamData.roleId ? `<@&${teamData.roleId}>` : `**${team}**`;
                    return `${teamDisplay} : ${teamData.count}`;
                });

                sections.push(`**Non inscrits** : ${nonInscrits}`);

                await interaction.reply({ content: `**Statistiques d'inscription:**\n\n${sections.join('\n')}`, flags: MessageFlags.Ephemeral });
            } catch (error) {
                await replyError(interaction, error);
            }
        }
    }
};
