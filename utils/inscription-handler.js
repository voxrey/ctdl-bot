const { MessageFlags } = require('discord.js');
const { generatePassword } = require('./password');
const { sendLoginInstructions, passwordMessage, replyError, INSCRIPTION_ERROR, MC_UNAVAILABLE } = require('./messages');
const { runMinecraftCommands } = require('./mc-queue');

// Inscrit `member` (par défaut l'auteur du formulaire ; un autre membre pour /user register ou l'acceptation d'une demande).
// Le mot de passe est montré à l'auteur de l'interaction, en éphémère — sauf `deliverPasswordByDm`, qui l'envoie en DM au
// joueur inscrit (acceptation d'une demande en attente : celui qui clique n'est pas le joueur, il ne doit pas voir le mot de passe).
// Renvoie true si l'inscription a réussi, false sinon (déjà inscrit, pseudo invalide/pris, serveur indisponible, erreur).
async function handleInscription(interaction, knex, selectedTeamId, pseudo, member = interaction.member, options = {}) {
    const { deliverPasswordByDm = false } = options;
    const discordId = member.id;
    const byAdmin = member.id !== interaction.user.id;

    const existingUser = await knex('users').where('discord_id', discordId).first();

    if (existingUser) {
        const content = byAdmin
            ? `<@${discordId}> est déjà inscrit (**${existingUser.minecraft_username}**)`
            : `Vous êtes déjà inscrit. Veuillez contacter un modérateur si rencontrer un problème.`;
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        return false;
    }

    // Règle des pseudos Minecraft ; empêche aussi d'injecter des arguments dans les commandes console
    if (!/^[A-Za-z0-9_]{3,16}$/.test(pseudo)) {
        await interaction.reply({ content: `Pseudo invalide : 3 à 16 caractères, lettres, chiffres et _ uniquement`, flags: MessageFlags.Ephemeral });
        return false;
    }

    // Minecraft ne distingue pas les majuscules dans les pseudos
    const existingPseudo = await knex('users').whereRaw('lower(minecraft_username) = ?', pseudo.toLowerCase()).first();

    if (existingPseudo) {
        await interaction.reply({ content: `Ce pseudo est déjà pris`, flags: MessageFlags.Ephemeral });
        return false;
    }

    const team = await knex('teams').where('id', parseInt(selectedTeamId)).first();

    if (!team) {
        await interaction.reply({ content: `Erreur: Équipe invalide`, flags: MessageFlags.Ephemeral });
        return false;
    }

    // Vérifier que les rôles existent et que le bot peut les donner, avant toute écriture
    const appState = await knex('app_state').first();
    const teamRole = interaction.guild.roles.cache.get(team.role_id);
    const inscritRole = appState?.inscrit_role_id ? interaction.guild.roles.cache.get(appState.inscrit_role_id) : null;

    if (!teamRole?.editable || (appState?.inscrit_role_id && !inscritRole?.editable)) {
        console.error(`Inscription impossible : rôle d'équipe (${team.role_id}) ou rôle "Inscrit" (${appState?.inscrit_role_id}) introuvable ou non attribuable par le bot`);
        await interaction.reply({ content: INSCRIPTION_ERROR, flags: MessageFlags.Ephemeral });
        return false;
    }

    // Les commandes Minecraft peuvent dépasser les 3 s laissées par Discord pour répondre
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        await knex('users').insert({ discord_id: discordId, minecraft_username: pseudo, team_id: team.id });

        // `authme password` après `register` : fixe le mot de passe même si le compte AuthMe existait déjà.
        // Mode direct : une commande avec mot de passe n'est jamais mise en file (rien n'est stocké)
        const password = generatePassword();
        try {
            await runMinecraftCommands(knex, [`authme register ${pseudo} ${password}`, `authme password ${pseudo} ${password}`], 'direct');
        } catch (mcError) {
            // Sans compte Minecraft, le mot de passe affiché serait inutilisable : on annule l'inscription
            console.error('Erreur enregistrement Minecraft:', mcError.message);
            await knex('users').where('discord_id', discordId).delete();
            await interaction.editReply({ content: MC_UNAVAILABLE });
            return false;
        }

        await runMinecraftCommands(knex, [`marche admin team set ${pseudo} ${team.label}`]);

        // Le joueur est inscrit : plus aucune demande en attente ne le concerne (il a rejoint une équipe)
        await knex('pending_registrations').where('discord_id', discordId).delete();

        const isRelease = appState && appState.release;

        if (isRelease) {
            await sendLoginInstructions(member.user);
        }

        await member.roles.add([teamRole, inscritRole].filter(Boolean));

        // Acceptation d'une demande : le mot de passe part en DM au joueur, jamais montré à celui qui a cliqué
        if (deliverPasswordByDm) {
            let dmOk = true;
            try {
                await member.user.send(passwordMessage(password));
            } catch (dmError) {
                console.error('Impossible d\'envoyer le mot de passe en DM:', dmError);
                dmOk = false;
            }
            await interaction.editReply({
                content: `<@${discordId}> inscrit dans **${team.label}** avec le pseudo **${pseudo}**\n\n` +
                         (dmOk
                            ? 'Son mot de passe Minecraft lui a été envoyé en DM.'
                            : '⚠️ Impossible de lui envoyer son mot de passe en DM (DM fermés). Il doit utiliser `/password` pour en générer un.')
            });
            return true;
        }

        if (byAdmin) {
            await interaction.editReply({
                content: `<@${discordId}> inscrit dans **${team.label}** avec le pseudo **${pseudo}**\n\n` +
                         `Mot de passe Minecraft à lui transmettre : \`${password}\`\nIl ne sera plus affiché. Le joueur peut en générer un autre avec \`/password\`.`
            });
            return true;
        }

        const dmMessage = isRelease
            ? 'Vous avez reçu les instructions de connexion par DM.'
            : 'Vous recevrez les instructions de connexion par DM à l\'ouverture du serveur.';
        await interaction.editReply({
            content: `Inscrit dans **${team.label}** avec le pseudo **${pseudo}**\n\n${passwordMessage(password)}\n\n${dmMessage}`
        });
        return true;
    } catch (err) {
        console.error('Erreur inscription:', err);
        await replyError(interaction, err, INSCRIPTION_ERROR);
        return false;
    }
}

module.exports = { handleInscription };
