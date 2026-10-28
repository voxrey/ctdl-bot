const PT_HOST = process.env.PT_HOST;
const PT_TOKEN = process.env.PT_TOKEN;
const PT_SERVER_ID = process.env.PT_SERVER_ID;

// Sans configuration Pterodactyl, les commandes sont simulées (utile en dev)
const PT_ENABLED = Boolean(PT_HOST && PT_TOKEN && PT_SERVER_ID);

async function pterodactylRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${PT_TOKEN}`,
            'Accept': 'Application/vnd.pterodactyl.v1+json',
            'Content-Type': 'application/json'
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${PT_HOST}/api/client${endpoint}`, options);

    if (!response.ok) {
        throw new Error(`Pterodactyl API error: ${response.status} ${response.statusText}`);
    }

    // Si status 204 (No Content), ne pas tenter de parser le JSON
    if (response.status === 204) {
        return null;
    }

    return await response.json();
}

async function getServerState() {
    if (!PT_ENABLED) {
        return 'running';
    }

    const data = await pterodactylRequest(`/servers/${PT_SERVER_ID}/resources`);
    return data.attributes.current_state;
}

// Envoi brut, sans vérifier l'état : passer par utils/mc-queue.js
async function sendCommand(command) {
    if (!PT_ENABLED) {
        console.log(`[MC simulé] ${command}`);
        return;
    }

    await pterodactylRequest(`/servers/${PT_SERVER_ID}/command`, 'POST', { command });
}

module.exports = { PT_ENABLED, getServerState, sendCommand };
