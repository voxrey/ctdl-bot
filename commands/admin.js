const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const { generatePassword } = require('../utils/password');
const { passwordMessage, replyError, MC_UNAVAILABLE, MC_PENDING } = require('../utils/messages');
const { runMinecraftCommands } = require('../utils/mc-queue');
const { unregisterUser } = require('../utils/unregister');
const { logEvent } = require('../utils/logger');

// L'équipe des admins n'existe pas comme les autres : un admin s'enregistre lui-même (compte AuthMe + op,
// sans équipe). Réservé aux admins du serveur Discord (permission Administrator). Op = bypass require-team,
// donc un admin sans équipe peut se connecter. Un désinscrit n'est jamais op (deop par unregisterUser).
module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Gère les administrateurs Minecraft')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(s => s
            .setName('register')
            .setDescription('T\'enregistre comme admin Minecraft (compte AuthMe + op, sans équipe)')
            .addStringOption(o => o
                .setName('pseudo')
                .setDescription('Ton pseudo Minecraft')
                .setMinLength(3)
                .setMaxLength(16)
                .setRequired(true)))
        .addSubcommand(s => s
            .setName('unregister')
            .setDescription('Retire un admin (deop + désinscription)')
            .addUserOption(o => o
                .setName('utilisateur')
                .setDescription('Admin à retirer')
                .setRequired(true))),

    async execute(interaction, knex) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'register') {
            const pseudo = interaction.options.getString('pseudo');
            const discordId = interaction.user.id;

            try {
                // Règle des pseudos Minecraft ; empêche aussi d'injecter des arguments dans les commandes console
                if (!/^[A-Za-z0-9_]{3,16}$/.test(pseudo)) {
                    await interaction.reply({ content: 'Pseudo invalide : 3 à 16 caractères, lettres, chiffres et _ uniquement', flags: MessageFlags.Ephemeral });
                    return;
                }

                const existing = await knex('users').where('discord_id', discordId).first();
                if (existing) {
                    await interaction.reply({ content: `Tu es déjà enregistré (**${existing.minecraft_username}**). Fais \`/admin unregister\` d'abord pour changer de pseudo.`, flags: MessageFlags.Ephemeral });
                    return;
                }

                // Minecraft ne distingue pas les majuscules dans les pseudos
                const taken = await knex('users').whereRaw('lower(minecraft_username) = ?', pseudo.toLowerCase()).first();
                if (taken) {
                    await interaction.reply({ content: 'Ce pseudo est déjà pris', flags: MessageFlags.Ephemeral });
                    return;
                }

                // Les commandes Minecraft peuvent dépasser les 3 s laissées par Discord pour répondre
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                await knex('users').insert({ discord_id: discordId, minecraft_username: pseudo, team_id: null, is_admin: true });

                const password = generatePassword();
                try {
                    await runMinecraftCommands(knex, [`authme register ${pseudo} ${password}`, `authme password ${pseudo} ${password}`], 'direct');
                } catch (mcError) {
                    // Sans compte Minecraft, le mot de passe affiché serait inutilisable : on annule l'enregistrement
                    console.error('Erreur enregistrement admin Minecraft:', mcError.message);
                    await knex('users').where('discord_id', discordId).delete();
                    await interaction.editReply({ content: MC_UNAVAILABLE });
                    return;
                }

                // op en file : part au retour du serveur si besoin
                const sent = await runMinecraftCommands(knex, [`op ${pseudo}`]);

                await logEvent(interaction.client, knex, {
                    category: 'admin',
                    action: 'enregistrement admin',
                    actor: `<@${discordId}>`,
                    detail: `pseudo **${pseudo}** · op${sent ? '' : ' (en file)'}`,
                });

                await interaction.editReply({
                    content: `Tu es enregistré comme admin avec le pseudo **${pseudo}** et op sur le serveur.` +
                             (sent ? '' : `\n${MC_PENDING}`) + `\n\n${passwordMessage(password)}`,
                });
            } catch (error) {
                await replyError(interaction, error);
            }
            return;
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

                await logEvent(interaction.client, knex, {
                    category: 'admin',
                    action: 'retrait admin',
                    actor: `<@${interaction.user.id}>`,
                    detail: `<@${user.id}> (**${userData.minecraft_username}**) · deop + désinscrit${sent ? '' : ' (en file)'}`,
                });

                await interaction.editReply({ content: `<@${user.id}> (**${userData.minecraft_username}**) retiré (deop + désinscrit)` + (sent ? '' : `\n${MC_PENDING}`) });
            } catch (error) {
                await replyError(interaction, error);
            }
            return;
        }
    },
};
