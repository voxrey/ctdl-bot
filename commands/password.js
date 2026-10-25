const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { generatePassword, PASSWORD_REGEX } = require('../utils/password');
const { passwordMessage, replyError, MC_UNAVAILABLE } = require('../utils/messages');
const { sendMinecraftCommand } = require('../utils/pterodactyl');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('password')
        .setDescription('Génère un nouveau mot de passe Minecraft, ou choisit le vôtre')
        .addStringOption(option =>
            option.setName('mot_de_passe')
                .setDescription('16 à 30 caractères, sans espace ni accent')
                .setMinLength(16)
                .setMaxLength(30)
                .setRequired(false)),

    async execute(interaction, knex) {
        try {
            const user = await knex('users').where('discord_id', interaction.user.id).first();
            if (!user) {
                await interaction.reply({ content: 'Vous n\'êtes pas inscrit.', flags: MessageFlags.Ephemeral });
                return;
            }

            const chosen = interaction.options.getString('mot_de_passe');
            if (chosen && !PASSWORD_REGEX.test(chosen)) {
                await interaction.reply({ content: 'Mot de passe invalide : 16 à 30 caractères, sans espace ni accent.', flags: MessageFlags.Ephemeral });
                return;
            }

            const password = chosen || generatePassword();
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            try {
                await sendMinecraftCommand(process.env.PT_SERVER_ID, `authme password ${user.minecraft_username} ${password}`);
            } catch (mcError) {
                console.error('Erreur changement mot de passe:', mcError.message);
                await interaction.editReply({ content: MC_UNAVAILABLE });
                return;
            }

            await interaction.editReply({ content: passwordMessage(password) });
        } catch (error) {
            await replyError(interaction, error);
        }
    }
};
