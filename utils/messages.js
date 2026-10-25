const { MessageFlags } = require('discord.js');

async function sendLoginInstructions(user, password) {
    try {
        await user.send(`Connectez vous sur **mc.bde-imtbs-tsp.fr** en version **1.20.6**\nPuis tapez dans le chat \`/login ${password}\`\nVous en aurez besoin à chaque connexion\nVous serez automatiquement mis dans la bonne équipe\nSi vous rencontrez un problème veuillez contacter un modérateur`);
        return true;
    } catch (error) {
        console.error('Impossible d\'envoyer le DM:', error);
        return false;
    }
}

// Message montré aux joueurs : le détail technique reste dans les logs
const INSCRIPTION_ERROR = 'Une erreur est survenue lors de l\'inscription. Veuillez contacter un modérateur.';

// Répond avec l'erreur, que l'interaction ait déjà été répondue/différée ou non
async function replyError(interaction, error, content = `Erreur: ${error.message}`) {
    const payload = { content, flags: MessageFlags.Ephemeral };
    const method = interaction.deferred ? 'editReply' : interaction.replied ? 'followUp' : 'reply';
    await interaction[method](payload).catch(console.error);
}

module.exports = { sendLoginInstructions, replyError, INSCRIPTION_ERROR };
