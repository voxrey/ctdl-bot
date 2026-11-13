const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, MessageFlags, ChannelType } = require('discord.js');

// Une demande d'adhésion en attente expire 24 h après sa création (réunion 2026-11-13).
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

// Salon où poster la demande : le "général" de la catégorie de l'équipe, sinon le premier salon textuel de la catégorie.
function findTeamChannel(guild, team) {
    if (!team.category_id) return null;
    const channels = guild.channels.cache.filter(
        c => c.parentId === team.category_id && c.type === ChannelType.GuildText
    );
    return channels.find(c => c.name === 'général') || channels.first() || null;
}

function confirmButtons(discordId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`reg_accept_${discordId}`).setLabel('Accepter').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`reg_reject_${discordId}`).setLabel('Refuser').setStyle(ButtonStyle.Danger),
    );
}

// Édite le message d'une demande (retire les boutons) ; ignore une erreur (message supprimé à la main).
async function editPendingMessage(client, pending, content) {
    try {
        const channel = await client.channels.fetch(pending.channel_id);
        const message = await channel.messages.fetch(pending.message_id);
        await message.edit({ content, components: [] });
    } catch (error) {
        console.error('Erreur mise à jour message de demande:', error);
    }
}

async function dmApplicant(client, discordId, content) {
    try {
        const user = await client.users.fetch(discordId);
        await user.send(content);
    } catch (error) {
        console.error('Impossible d\'envoyer le DM au demandeur:', error);
    }
}

// Qui peut accepter/refuser : un membre inscrit de l'équipe, ou un administrateur (réunion 2026-11-13).
async function canConfirm(interaction, knex, teamId) {
    if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) return true;
    const user = await knex('users').where('discord_id', interaction.user.id).first();
    return !!user && user.team_id === teamId;
}

// Crée une demande en attente (phase inscriptions fermées). Valide comme une inscription, puis poste un message
// à boutons dans le salon de l'équipe. Une nouvelle demande remplace l'ancienne du même joueur.
async function createPendingRequest(interaction, knex, team, pseudo) {
    const discordId = interaction.user.id;

    const existingUser = await knex('users').where('discord_id', discordId).first();
    if (existingUser) {
        await interaction.reply({ content: 'Vous êtes déjà inscrit.', flags: MessageFlags.Ephemeral });
        return;
    }

    if (!/^[A-Za-z0-9_]{3,16}$/.test(pseudo)) {
        await interaction.reply({ content: 'Pseudo invalide : 3 à 16 caractères, lettres, chiffres et _ uniquement', flags: MessageFlags.Ephemeral });
        return;
    }

    const lower = pseudo.toLowerCase();
    const takenByUser = await knex('users').whereRaw('lower(minecraft_username) = ?', lower).first();
    // Pseudo déjà réservé par une autre demande en attente (pas la sienne, qu'on va remplacer)
    const takenByPending = await knex('pending_registrations')
        .whereRaw('lower(pseudo) = ?', lower).whereNot('discord_id', discordId).first();
    if (takenByUser || takenByPending) {
        await interaction.reply({ content: 'Ce pseudo est déjà pris', flags: MessageFlags.Ephemeral });
        return;
    }

    const channel = findTeamChannel(interaction.guild, team);
    if (!channel) {
        await interaction.reply({
            content: 'Impossible de poster la demande : l\'équipe n\'a pas de salon. Contactez un modérateur.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Remplace une éventuelle demande précédente du même joueur (autre équipe, autre pseudo)
    const previous = await knex('pending_registrations').where('discord_id', discordId).first();
    if (previous) {
        await editPendingMessage(interaction.client, previous, '↩️ Demande remplacée par une nouvelle.');
    }

    const message = await channel.send({
        content: `<@${discordId}> souhaite rejoindre **${team.label}** (pseudo Minecraft : **${pseudo}**).\n` +
                 `Un membre inscrit de l'équipe peut **Accepter** ou **Refuser**.`,
        components: [confirmButtons(discordId)],
    });

    await knex('pending_registrations')
        .insert({ discord_id: discordId, team_id: team.id, pseudo, channel_id: channel.id, message_id: message.id, created_at: Date.now() })
        .onConflict('discord_id').merge();

    await interaction.reply({
        content: `Demande envoyée à l'équipe **${team.label}**. Un membre de l'équipe doit l'accepter ; ` +
                 `vous serez prévenu. La demande expire au bout de 24 h.`,
        flags: MessageFlags.Ephemeral
    });
}

// Refuse/expire toutes les demandes de plus de 24 h.
async function sweepExpired(knex, discordClient) {
    const cutoff = Date.now() - PENDING_TTL_MS;
    const expired = await knex('pending_registrations').where('created_at', '<', cutoff);
    for (const pending of expired) {
        await editPendingMessage(discordClient, pending, '⌛ Demande expirée (24 h sans réponse).');
        await dmApplicant(discordClient, pending.discord_id, 'Votre demande d\'adhésion a expiré (24 h sans réponse). Vous pouvez en refaire une.');
        await knex('pending_registrations').where('discord_id', pending.discord_id).delete();
    }
}

module.exports = {
    PENDING_TTL_MS,
    createPendingRequest,
    canConfirm,
    editPendingMessage,
    dmApplicant,
    sweepExpired,
};
