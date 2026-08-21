# PrintPilot Hi

Assistant personnel pour analyser un STL ou un projet 3MF, choisir des réglages adaptés à une Creality Hi, gérer un inventaire de filaments et exporter un projet Creality Print contrôlé.

## Auto-hébergement avec Docker

Cette édition fonctionne entièrement en local. Wrangler fournit le moteur Cloudflare Workers et une base D1 locale persistée dans un volume Docker : aucun compte Cloudflare ni service ChatGPT n’est nécessaire.

### Démarrage

```sh
cp selfhost.env.example .env
docker compose up -d --build
```

L’application est ensuite disponible sur `http://localhost:3000`. Pour utiliser un autre port, modifiez `PRINTPILOT_PORT` dans `.env`.

### Données et mises à jour

- L’inventaire et l’historique sont conservés dans le volume `printpilot_data`.
- Les migrations de base de données sont appliquées automatiquement au démarrage.
- `docker compose down` conserve les données.
- `docker compose down -v` supprime définitivement la base locale.
- Pour mettre à jour : récupérez les nouveaux commits puis relancez `docker compose up -d --build`.

### Identité et sécurité

L’application utilise Google OpenID Connect. Chaque inventaire et historique est isolé par l’adresse e-mail du compte connecté.

1. Dans Google Cloud Console, créez un client OAuth de type **Application Web**.
2. Ajoutez l’URI de redirection exacte : `http://localhost:3000/auth/google/callback`.
3. Copiez l’identifiant et le secret du client dans `.env`.
4. Générez un secret de session avec `openssl rand -base64 48`.

Exemple :

```dotenv
PRINTPILOT_PORT=3000
PUBLIC_APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
SESSION_SECRET=une-valeur-aleatoire-d-au-moins-32-caracteres
AUTH_DISABLED=false
```

`PUBLIC_APP_URL` et l’URI enregistrée chez Google doivent correspondre exactement, port compris. Pour un domaine public, utilisez HTTPS et remplacez l’URI par `https://votre-domaine/auth/google/callback`.

Si les journaux indiquent `TLS peer's certificate is not trusted`, reconstruisez l’image Docker à jour : elle installe explicitement le bundle d’autorités de certification utilisé par `workerd`.

```sh
docker compose build --no-cache printpilot
docker compose up -d --force-recreate
```

Sur un réseau d’entreprise qui intercepte HTTPS, le certificat racine interne doit également être ajouté au conteneur via `NODE_EXTRA_CA_CERTS` ou `SSL_CERT_FILE`. Ne désactivez pas la validation TLS.

Pour un dépannage local temporaire uniquement, `AUTH_DISABLED=true` réactive le compte local défini par `SELF_HOSTED_USER_EMAIL`. Ne l’utilisez pas sur une instance accessible depuis Internet.

#### Reprendre les données du compte local

Les anciennes données restent associées à `owner@printpilot.local`. Après une première connexion Google, remplacez `votre@gmail.com` par l’adresse réellement utilisée puis exécutez une seule fois :

```sh
docker compose exec printpilot /app/node_modules/.bin/wrangler d1 execute DB \
  --config /app/wrangler.selfhost.jsonc --local --persist-to /data \
  --command "UPDATE filaments SET user_email='votre@gmail.com' WHERE user_email='owner@printpilot.local'; UPDATE print_projects SET user_email='votre@gmail.com' WHERE user_email='owner@printpilot.local'; UPDATE calibrations SET user_email='votre@gmail.com' WHERE user_email='owner@printpilot.local'; UPDATE print_runs SET user_email='votre@gmail.com' WHERE user_email='owner@printpilot.local';"
```

Faites d’abord une sauvegarde du volume. Cette commande change uniquement le propriétaire logique des lignes ; elle ne supprime ni les bobines ni l’historique.

### Sauvegarde

Pour sauvegarder tout le volume :

```sh
docker run --rm -v printpilot-hi_printpilot_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/printpilot-data.tar.gz -C /data .
```

Le nom réel du volume peut varier avec le nom du dossier ou le nom de projet Compose. Utilisez `docker volume ls` si nécessaire.

### Utilisation sans Docker

Le projet reste compatible avec son environnement Vinext/Cloudflare d’origine. Les commandes de développement sont décrites plus bas.

## Architecture

Application Next/Vinext exécutée par Wrangler, avec base D1 locale, authentification Google OIDC et stockage persistant dans le volume Docker.

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`

## Développement

- le code applicatif se trouve dans `app/` ;
- `app/auth.ts` signe et vérifie les sessions Google ;
- `db/` contient le schéma Drizzle ;
- `drizzle/` contient les migrations appliquées au démarrage ;
- `tests/` vérifie l’analyse des supports et les exports 3MF.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build and verify the rendered development-preview metadata
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
