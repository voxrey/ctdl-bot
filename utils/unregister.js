const { sendMinecraftCommand } = require('./pterodactyl');

// Désinscrit un joueur : Minecraft, rôles Discord (équipes + "Inscrit") et base
async function unregisterUser(guild, knex, user) {
    try {
        await sendMinecraftCommand(process.env.PT_SERVER_ID, `authme unregister ${user.minecraft_username}`);
        await sendMinecraftCommand(process.env.PT_SERVER_ID, `tteamunregister ${user.minecraft_username}`);
        await sendMinecraftCommand(process.env.PT_SERVER_ID, `kick ${user.minecraft_username}`);
    } catch (mcError) {
        console.error(`Erreur désinscription Minecraft ${user.minecraft_username}:`, mcError);
    }

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
}

module.exports = { unregisterUser };
