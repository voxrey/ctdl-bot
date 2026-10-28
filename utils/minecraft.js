// Choix du lien avec la console Minecraft :
// - Pterodactyl si PT_HOST, PT_TOKEN et PT_SERVER_ID sont remplis
// - sinon RCON si RCON_PASSWORD est rempli
// - sinon simulé (commandes affichées dans la console)
const pterodactyl = require('./pterodactyl');
const rcon = require('./rcon');

const backend = pterodactyl.PT_ENABLED ? 'pterodactyl' : rcon.RCON_ENABLED ? 'rcon' : 'simulé';
const { getServerState, sendCommand } = backend === 'rcon' ? rcon : pterodactyl;

console.log(`Lien Minecraft : ${backend}`);

module.exports = { getServerState, sendCommand };
