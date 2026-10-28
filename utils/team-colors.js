// Couleurs Minecraft (code BetterTeams `teama color`) et leur équivalent pour le rôle Discord
const TEAM_COLORS = [
    { code: 'c', name: 'Rouge', hex: 0xFF5555 },
    { code: '4', name: 'Rouge foncé', hex: 0xAA0000 },
    { code: '6', name: 'Orange', hex: 0xFFAA00 },
    { code: 'e', name: 'Jaune', hex: 0xFFFF55 },
    { code: 'a', name: 'Vert', hex: 0x55FF55 },
    { code: '2', name: 'Vert foncé', hex: 0x00AA00 },
    { code: 'b', name: 'Cyan', hex: 0x55FFFF },
    { code: '3', name: 'Cyan foncé', hex: 0x00AAAA },
    { code: '9', name: 'Bleu', hex: 0x5555FF },
    { code: '1', name: 'Bleu foncé', hex: 0x0000AA },
    { code: 'd', name: 'Rose', hex: 0xFF55FF },
    { code: '5', name: 'Violet', hex: 0xAA00AA },
    { code: 'f', name: 'Blanc', hex: 0xFFFFFF },
    { code: '7', name: 'Gris', hex: 0xAAAAAA },
    { code: '8', name: 'Gris foncé', hex: 0x555555 },
];

const colorChoices = TEAM_COLORS.map(c => ({ name: c.name, value: c.code }));

module.exports = { TEAM_COLORS, colorChoices };
