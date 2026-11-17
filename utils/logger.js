// Journalise tout dans le salon de logs (app_state.log_channel_id, défini par /logs) et, en secours,
// dans la sortie standard de l'hôte. Ne lève jamais : un échec de log ne doit pas casser une commande.

// Options dont la valeur ne doit jamais apparaître dans les logs (mots de passe).
const SECRET_OPTIONS = new Set(['mot_de_passe', 'password']);

async function postLog(client, knex, content) {
    try {
        const appState = await knex('app_state').first();
        const id = appState?.log_channel_id;
        if (!id) return;
        const channel = await client.channels.fetch(id).catch(() => null);
        if (!channel || typeof channel.send !== 'function') return;
        // allowedMentions vide : les <@id> s'affichent sans notifier personne
        await channel.send({ content: content.slice(0, 2000), allowedMentions: { parse: [] } });
    } catch (error) {
        console.error('Erreur log Discord:', error.message);
    }
}

function line(category, action, actor, detail) {
    const t = `<t:${Math.floor(Date.now() / 1000)}:T>`;
    let out = `${t} \`${category}\` **${action}**`;
    if (actor) out += ` · ${actor}`;
    if (detail) out += ` — ${detail}`;
    return out;
}

// category: étiquette courte (commande, inscription, desinscription, admin, erreur, systeme).
// actor: mention <@id> ou nom. detail: texte libre (jamais de mot de passe).
async function logEvent(client, knex, { category, action, actor = null, detail = null }) {
    console.log(`[LOG] ${category} | ${action}${actor ? ' | ' + actor : ''}${detail ? ' | ' + detail : ''}`);
    await postLog(client, knex, line(category, action, actor, detail));
}

// Décrit les options d'une commande pour le log, en masquant les secrets.
function describeOptions(interaction) {
    const sub = interaction.options.getSubcommand(false);
    const parts = sub ? [sub] : [];
    for (const opt of interaction.options.data) {
        const children = opt.options || [];
        for (const o of (children.length ? children : opt.type <= 2 ? [] : [opt])) {
            if (o.name === undefined) continue;
            const value = SECRET_OPTIONS.has(o.name) ? '***' : (o.user ? `<@${o.value}>` : o.value);
            parts.push(`${o.name}:${value}`);
        }
    }
    return parts.join(' ');
}

// Journalise l'appel d'une commande slash (qui, quoi, avec quelles options non secrètes).
async function logCommand(interaction, knex) {
    await logEvent(interaction.client, knex, {
        category: 'commande',
        action: `/${interaction.commandName}`,
        actor: `<@${interaction.user.id}>`,
        detail: describeOptions(interaction) || null,
    });
}

module.exports = { logEvent, logCommand, postLog };
