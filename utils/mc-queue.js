const { getServerState, sendCommand } = require('./minecraft');

// Un seul envoi à la fois (timer et commandes utilisateur), pour garder l'ordre de la file
let lock = Promise.resolve();
function withLock(fn) {
    const run = lock.then(fn);
    lock = run.catch(() => {});
    return run;
}

async function isServerRunning() {
    try {
        return (await getServerState()) === 'running';
    } catch (error) {
        console.error('Erreur état serveur Minecraft:', error.message);
        return false;
    }
}

// Envoie la file dans l'ordre ; une commande n'est retirée qu'une fois envoyée.
// S'arrête à la première erreur, la suite reste en file.
async function sendPending(knex) {
    const pending = await knex('mc_commands').orderBy('id');
    for (const { id, command } of pending) {
        await sendCommand(command);
        await knex('mc_commands').where('id', id).delete();
    }
}

// Appelé toutes les MC_QUEUE_INTERVAL secondes
function flushQueue(knex) {
    return withLock(async () => {
        // File vide : rien à envoyer, on ne contacte pas le serveur (pas de bruit dans ses logs)
        const { count } = await knex('mc_commands').count('* as count').first();
        if (count === 0) return;
        if (!(await isServerRunning())) return;
        try {
            await sendPending(knex);
        } catch (error) {
            console.error('Erreur envoi file Minecraft:', error.message);
        }
    });
}

/**
 * Envoie des commandes Minecraft, après celles déjà en file.
 * Si le serveur est indisponible, selon le mode :
 * - 'queue'    : mises en file, envoyées à son retour (par défaut)
 * - 'direct'   : erreur, rien n'est stocké (commandes avec un mot de passe)
 * - 'optional' : abandonnées (kick, annonces)
 * Renvoie true si tout est parti, false sinon.
 */
function runMinecraftCommands(knex, commands, mode = 'queue') {
    return withLock(async () => {
        const remaining = [...commands];

        if (await isServerRunning()) {
            try {
                await sendPending(knex);
                while (remaining.length > 0) {
                    await sendCommand(remaining[0]);
                    remaining.shift();
                }
                return true;
            } catch (error) {
                console.error('Erreur envoi commande Minecraft:', error.message);
            }
        }

        if (mode === 'direct') {
            throw new Error('Serveur Minecraft indisponible');
        }
        if (mode === 'queue') {
            await knex('mc_commands').insert(remaining.map(command => ({ command })));
        } else {
            console.log(`[MC abandonné, serveur indisponible] ${remaining.join(' | ')}`);
        }
        return false;
    });
}

/**
 * Envoie des commandes tout de suite, sans file, et renvoie leurs réponses (codes couleur retirés).
 * Renvoie null si le serveur est indisponible ; une réponse vaut null si le lien n'en donne pas (Pterodactyl, simulé).
 */
function queryMinecraft(knex, commands) {
    return withLock(async () => {
        if (!(await isServerRunning())) return null;
        try {
            await sendPending(knex);
            const outputs = [];
            for (const command of commands) {
                const out = await sendCommand(command);
                outputs.push(typeof out === 'string' ? out.replace(/§[0-9a-fk-orx]/gi, '').trim() : null);
            }
            return outputs;
        } catch (error) {
            console.error('Erreur envoi commande Minecraft:', error.message);
            return null;
        }
    });
}

module.exports = { runMinecraftCommands, queryMinecraft, flushQueue };
