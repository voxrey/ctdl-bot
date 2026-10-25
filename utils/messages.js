const { MessageFlags, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

// Formulaire d'inscription : menu de choix d'équipe
function buildInscriptionMessage(teams) {
    const row = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_team')
                .setPlaceholder('Choisissez votre équipe')
                .addOptions(
                    teams.map(team => ({
                        label: team.label,
                        value: team.id.toString(),
                    }))
                ),
        );

    return {
        content: 'Choisissez votre équipe pour vous inscrire.',
        components: [row]
    };
}

async function sendLoginInstructions(user) {
    try {
        await user.send(`Connectez vous sur **${process.env.MC_ADDRESS}** en version **${process.env.MC_VERSION}**\nPuis tapez dans le chat \`/login <mot de passe>\` avec le mot de passe reçu à l'inscription\nVous en aurez besoin à chaque connexion\nMot de passe perdu ? Tapez \`/password\` sur le Discord pour en obtenir un nouveau\nVous serez automatiquement mis dans la bonne équipe\nSi vous rencontrez un problème veuillez contacter un modérateur`);
        return true;
    } catch (error) {
        console.error('Impossible d\'envoyer le DM:', error);
        return false;
    }
}

// Le mot de passe n'est stocké nulle part côté bot : il n'est affiché qu'une fois
function passwordMessage(password) {
    return `Votre mot de passe Minecraft : \`${password}\`\nNotez-le, il ne sera plus affiché. \`/password\` pour en générer un nouveau ou choisir le vôtre.`;
}

const MC_UNAVAILABLE = 'Le serveur Minecraft est indisponible pour le moment, réessayez dans quelques minutes.';

// Message montré aux joueurs : le détail technique reste dans les logs
const INSCRIPTION_ERROR = 'Une erreur est survenue lors de l\'inscription. Veuillez contacter un modérateur.';

// Répond avec l'erreur, que l'interaction ait déjà été répondue/différée ou non
async function replyError(interaction, error, content = `Erreur: ${error.message}`) {
    const payload = { content, flags: MessageFlags.Ephemeral };
    const method = interaction.deferred ? 'editReply' : interaction.replied ? 'followUp' : 'reply';
    await interaction[method](payload).catch(console.error);
}

module.exports = { sendLoginInstructions, passwordMessage, replyError, buildInscriptionMessage, INSCRIPTION_ERROR, MC_UNAVAILABLE };
