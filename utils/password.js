const { randomInt } = require('crypto');
const fs = require('fs');
const path = require('path');

// Liste large de l'EFF https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt, CC BY 3.0 US.
const WORDS = fs.readFileSync(path.join(__dirname, 'eff_large_wordlist.txt'), 'utf8')
    .split('\n')
    .map(line => line.split('\t')[1])
    .filter(word => word && /^[a-z]+$/.test(word));

if (WORDS.length !== 7772) {
    throw new Error('eff_large_wordlist.txt invalide');
}

// Règles d'AuthMe : ASCII imprimable, sans espace, 30 max
const PASSWORD_REGEX = /^[!-~]{16,30}$/;

function generatePassword() {
    let password;
    do {
        const words = [];
        for (let i = 0; i < 4; i++) {
            const word = WORDS[randomInt(WORDS.length)];
            words.push(word[0].toUpperCase() + word.slice(1));
        }
        password = words.join('-');
    } while (!PASSWORD_REGEX.test(password));
    return password;
}

module.exports = { generatePassword, PASSWORD_REGEX };
