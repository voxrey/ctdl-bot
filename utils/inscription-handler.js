const { MessageFlags } = require('discord.js');
const { generatePassword } = require('./password');
const { sendLoginInstructions, replyError, INSCRIPTION_ERROR } = require('./messages');
const { sendMinecraftCommand } = require('./pterodactyl');

async function handleInscription(interaction, knex, selectedTeamId, pseudo) {
    const discordId = interaction.user.id;

    const existingUser = await knex('users').where('discord_id', discordId).first();

    if (existingUser) {
        await interaction.reply({ content: `Vous êtes déjà inscrit. Veuillez contacter un modérateur si rencontrer un problème.`, flags: MessageFlags.Ephemeral });
        return;
    }

    const existingPseudo = await knex('users').where('minecraft_username', pseudo).first();

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
        const password = generatePassword();

        await knex('users')
            .insert({ discord_id: discordId, minecraft_username: pseudo, team_id: team.id, password: password })
            .onConflict('discord_id')
            .merge();

        // Enregistrer le joueur sur le serveur Minecraft
        try {
            await sendMinecraftCommand(process.env.PT_SERVER_ID, `authme register ${pseudo} ${password}`);
            await sendMinecraftCommand(process.env.PT_SERVER_ID, `tteamregister ${pseudo} ${team.label}`);
        } catch (error) {
            console.error('Erreur enregistrement Minecraft:', error.message);
        }

        const isRelease = appState && appState.release;

        if (isRelease) {
            await sendLoginInstructions(interaction.user, password);
        }

        await interaction.member.roles.add([teamRole, inscritRole].filter(Boolean));

        const dmMessage = isRelease
            ? '\nVous avez reçu les instructions de connexion par DM.'
            : '\nVous recevrez les instructions de connexion par DM ultérieurement.';
        await interaction.reply({ content: `Inscrit dans **${team.label}** avec le pseudo **${pseudo}**${dmMessage}`, flags: MessageFlags.Ephemeral });
    } catch (err) {
        console.error('Erreur inscription:', err);
        await replyError(interaction, err, INSCRIPTION_ERROR);
    }
}

module.exports = { handleInscription };
