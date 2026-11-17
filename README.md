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
GUILD_ID=        # id du serveur Discord du bot

# Lien avec la console Minecraft : Pterodactyl OU RCON (voir plus bas)
PT_HOST=
PT_TOKEN=
PT_SERVER_ID=
RCON_HOST=127.0.0.1
RCON_PORT=25575
RCON_PASSWORD=
MC_QUEUE_INTERVAL=30   # secondes entre deux envois de la file Minecraft

# Affichés dans le MP de connexion
MC_ADDRESS=mc.bde-imtbs-tsp.fr
MC_VERSION=1.21.x
```

Le bot choisit le lien au démarrage et l'affiche (`Lien Minecraft : ...`) :
- **Pterodactyl** si `PT_HOST`, `PT_TOKEN` et `PT_SERVER_ID` sont remplis ;
- sinon **RCON** si `RCON_PASSWORD` est rempli ;
- sinon **simulé** : les commandes ne sont pas envoyées, juste affichées dans la console (`[MC simulé] ...`). Pratique pour tester sans serveur.

### RCON (serveur hors Pterodactyl, par exemple sur verso)

RCON est la console à distance intégrée à Minecraft. Elle passe en clair : le serveur ne l'écoute que sur sa propre machine (`127.0.0.1`), et le bot y accède par un tunnel SSH. Le serveur prêt à l'emploi de `../server/` est réglé ainsi, et `init.sh` y écrit le mot de passe dans `.rcon-password`.

1. Ouvrir le tunnel, dans un terminal à part (le laisser tourner) :
   ```bash
   ssh -N -L 25575:127.0.0.1:25575 verso
   ```
2. Dans `.env` : `RCON_HOST=127.0.0.1`, `RCON_PORT=25575`, `RCON_PASSWORD=` le contenu de `~/ctdl/server/.rcon-password` sur verso (`ssh verso cat ctdl/server/.rcon-password`). Laisser les `PT_*` vides.
3. `npm start`. Le bot doit afficher `Lien Minecraft : rcon`.

Tunnel fermé ou serveur éteint : le bot voit le serveur comme indisponible et met les commandes en file (voir ci-dessous). Une connexion RCON est ouverte par commande, rien à relancer quand le tunnel revient.

Dans un conteneur (`podman compose`), `127.0.0.1` désigne le conteneur, pas la machine : lancer le bot avec `npm start` pour les tests, ou mettre `network_mode: host` dans `compose.yaml`.

Quand le serveur Minecraft est éteint, les commandes du bot sont mises en file (table `mc_commands`) et envoyées dans l'ordre à son retour : toutes les `MC_QUEUE_INTERVAL` secondes et avant chaque nouvelle commande. `/mc pending` affiche la file. Les commandes contenant un mot de passe ne sont jamais mises en file : l'inscription et `/password` sont refusées tant que le serveur est indisponible, et les `kick` sont abandonnés.

Les équipes Minecraft passent par le plugin CtdlShop (plus de Skript) : `marche admin team set <pseudo> <équipe>` à l'inscription et pour `/user team` (quitte l'ancienne équipe, rejoint la nouvelle tout de suite si le joueur est connecté, sinon à sa prochaine connexion), et `marche admin team clear <pseudo>` à la désinscription. `marche admin team pending` (console Minecraft) liste les joueurs pas encore connectés. Le serveur a donc besoin de BetterTeams et CtdlShop.

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
3. `/tuto salon:<salon>` pour le salon de tutoriel indiqué dans le message de bienvenue
4. `/logs salon:<salon>` pour le salon de journalisation du bot
5. Le jour J, `/release active:true` envoie à chaque inscrit l'adresse et la version du serveur en MP

## Mots de passe

Le bot ne stocke aucun mot de passe : AuthMe s'en charge. À l'inscription, le joueur reçoit un mot de passe de 4 mots anglais (liste de l'EFF), affiché une seule fois. `/password` en génère un nouveau, `/password mot_de_passe:...` permet de choisir le sien (16 à 30 caractères, sans espace ni accent, comme l'impose AuthMe).

## Commandes

Toutes réservées aux administrateurs, sauf `/password`.

| Commande | |
|---|---|
| `/team list\|add\|remove\|stats` | Équipes et statistiques d'inscription |
| `/user list\|info\|unregister\|register\|team` | Joueurs inscrits ; inscription et changement d'équipe par un admin |
| `/admin register\|unregister` | Admins Minecraft : un admin s'enregistre lui-même (compte AuthMe + op, sans équipe) ; retrait = deop + désinscription |
| `/channel list\|add\|remove` | Salons vocaux qui créent un salon temporaire |
| `/setup` | Poste le formulaire d'inscription |
| `/tuto [salon]` | Salon de tutoriel du message de bienvenue |
| `/logs [salon]` | Définit ou affiche le salon de journalisation |
| `/release [active]` | Affiche ou change le mode release |
| `/mc pending` | Commandes Minecraft en attente |
| `/password [mot_de_passe]` | Nouveau mot de passe Minecraft (joueurs inscrits) |

## Administrateurs Minecraft

L'équipe des admins n'existe pas comme les autres : un admin s'enregistre lui-même avec `/admin register pseudo:<pseudo>` (réservé à la permission Discord *Administrator*). Le bot crée son compte AuthMe, l'op (donc exempté de `require-team`, il joue sans équipe) et l'enregistre (`users.is_admin`, sans équipe).

Une personne non enregistrée n'est jamais op : toute désinscription (`/user unregister`, `/admin unregister`) `deop` le pseudo en plus de `authme unregister`, pour qu'un désinscrit ne reste pas dans `ops.json`. Le `deop` passe par la file : il part au retour du serveur même si celui-ci était éteint.

## Journalisation

Tout passe dans le salon défini par `/logs` (`app_state.log_channel_id`) et, en secours, dans la sortie standard de l'hôte : appels de commandes (avec options, mots de passe masqués), inscriptions, désinscriptions, enregistrements/retraits d'admins (op/deop), connexion du bot et erreurs. Les logs n'envoient aucune notification (mentions désactivées) et ne stockent jamais de mot de passe.

## Migrations

Le schéma de départ est dans `migrations/20251126000000_init.js`. Le bot applique les migrations manquantes à chaque démarrage (`knex.migrate.latest()`).

**Tout changement de schéma passe par une nouvelle migration**, jamais par une modification de `init` : knex ne rejoue pas une migration déjà appliquée, donc une base existante ne recevrait pas le changement. C'est ce qui a cassé le play test 4 (`no such table: pending_registrations`) ; `20261116000000_registrations_repair.js` rattrape ces bases.

```bash
npx knex migrate:make nom_de_la_migration
npx knex migrate:latest
npx knex migrate:rollback
```

## Déploiement

Avec Podman ou Docker, à partir du `.env` :

```bash
podman compose up -d --build   # construit l'image et lance le bot
podman compose logs -f
podman compose down            # la base reste dans le volume db
```

Si le bot tourne sur la même machine que le serveur, RCON marche sans tunnel (`RCON_HOST=127.0.0.1`), avec `network_mode: host` pour le conteneur.

Le bot tourne en utilisateur non-root dans le conteneur, la base SQLite est dans le volume `db`. Avec Podman, activer `podman-restart.service` pour que le bot redémarre après un reboot.
