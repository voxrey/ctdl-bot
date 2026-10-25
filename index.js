require('dotenv').config({ quiet: true });

const { Client, GatewayIntentBits, ChannelType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, REST, Routes } = require('discord.js');
const knexConfig = require('./knexfile');
const fs = require('fs');
const path = require('path');

const knex = require('knex')(knexConfig.development);
const token = process.env.DISCORD_TOKEN;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
    ]
});

const commands = new Map();
const commandsData = [];

// Charger toutes les commandes
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    commands.set(command.data.name, command);
    commandsData.push(command.data.toJSON());
}

const { handleInscription } = require('./utils/inscription-handler');
const { replyError, INSCRIPTION_ERROR } = require('./utils/messages');
const { sendMinecraftCommand, getServerState } = require('./utils/pterodactyl');

// Supprime les salons temporaires vidés ou supprimés pendant que le bot était éteint
async function cleanTempChannels() {
    const rows = await knex('temp_channels').select('channel_id');
    for (const { channel_id } of rows) {
        const channel = await client.channels.fetch(channel_id).catch(() => null);
        if (channel && channel.members.size > 0) continue;

        if (channel) {
            await channel.delete().catch(error => console.error('Erreur suppression salon temporaire:', error));
        }
        await knex('temp_channels').where('channel_id', channel_id).delete();
    }
}

client.once('clientReady', async () => {
    try {
        await knex.migrate.latest();

        const appState = await knex('app_state').first();
        if (!appState) {
            await knex('app_state').insert({ release: false });
        }

        await cleanTempChannels();

        const rest = new REST({ version: '10' }).setToken(token);
        await rest.put(Routes.applicationCommands(client.user.id), { body: commandsData });
        console.log(`Connecté: ${client.user.tag}`);

        await sendMinecraftCommand(process.env.PT_SERVER_ID, 'say Bot connecté');
    } catch (error) {
        console.error('Erreur:', error);
    }
});

async function handleVoiceStateUpdate(oldState, newState) {
    const channels = await knex('trigger_channels').select('channel_id');
    const triggerChannelIds = channels.map(ch => ch.channel_id);

    if (newState.channelId && triggerChannelIds.includes(newState.channelId)) {
        const member = newState.member;
        const guild = newState.guild;
        const triggerChannel = newState.channel;
        const category = triggerChannel.parent;

        try {
            // Reprendre les permissions de la catégorie, ou du salon déclencheur s'il n'est dans aucune catégorie
            const categoryPermissions = (category ?? triggerChannel).permissionOverwrites.cache.map(overwrite => ({
                id: overwrite.id,
                allow: overwrite.allow.bitfield,
                deny: overwrite.deny.bitfield
            }));

            // Ajouter les permissions du créateur
            categoryPermissions.push({
                id: member.id,
                allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MuteMembers, PermissionsBitField.Flags.DeafenMembers],
            });

            const newChannel = await guild.channels.create({
                name: `Salon de ${member.displayName}`,
                type: ChannelType.GuildVoice,
                parent: category,
                permissionOverwrites: categoryPermissions,
            });

            await knex('temp_channels').insert({ channel_id: newChannel.id, owner_id: member.id });
            await member.voice.setChannel(newChannel);
        } catch (error) {
            console.error("Erreur:", error);
        }
    }

    if (oldState.channelId && oldState.channelId !== newState.channelId) {
        const isTemp = await knex('temp_channels').where('channel_id', oldState.channelId).first();
        if (isTemp) {
            const channelToDelete = await oldState.guild.channels.fetch(oldState.channelId).catch(() => null);

            if (!channelToDelete || channelToDelete.members.size === 0) {
                await channelToDelete?.delete();
                await knex('temp_channels').where('channel_id', oldState.channelId).delete();
            }
        }
    }
}

client.on('voiceStateUpdate', (oldState, newState) => {
    handleVoiceStateUpdate(oldState, newState).catch(error => console.error('Erreur salon vocal:', error));
});

client.on('guildMemberAdd', async member => {
    try {
        await member.send({
            content: `Bienvenue sur le serveur ${member.guild.name} ! 👋\n\n` +
                     `**Instructions d'inscription :**\n` +
                     `Pour rejoindre le serveur, vous devez vous inscrire dans le channel **#inscription** :\n` +
                     `• Choisissez votre team\n` +
                     `• Entrez votre pseudo Minecraft\n\n` +
                     `**Pas encore de compte Minecraft ?**\n` +
                     `Suivez le tutoriel dans le channel **#tuto** pour en obtenir un.`
        });
    } catch (error) {
        console.error('Erreur lors de l\'envoi du DM au nouveau membre:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (command) {
            try {
                await command.execute(interaction, knex, client);
            } catch (error) {
                // 10062 : interaction expirée (> 3 s sans réponse), inutile de retenter
                if (error.code === 10062) {
                    console.error(`Interaction expirée (/${interaction.commandName})`);
                    return;
                }
                console.error('Erreur commande:', error);
                await replyError(interaction, error);
            }
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_team') {
            const selectedTeamId = interaction.values[0];

            const modal = new ModalBuilder()
                .setCustomId(`modal_minecraft_pseudo_${selectedTeamId}`)
                .setTitle('Inscription Minecraft');

            const { ActionRowBuilder } = require('discord.js');
            const pseudoInput = new TextInputBuilder()
                .setCustomId('pseudoInput')
                .setLabel("Pseudo Minecraft")
                .setStyle(TextInputStyle.Short)
                .setMinLength(3)
                .setMaxLength(16)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(pseudoInput));
            await interaction.showModal(modal).catch(error => {
                console.error('Erreur formulaire:', error);
                return replyError(interaction, error, INSCRIPTION_ERROR);
            });
        }
    } else if (interaction.type === InteractionType.ModalSubmit) {
        if (interaction.customId.startsWith('modal_minecraft_pseudo_')) {
            const selectedTeamId = interaction.customId.split('modal_minecraft_pseudo_')[1];
            const pseudo = interaction.fields.getTextInputValue('pseudoInput');
            await handleInscription(interaction, knex, selectedTeamId, pseudo).catch(error => {
                console.error('Erreur inscription:', error);
                return replyError(interaction, error, INSCRIPTION_ERROR);
            });
        }
    }
});

// Filet de sécurité : une erreur oubliée est loguée au lieu d'arrêter le bot
process.on('unhandledRejection', error => console.error('Erreur non gérée:', error));

// Arrêt propre : en conteneur, node ne réagit pas à SIGTERM par défaut
for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, async () => {
        await client.destroy();
        await knex.destroy();
        process.exit(0);
    });
}

client.login(token);
