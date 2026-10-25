const { MessageFlags } = require('discord.js');
const { generatePassword } = require('./password');
const { sendLoginInstructions, passwordMessage, replyError, INSCRIPTION_ERROR, MC_UNAVAILABLE } = require('./messages');
const { sendMinecraftCommand } = require('./pterodactyl');

async function handleInscription(interaction, knex, selectedTeamId, pseudo) {
    const discordId = interaction.user.id;

    const existingUser = await knex('users').where('discord_id', discordId).first();

    if (existingUser) {
        await interaction.reply({ content: `Vous êtes déjà inscrit. Veuillez contacter un modérateur si rencontrer un problème.`, flags: MessageFlags.Ephemeral });
        return;
    }

    // Règle des pseudos Minecraft ; empêche aussi d'injecter des arguments dans les commandes console
    if (!/^[A-Za-z0-9_]{3,16}$/.test(pseudo)) {
        await interaction.reply({ content: `Pseudo invalide : 3 à 16 caractères, lettres, chiffres et _ uniquement`, flags: MessageFlags.Ephemeral });
        return;
    }

    // Minecraft ne distingue pas les majuscules dans les pseudos
    const existingPseudo = await knex('users').whereRaw('lower(minecraft_username) = ?', pseudo.toLowerCase()).first();

    if (existingPseudo) {
        await interaction.reply({ content: `Ce pseudo est déjà pris`, flags: MessageFlags.Ephemeral });
        return;
    }

    const team = await knex('teams').where('id', parseInt(selectedTeamId)).first();

    if (!team) {
        await interaction.reply({ content: `Erreur: Équipe invalide`, flags: MessageFlags.Ephemeral });
        return;
    }

    // Vérifier que les rôles existent et que le bot peut les donner, avant toute écriture
    const appState = await knex('app_state').first();
    const teamRole = interaction.guild.roles.cache.get(team.role_id);
    const inscritRole = appState?.inscrit_role_id ? interaction.guild.roles.cache.get(appState.inscrit_role_id) : null;

    if (!teamRole?.editable || (appState?.inscrit_role_id && !inscritRole?.editable)) {
        console.error(`Inscription impossible : rôle d'équipe (${team.role_id}) ou rôle "Inscrit" (${appState?.inscrit_role_id}) introuvable ou non attribuable par le bot`);
        await interaction.reply({ content: INSCRIPTION_ERROR, flags: MessageFlags.Ephemeral });
        return;
    }

    try {
        await knex('users').insert({ discord_id: discordId, minecraft_username: pseudo, team_id: team.id });

        // `authme password` après `register` : fixe le mot de passe même si le compte AuthMe existait déjà
        const password = generatePassword();
        try {
            await sendMinecraftCommand(process.env.PT_SERVER_ID, `authme register ${pseudo} ${password}`);
            await sendMinecraftCommand(process.env.PT_SERVER_ID, `authme password ${pseudo} ${password}`);
            await sendMinecraftCommand(process.env.PT_SERVER_ID, `tteamregister ${pseudo} ${team.label}`);
        } catch (mcError) {
            // Sans compte Minecraft, le mot de passe affiché serait inutilisable : on annule l'inscription
            console.error('Erreur enregistrement Minecraft:', mcError.message);
            await knex('users').where('discord_id', discordId).delete();
            await interaction.reply({ content: MC_UNAVAILABLE, flags: MessageFlags.Ephemeral });
            return;
        }

        const isRelease = appState && appState.release;

        if (isRelease) {
            await sendLoginInstructions(interaction.user);
        }

        await interaction.member.roles.add([teamRole, inscritRole].filter(Boolean));

        const dmMessage = isRelease
            ? 'Vous avez reçu les instructions de connexion par DM.'
            : 'Vous recevrez les instructions de connexion par DM à l\'ouverture du serveur.';
        await interaction.reply({
            content: `Inscrit dans **${team.label}** avec le pseudo **${pseudo}**\n\n${passwordMessage(password)}\n\n${dmMessage}`,
            flags: MessageFlags.Ephemeral
        });
    } catch (err) {
        console.error('Erreur inscription:', err);
        await replyError(interaction, err, INSCRIPTION_ERROR);
    }
}

module.exports = { handleInscription };
