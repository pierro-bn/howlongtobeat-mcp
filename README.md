# HowLongToBeat MCP

Serveur MCP en lecture seule pour rechercher des jeux et consulter leurs durées
sur HowLongToBeat, depuis **Claude Code** ou **Codex local** (application, CLI ou
extension). Il utilise le projet [ckatzorke/howlongtobeat](https://github.com/ckatzorke/howlongtobeat)
comme bibliothèque. Aucun compte HowLongToBeat ni clé API n'est nécessaire.

**État de validation :** compilation et 10 tests locaux réussis le 18 octobre 2026,
dont une connexion MCP réelle via stdio et des échanges HTTP simulés avec la
bibliothèque d'origine. Les appels au site réel ont échoué depuis l'environnement
de développement (HTTP 403). La récupération réelle des durées **n'est pas encore
validée**. Le serveur expose cette indisponibilité comme une erreur MCP.

## Installation locale

Prérequis : Node.js 22 ou plus et npm. Depuis le dossier du projet :

```sh
npm ci --ignore-scripts
npm run build
npm test
```

Le fichier à lancer est `dist/index.js`. Utiliser son **chemin absolu**, entre
guillemets si nécessaire. `npm start` lance également le serveur ; l'absence
de sortie est normale, il attend des messages MCP sur stdin.

Ce projet fonctionne localement sans publication GitHub ou npm. Le manifeste
contient `private: true` pour empêcher une publication npm accidentelle.

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
et image. Chaque résultat inclut la source, l'heure de récupération et le lien
vers le jeu. Les données sont rendues à la fois en texte JSON et dans
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
- `null` indique une valeur absente, invalide ou arrondie à zéro par la bibliothèque.
- La recherche d'origine arrondit les durées à l'heure entière. Le parseur de
  fiches conserve les demi-heures mais ramène les durées en minutes à une heure
  et calcule la moyenne des intervalles. Le serveur ne prétend pas améliorer
  cette précision ; `precision` indique le mode de récupération.
- Vérifier `time_labels` : la bibliothèque peut ranger Solo, Co-Op et Vs. dans
  les trois champs `main`, `main_extra`, `completionist`. Ce ne sont alors pas
  nécessairement trois niveaux de complétion d'une campagne.
- Un ID HLTB n'est **pas** un ID Steam. La similarité mesure le texte du titre,
  pas la certitude qu'il s'agit du bon jeu ou de la bonne édition.
- La bibliothèque ne renvoie que la première page (jusqu'à 20 résultats).
  `coverage` et `truncated` décrivent cette limite. `no_results` ne prouve pas
  l'absence du jeu dans tout le catalogue.
- Aucun cache persistant, aucune écriture distante et aucune télémétrie ajoutée.
  Les titres recherchés et IDs sont envoyés à HowLongToBeat par la bibliothèque.
- Le site n'offre pas ici une API contractuelle : blocages réseau et changements
  de format peuvent rendre la bibliothèque inutilisable. Les descriptions
  récupérées doivent être traitées comme du contenu externe non fiable.

## Tests et diagnostic

```sh
npm test
npm run test:live
npm audit --omit=dev
```

Les tests ordinaires n'accèdent pas au site : validation, erreurs, durées
inconnues, limites, annulation, timeout, protocole stdio et compatibilité Axios
avec les formats simulés du fournisseur. `test:live` interroge vraiment Portal
via le processus MCP et renvoie un code non nul si la recherche ou la fiche
échoue. Il ne fait pas partie de la CI déterministe.

Codes d'erreur : `UPSTREAM_UNAVAILABLE`, `UPSTREAM_FORMAT_CHANGED`, `TIMEOUT`,
`CANCELLED`, `INTERNAL_ERROR`. Une erreur de lecture n'est jamais convertie en
résultat vide. Le délai global est de 25 secondes, avec annulation transmise à
la bibliothèque ; ses propres requêtes HTTP ont un délai de 20 secondes.

En cas d'erreur : vérifier l'accès au site depuis la machine du client puis
relancer `test:live`. Un HTTP 403 ne permet pas de distinguer à lui seul un
blocage réseau, un refus du site ou une route devenue obsolète. Ne pas désactiver
TLS ou contourner les restrictions d'accès pour faire passer le test.

La CI préparée couvre Node 22/24 sur Windows/Linux. Elle n'a pas été exécutée sur
GitHub tant que le dépôt n'est pas publié. Aucune configuration personnelle
Claude/Codex n'est modifiée par les commandes de compilation ou de test.

## Licence et provenance

MIT pour le serveur MCP ; WTFPL v2 pour la bibliothèque d'origine. Voir
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Le verrouillage npm inclut une
mise à jour d'Axios imposée à la dépendance amont pour éviter sa version 0.22.
