# Bot Discord CTDL

Bot qui fait le lien entre le Discord et le serveur Minecraft du CTDL : inscription des joueurs par équipe, création des comptes AuthMe, gestion des équipes et salons vocaux temporaires.

## Installation

Node.js 22 requis.

```bash
npm install
```

Créer un fichier `.env` à la racine :

```env
DISCORD_TOKEN=

# Pterodactyl, laisser vide en local
PT_HOST=
PT_TOKEN=
PT_SERVER_ID=

# Affichés dans le MP de connexion
MC_ADDRESS=mc.bde-imtbs-tsp.fr
MC_VERSION=1.21.x
```

Si une des variables `PT_*` est vide, les commandes Minecraft ne sont pas envoyées, elles sont juste affichées dans la console (`[MC simulé] ...`). Pratique pour tester sans serveur.

Le bot a besoin des intents privilégiés **Server Members** et **Message Content** (à activer sur le portail développeur Discord), et des permissions pour gérer les rôles, les salons et déplacer des membres.

## Lancement

```bash
npm run dev   # avec rechargement auto
npm start
```

La base SQLite (`db/database.db`) est créée et migrée automatiquement au démarrage.

## Mise en place sur un serveur

1. `/team add nom:<équipe>` pour chaque équipe (crée le rôle, la catégorie privée, un salon texte et un vocal « Créer un salon »)
2. `/setup channel:<salon> role_inscrit:<rôle>` pour poster le formulaire d'inscription
3. Le jour J, `/release active:true` envoie à chaque inscrit ses identifiants de connexion en MP

## Commandes

Toutes réservées aux administrateurs.

| Commande | |
|---|---|
| `/team list\|add\|remove\|stats` | Équipes et statistiques d'inscription |
| `/user list\|info\|unregister` | Joueurs inscrits |
| `/channel list\|add\|remove` | Salons vocaux qui créent un salon temporaire |
| `/setup` | Poste le formulaire d'inscription |
| `/release [active]` | Affiche ou change le mode release |

## Migrations

Tant que le bot n'est pas en prod, tout le schéma est dans `migrations/20251126000000_init.js` : on le modifie directement et on supprime `db/database.db` pour repartir de zéro. Les nouvelles migrations, ce sera après la première mise en prod.

```bash
npx knex migrate:make nom_de_la_migration
npx knex migrate:latest
npx knex migrate:rollback
```

## Déploiement

Un service systemd est fourni dans `ctdl.service` (à adapter : chemin, utilisateur, version de Node).

```bash
sudo cp ctdl.service /etc/systemd/system/
sudo systemctl enable --now ctdl
journalctl -u ctdl -f
```
