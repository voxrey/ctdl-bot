const net = require('node:net');

const RCON_HOST = process.env.RCON_HOST || '127.0.0.1';
const RCON_PORT = Number(process.env.RCON_PORT || 25575);
const RCON_PASSWORD = process.env.RCON_PASSWORD;
const TIMEOUT_MS = 5000;

const RCON_ENABLED = Boolean(RCON_PASSWORD);

// Paquet RCON (protocole Source) : taille, id, type, corps, deux octets nuls
function packet(id, type, body) {
    const payload = Buffer.from(body, 'utf8');
    const buf = Buffer.alloc(14 + payload.length);
    buf.writeInt32LE(10 + payload.length, 0);
    buf.writeInt32LE(id, 4);
    buf.writeInt32LE(type, 8);
    payload.copy(buf, 12);
    return buf;
}

// Une connexion par appel : authentifie, envoie la commande, renvoie la réponse.
// Sans commande, s'arrête après l'authentification.
// Le serveur éteint ou injoignable (tunnel SSH fermé) donne une erreur.
function rconExec(command) {
    return new Promise((resolve, reject) => {
        const socket = net.connect({ host: RCON_HOST, port: RCON_PORT });
        let data = Buffer.alloc(0);
        let authed = false;

        const fail = (error) => { socket.destroy(); reject(error); };
        socket.setTimeout(TIMEOUT_MS, () => fail(new Error('RCON timeout')));
        socket.on('error', fail);
        socket.on('connect', () => socket.write(packet(1, 3, RCON_PASSWORD)));

        socket.on('data', chunk => {
            data = Buffer.concat([data, chunk]);
            while (data.length >= 4 && data.length >= 4 + data.readInt32LE(0)) {
                const size = data.readInt32LE(0);
                const id = data.readInt32LE(4);
                const body = data.subarray(12, 4 + size - 2).toString('utf8');
                data = data.subarray(4 + size);

                if (!authed) {
                    if (id === -1) return fail(new Error('RCON: mot de passe refusé'));
                    authed = true;
                    if (command === undefined) {
                        socket.end();
                        return resolve('');
                    }
                    socket.write(packet(2, 2, command));
                } else {
                    socket.end();
                    return resolve(body);
                }
            }
        });
    });
}

async function getServerState() {
    try {
        await rconExec();
        return 'running';
    } catch {
        return 'offline';
    }
}

async function sendCommand(command) {
    await rconExec(command);
}

module.exports = { RCON_ENABLED, getServerState, sendCommand };
