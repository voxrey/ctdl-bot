const { runMinecraftCommands } = require('./mc-queue');

// Désinscrit un joueur : Minecraft, rôles Discord (équipes + "Inscrit") et base.
// Renvoie false si la désinscription Minecraft est restée en file
async function unregisterUser(guild, knex, user) {
    const sent = await runMinecraftCommands(knex, [`authme unregister ${user.minecraft_username}`, `tteamunregister ${user.minecraft_username}`]);
    await runMinecraftCommands(knex, [`kick ${user.minecraft_username}`], 'optional');

    // Le membre a pu quitter le serveur
    try {
        const member = await guild.members.fetch(user.discord_id).catch(() => null);
        if (member) {
            const teams = await knex('teams').select('role_id');
            const appState = await knex('app_state').first();
            const roleIds = [...teams.map(t => t.role_id), appState?.inscrit_role_id];

            const rolesToRemove = roleIds.filter(roleId => roleId && member.roles.cache.has(roleId));
            if (rolesToRemove.length > 0) {
                await member.roles.remove(rolesToRemove);
            }
        }
    } catch (roleError) {
        console.error(`Erreur retrait rôles ${user.discord_id}:`, roleError);
    }

    await knex('users').where('discord_id', user.discord_id).delete();
    return sent;
}

module.exports = { unregisterUser };
