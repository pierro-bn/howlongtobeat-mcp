# HowLongToBeat MCP

[![Soutenir sur Ko-fi](https://img.shields.io/badge/Ko--fi-Soutenir%20le%20projet-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/pierrobn)
[![CI](https://github.com/pierro-bn/howlongtobeat-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/pierro-bn/howlongtobeat-mcp/actions/workflows/ci.yml)

Serveur MCP en lecture seule pour rechercher des jeux et consulter leurs durées
sur HowLongToBeat, depuis **Claude Code** ou **Codex local** (application, CLI ou
extension). Basé sur [ckatzorke/howlongtobeat](https://github.com/ckatzorke/howlongtobeat),
il conserve le modèle de jeu et le calcul de similarité d'origine, avec un accès
réseau adapté au site actuel. Aucun compte HowLongToBeat ni clé API n'est nécessaire.

Projet communautaire indépendant, sans affiliation avec HowLongToBeat.

## Installation locale

Prérequis : **Node.js 22 ou plus**, npm et Git.

```sh
git clone https://github.com/pierro-bn/howlongtobeat-mcp.git
cd howlongtobeat-mcp
npm ci --ignore-scripts
npm run build
```

Le fichier à lancer est `dist/index.js`. Utiliser son **chemin absolu**, entre
guillemets si nécessaire. `npm start` lance également le serveur ; l'absence
de sortie est normale, il attend des messages MCP sur stdin.

Le projet est distribué sous forme de sources sur GitHub, sans publication npm.
Le champ `private: true` du manifeste empêche une publication npm accidentelle ;
il ne concerne pas la visibilité du dépôt GitHub.

## Claude Code

```sh
claude mcp add --transport stdio --scope user howlongtobeat -- node "/chemin/absolu/howlongtobeat-mcp/dist/index.js"
claude mcp list
```

Sur Windows, remplacer le chemin par exemple par
`C:/outils/howlongtobeat-mcp/dist/index.js`. Si `node` n'est pas dans le PATH du
client, utiliser le chemin absolu de `node.exe`.

Pour une configuration par projet, fusionner cette entrée dans `.mcp.json`
sans écraser les autres serveurs :

```json
{
  "mcpServers": {
    "howlongtobeat": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/outils/howlongtobeat-mcp/dist/index.js"]
    }
  }
}
```

Relancer Claude Code, puis vérifier `/mcp`.
[Documentation Claude Code](https://code.claude.com/docs/en/mcp).

## Codex

```sh
codex mcp add howlongtobeat -- node "/chemin/absolu/howlongtobeat-mcp/dist/index.js"
codex mcp list
```

Autre possibilité : ajouter cette section dans `~/.codex/config.toml` en
préservant la configuration existante :

```toml
[mcp_servers.howlongtobeat]
command = "node"
args = ["C:/outils/howlongtobeat-mcp/dist/index.js"]
startup_timeout_sec = 15
tool_timeout_sec = 40
```

Redémarrer le client ou ouvrir une nouvelle session pour charger le serveur.
[Documentation officielle MCP de Codex](https://developers.openai.com/codex/mcp).

**ChatGPT dans un navigateur :** le site web ne lit pas le fichier local de
Codex. Ce serveur expose uniquement stdio, sans endpoint HTTP public. Pour un
environnement ChatGPT disposant de [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels),
le processus local peut être relié par le tunnel selon les accès du compte.
Le tunnel n'est pas installé ni configuré par ce projet. Publier du code sur
GitHub ne crée pas un endpoint MCP accessible à ChatGPT.

## Outils

| Outil | Paramètres | Résultat |
| --- | --- | --- |
| `hltb_search_games` | `query` (1–200 caractères), `limit` (1–20, défaut 5), `detail` | Première page de résultats avec IDs HLTB, titres, durées et similarité du titre |
| `hltb_get_game` | `game_id` (ID HLTB numérique sous forme de chaîne), `detail` | Fiche d'un jeu avec ses durées |

`detail` vaut `compact` par défaut ; `detailed` ajoute description, plateformes
et image lorsqu'elles sont disponibles. Pour la description complète, utiliser
`hltb_get_game` : la recherche ne fournit généralement pas de résumé.
Chaque réponse réussie inclut la source et l'heure de récupération ; chaque jeu
inclut son lien HowLongToBeat. Les données sont rendues à la fois en texte JSON et dans
`structuredContent` pour les clients MCP compatibles.

Exemples d'appels :

```json
{"query":"Portal","limit":3}
```

```json
{"game_id":"7230","detail":"detailed"}
```

Exemples de demandes à l'assistant :

- « Combien de temps faut-il pour terminer Portal, avec et sans les objectifs secondaires ? »
- « Cherche Hollow Knight sur HowLongToBeat et montre-moi la fiche correspondante. »

## Interprétation et limites

- Les durées sont des estimations en **heures**, pas des garanties.
- `null` indique une estimation absente ou nulle dans la source.
- Les champs `comp_main`, `comp_plus` et `comp_100` sont convertis de secondes en
  heures sans arrondi à l'heure entière. `precision` vaut
  `source_seconds_converted_to_hours`. Les chiffres peuvent différer des valeurs
  arrondies affichées sur le site ; ils restent des estimations communautaires.
- `time_labels` décrit les trois catégories de complétion. Le temps multijoueur
  n'est pas substitué à une durée de campagne manquante.
- Un ID HLTB n'est **pas** un ID Steam. La similarité mesure le texte du titre,
  pas la certitude qu'il s'agit du bon jeu ou de la bonne édition.
- Le serveur demande uniquement la première page, avec une taille de 20 résultats.
  `coverage` indique cette couverture limitée ; `truncated` indique seulement si
  `limit` a écarté des jeux de cette page. `truncated: false` ne signifie donc pas
  que tout le catalogue a été parcouru. `no_results` ne prouve pas l'absence du jeu.
- Aucun cache persistant, aucune écriture distante et aucune télémétrie ajoutée.
  La session de recherche est conservée en mémoire pendant dix minutes et
  renouvelée une seule fois si la recherche reçoit HTTP 401/403.
  Les titres recherchés et IDs sont envoyés directement à HowLongToBeat par le serveur.
- Le site n'offre pas ici une API contractuelle : blocages réseau et changements
  de format peuvent rendre le fournisseur inutilisable. Les descriptions
  récupérées doivent être traitées comme du contenu externe non fiable.

## Tests et diagnostic

Validation du 18 octobre 2026 : **20 tests réussis**, compilation réussie et
recherche de Portal avec lecture de sa fiche vérifiées sur le site réel via MCP
stdio. La CI a également réussi sur Windows/Linux avec Node 22 et 24. Ces tests
ne garantissent pas la disponibilité future du site.

```sh
npm test
npm run test:live
npm audit --omit=dev
```

Les tests ordinaires n'accèdent pas au site : validation, erreurs, durées
inconnues, limites, annulation, timeout, protocole stdio, initialisation et
renouvellement de session, erreurs HTTP et données structurées de fiche.
Un test conserve la vérification de la bibliothèque d'origine avec Axios.
`test:live` interroge vraiment Portal via le processus MCP et renvoie un code non nul si la recherche ou la fiche
échoue. Il ne fait pas partie de la CI déterministe.

Codes d'erreur : `UPSTREAM_UNAVAILABLE`, `UPSTREAM_FORMAT_CHANGED`,
`UPSTREAM_FORBIDDEN`, `UPSTREAM_RATE_LIMITED`, `UPSTREAM_NOT_FOUND`, `TIMEOUT`,
`CANCELLED`, `INTERNAL_ERROR`. Une erreur de lecture n'est jamais convertie en
résultat vide. Le délai global est de 25 secondes pour l'ensemble d'un appel,
avec annulation transmise à chaque requête HTTP. Un HTTP 429 n'est pas retenté.

En cas d'erreur : vérifier l'accès au site depuis la machine du client puis
relancer `test:live`. Un HTTP 403 ne permet pas de distinguer à lui seul un
blocage réseau, un refus du site ou une route devenue obsolète. Ne pas désactiver
TLS ou contourner les restrictions d'accès pour faire passer le test.

La CI couvre Node 22/24 sur Windows/Linux. Aucune configuration personnelle
Claude/Codex n'est modifiée par les commandes de compilation ou de test.

## Mise à jour

Depuis le dossier du dépôt, avec une copie de travail sans modifications locales :

```sh
git pull --ff-only
npm ci --ignore-scripts
npm run build
```

Redémarrer ensuite le client MCP pour qu'il lance la nouvelle version compilée.

## Soutenir le projet

Si ce serveur MCP vous est utile, vous pouvez soutenir son développement et sa maintenance avec un don facultatif sur [Ko-fi](https://ko-fi.com/pierrobn). Merci pour votre soutien !

## Licence et provenance

MIT pour le serveur MCP ; WTFPL v2 pour la bibliothèque d'origine. Le modèle
`HowLongToBeatEntry` et le calcul de similarité d'origine sont conservés.
L'accès réseau et la lecture des fiches sont implémentés dans `src/provider.ts`
pour suivre le format actuel du site. Voir
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Le verrouillage npm inclut une
mise à jour d'Axios imposée à la dépendance amont pour éviter sa version 0.22.
